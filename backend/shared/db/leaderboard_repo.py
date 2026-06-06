# shared/db/leaderboard_repo.py
"""Read/write access to fatchad_leaderboard (gameplay Lambda).

A standalone table for the two public boards, so leaderboard churn never
touches user data. Key shapes + layout live in shared/db/keys.py (the
fatchad_leaderboard section). Two invariants this repo upholds:

  * Score lives in the board SK (zero-padded), so updating a row is
    delete-old + put-new, never a plain put — a plain put would strand the row
    under its old score.
  * The run board caps each account at MAX_RUNS_PER_USER published runs. The
    per-account LBRUN#<uid> index is the source of truth for the cap and the
    replace picker; each index row carries the full denormalised LbRunEntry so
    listing a player's runs is one Query with no board cross-reads.

Writes are sequenced (not transactional) — boto3's resource layer doesn't
expose TransactWriteItems cleanly, matching the convention in user_repo. The
publish/replace path deletes the outgoing run's rows BEFORE writing the new
ones, so a mid-way failure can only ever leave a player UNDER the cap, never
over it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from boto3.dynamodb.conditions import Key

from shared.db._serde import item_to_dict, model_to_item
from shared.db.ddb import leaderboard_table
from shared.db.keys import (
    LBRUN_MEMBER_PREFIX,
    POINTS_SCOPE,
    RUNS_SCOPE,
    leaderboard_member_key,
    leaderboard_member_pk,
    leaderboard_pk,
    leaderboard_points_key,
    leaderboard_run_key,
)
from shared.schemas import LbPointsEntry, LbRunEntry

# Each account may keep at most this many runs on the highscore board. Publishing
# a 6th forces a replace (the caller picks which of the five to drop).
MAX_RUNS_PER_USER = 5

PublishStatus = Literal["published", "already_published", "full", "bad_replace"]


@dataclass
class PublishOutcome:
    """Result of publish_run, mapped to HTTP by the route.

    * published         — the run was added (`evicted_run_id` set if a replace happened)
    * already_published — this run is already on the board (no-op)
    * full              — at the cap and no valid replacement chosen; `current`
                          carries the player's five runs so the client can prompt
    * bad_replace       — `replace_run_id` isn't one of the player's published runs
    """
    status: PublishStatus
    evicted_run_id: str | None = None
    current: list[LbRunEntry] | None = None


class LeaderboardRepo:
    """All fatchad_leaderboard operations: the points board, the run board, and
    the per-account published-run index."""

    def __init__(self):
        self._t = leaderboard_table()

    # -------------------------------------------------------------------------
    # Points board (PK = LB#points) — one row per account
    # -------------------------------------------------------------------------

    def top_points(self, limit: int = 100) -> list[LbPointsEntry]:
        """Highest career-point accounts first. Padded score in the SK means
        reverse iteration is already numeric order — no client-side sort."""
        resp = self._t.query(
            KeyConditionExpression=Key("PK").eq(leaderboard_pk(POINTS_SCOPE)),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [LbPointsEntry.model_validate(item_to_dict(i)) for i in resp.get("Items", [])]

    def sync_points(
        self, user_id: str, display_name: str, new_score: int, old_score: int
    ) -> None:
        """Move an account's points row to a new score (delete-old + put-new,
        because the score is in the SK). `old_score <= 0` means there's no prior
        row yet, so we only put. Delete first so a crash can't leave two rows
        for one account under different scores."""
        if new_score < 0:
            return
        if old_score > 0 and old_score != new_score:
            self._t.delete_item(Key=leaderboard_points_key(user_id, old_score))

        entry = LbPointsEntry(
            user_id=user_id,
            display_name=display_name,
            score=new_score,
            updated_at=datetime.now(timezone.utc),
        )
        key = leaderboard_points_key(user_id, new_score)
        self._t.put_item(Item=model_to_item(entry, key["PK"], key["SK"]))

    # -------------------------------------------------------------------------
    # Run board (PK = LB#longest) + per-account index (PK = LBRUN#<uid>)
    # -------------------------------------------------------------------------

    def top_runs(self, limit: int = 100) -> list[LbRunEntry]:
        """Longest-surviving runs first (score = rounds survived)."""
        resp = self._t.query(
            KeyConditionExpression=Key("PK").eq(leaderboard_pk(RUNS_SCOPE)),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [LbRunEntry.model_validate(item_to_dict(i)) for i in resp.get("Items", [])]

    def list_user_runs(self, user_id: str) -> list[LbRunEntry]:
        """A player's published runs, oldest-first. One Query over the
        LBRUN#<uid> index (rows carry the full payload); the <=5 results are
        sorted by publish time here rather than in the SK."""
        resp = self._t.query(
            KeyConditionExpression=Key("PK").eq(leaderboard_member_pk(user_id))
            & Key("SK").begins_with(LBRUN_MEMBER_PREFIX),
        )
        runs = [LbRunEntry.model_validate(item_to_dict(i)) for i in resp.get("Items", [])]
        runs.sort(key=lambda e: e.published_at)
        return runs

    def publish_run(
        self, entry: LbRunEntry, replace_run_id: str | None = None
    ) -> PublishOutcome:
        """Add a finished run to the highscore board, enforcing the 5-run cap.

        At the cap, the caller must name which existing run to drop
        (`replace_run_id`); without one we return `full` + the current five so
        the client can prompt. The replaced run's rows are deleted before the
        new ones are written, so the account is never momentarily over the cap.
        """
        existing = self.list_user_runs(entry.user_id)

        if any(e.run_id == entry.run_id for e in existing):
            return PublishOutcome(status="already_published", current=existing)

        evicted: str | None = None
        if len(existing) >= MAX_RUNS_PER_USER:
            if replace_run_id is None:
                return PublishOutcome(status="full", current=existing)
            target = next((e for e in existing if e.run_id == replace_run_id), None)
            if target is None:
                return PublishOutcome(status="bad_replace", current=existing)
            self._delete_run_entry(target)
            evicted = target.run_id

        self._put_run_entry(entry)
        return PublishOutcome(status="published", evicted_run_id=evicted)

    def unpublish_run(self, user_id: str, run_id: str) -> bool:
        """Remove one of a player's runs from the board. Returns False if they
        never published it. Looks the row up via the index so we have the score
        needed to rebuild the board SK."""
        target = next(
            (e for e in self.list_user_runs(user_id) if e.run_id == run_id), None
        )
        if target is None:
            return False
        self._delete_run_entry(target)
        return True

    # ----- internal: a run lives as two rows (board + index), written together -

    def _put_run_entry(self, e: LbRunEntry) -> None:
        board = leaderboard_run_key(e.run_id, e.score)
        self._t.put_item(Item=model_to_item(e, board["PK"], board["SK"]))
        member = leaderboard_member_key(e.user_id, e.run_id)
        self._t.put_item(Item=model_to_item(e, member["PK"], member["SK"]))

    def _delete_run_entry(self, e: LbRunEntry) -> None:
        self._t.delete_item(Key=leaderboard_run_key(e.run_id, e.score))
        self._t.delete_item(Key=leaderboard_member_key(e.user_id, e.run_id))
