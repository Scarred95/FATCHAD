"""Read/write access to fatchad_user_data (gameplay Lambda).

Sync boto3 — Lambda is one invocation per container, no async win. Covers
profile, runs, and the run-status-prefix mechanics of the single-table design.
"""
from __future__ import annotations

import json
from decimal import Decimal

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from shared.db.ddb import user_table
from shared.db.keys import (
    RunStatus,
    UserSk,
    directory_pk,
    directory_user_key,
    user_achievement_key,
    user_deck_unlock_key,
    user_pk,
    user_profile_key,
    user_run_key,
)
from shared.schemas import DirectoryEntry, GameState, Profile, UserAchievement, DeckUnlock, Achievement


# =============================================================================
# (de)serialization helpers — same pattern as catalog_repo (duplicated for
# now; if a third repo lands we lift these into shared/db/_serde.py)
# =============================================================================

def _normalize_decimals(obj):
    if isinstance(obj, list):
        return [_normalize_decimals(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _normalize_decimals(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        # User-data numerics are all ints (stats, turn, rng_seed, score).
        return int(obj)
    return obj


def _model_to_item(model, pk: str, sk: str) -> dict:
    data = json.loads(model.model_dump_json())
    data["PK"] = pk
    data["SK"] = sk
    return data


def _item_to_dict(item: dict | None) -> dict | None:
    if item is None:
        return None
    cleaned = {k: v for k, v in item.items() if k not in ("PK", "SK")}
    return _normalize_decimals(cleaned)


_STATUS_TO_SK: dict[str, RunStatus] = {
    "active": "ACTIVE",
    "ended": "ENDED",
    "abandoned": "ABANDONED",
}


def _sk_status(schema_status: str) -> RunStatus:
    """Map schema's lowercase status to the UPPERCASE used in SK strings."""
    if schema_status not in _STATUS_TO_SK:
        raise ValueError(f"Unknown run status: {schema_status!r}")
    return _STATUS_TO_SK[schema_status]


# =============================================================================
# Exceptions
# =============================================================================

class RunConflict(Exception):
    """Raised on attempt to insert a run id that already exists. Routes
    translate this into HTTP 409."""


class StaleRunWrite(Exception):
    """Raised when an optimistic-locked update finds the stored turn already
    moved (a concurrent double-submit). Routes translate this into HTTP 409."""


# =============================================================================
# The repo
# =============================================================================

class UserRepo:
    """All user-data table operations: profile, runs, (later) unlocks + lbs."""

    def __init__(self):
        self._t = user_table()

    # -------------------------------------------------------------------------
    # Profile
    # -------------------------------------------------------------------------

    def get_profile(self, user_id: str) -> Profile | None:
        item = self._t.get_item(Key=user_profile_key(user_id)).get("Item")
        return Profile.model_validate(_item_to_dict(item)) if item else None

    def put_profile(self, profile: Profile) -> None:
        self._t.put_item(
            Item=_model_to_item(profile, user_pk(profile.user_id), UserSk.PROFILE),
        )

    # -------------------------------------------------------------------------
    # Runs
    # -------------------------------------------------------------------------

    def get_run(self, user_id: str, run_id: str) -> GameState | None:
        """Locate a run across status partitions (worst case 3 GetItems).
        ACTIVE-first since the active run is the hot path. A run_id GSI would
        collapse this to one Query, but isn't worth maintaining yet."""
        for status in ("ACTIVE", "ENDED", "ABANDONED"):
            item = self._t.get_item(
                Key=user_run_key(user_id, status, run_id),  # type: ignore[arg-type]
            ).get("Item")
            if item is not None:
                return GameState.model_validate(_item_to_dict(item))
        return None

    def insert_run(self, state: GameState) -> None:
        """Insert a brand-new run. Raises RunConflict on id collision (route
        surfaces it as 409). Not an upsert — silent overwrites corrupt history."""
        sk_status = _sk_status(state.status)
        key = user_run_key(state.user_id, sk_status, state.id)
        try:
            self._t.put_item(
                Item=_model_to_item(state, key["PK"], key["SK"]),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise RunConflict(f"Run {state.id} already exists") from e
            raise

    def update_run(
        self,
        state: GameState,
        *,
        prior_status: str | None = None,
        expected_turn: int | None = None,
    ) -> bool:
        """Save an existing run. Status unchanged (hot path): one PutItem.

        Status changed: the SK changes (RUN#ACTIVE#x → RUN#ENDED#x), so PutItem
        the new key + DeleteItem the old — two writes, no transaction. If the
        delete fails after the put, get_run's ACTIVE-first order reads the right
        row until cleanup. Pass `prior_status` when the status transitioned.

        Pass `expected_turn` to optimistic-lock the same-SK write: the stored
        turn must still equal it or the put fails with StaleRunWrite, blocking a
        concurrent double-submit (a plain put would silently lose one).
        """
        current_sk_status = _sk_status(state.status)
        prior_sk_status = (
            _sk_status(prior_status) if prior_status else current_sk_status
        )
        status_changed = current_sk_status != prior_sk_status

        new_key = user_run_key(state.user_id, current_sk_status, state.id)
        item = _model_to_item(state, new_key["PK"], new_key["SK"])

        if expected_turn is not None and not status_changed:
            try:
                self._t.put_item(
                    Item=item,
                    ConditionExpression="#t = :t",
                    ExpressionAttributeNames={"#t": "turn"},
                    ExpressionAttributeValues={":t": expected_turn},
                )
            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    raise StaleRunWrite(
                        f"Run {state.id} changed since turn {expected_turn}"
                    ) from e
                raise
        else:
            self._t.put_item(Item=item)

        if status_changed:
            self._t.delete_item(
                Key=user_run_key(state.user_id, prior_sk_status, state.id),
            )
        return True

    def delete_run(self, user_id: str, run_id: str) -> bool:
        """Delete a run from whichever status partition it lives in.

        Tries each status; returns True if any of them had the row.
        """
        for status in ("ACTIVE", "ENDED", "ABANDONED"):
            resp = self._t.delete_item(
                Key=user_run_key(user_id, status, run_id),  # type: ignore[arg-type]
                ReturnValues="ALL_OLD",
            )
            if resp.get("Attributes") is not None:
                return True
        return False

    # -------------------------------------------------------------------------
    # Deck unlocks
    # -------------------------------------------------------------------------

    def list_unlocked_decks(self, user_id: str) -> list[str]:
        """Return deck names the user has explicitly unlocked via achievements.

        Does NOT include default decks (those are always available regardless
        of this list). Returns an empty list if no unlocks exist yet.
        """
        pk = user_pk(user_id)
        resp = self._t.query(
            KeyConditionExpression=Key("PK").eq(pk)
                & Key("SK").begins_with(UserSk.UNLOCK_DECK_PREFIX),
            ProjectionExpression="SK",
        )
        prefix_len = len(UserSk.UNLOCK_DECK_PREFIX)
        return [item["SK"][prefix_len:] for item in resp.get("Items", [])]

    # -------------------------------------------------------------------------
    # Achievements
    # -------------------------------------------------------------------------

    def list_earned_achievement_ids(self, user_id: str) -> set[str]:
        """Return the set of achievement ids the user has already unlocked.
        Used by the evaluator — only needs ids, not full objects."""
        pk = user_pk(user_id)
        resp = self._t.query(
            KeyConditionExpression=Key("PK").eq(pk)
                & Key("SK").begins_with(UserSk.ACH_PREFIX),
            ProjectionExpression="SK",
        )
        prefix_len = len(UserSk.ACH_PREFIX)
        return {item["SK"][prefix_len:] for item in resp.get("Items", [])}

    def list_earned_achievements(self, user_id: str) -> list[UserAchievement]:
        """Return full UserAchievement records (with unlocked_at) for display."""
        pk = user_pk(user_id)
        resp = self._t.query(
            KeyConditionExpression=Key("PK").eq(pk)
                & Key("SK").begins_with(UserSk.ACH_PREFIX),
        )
        return [
            UserAchievement.model_validate(_item_to_dict(i))
            for i in resp.get("Items", [])
        ]

    def award_achievement(self, user_id: str, ach: Achievement) -> bool:
        """Write a UserAchievement item for the user. Idempotent — silently
        skips if the user already earned this achievement. Returns True when
        newly awarded, False when it was already present.

        Side effects when newly awarded:
          - Writes a DeckUnlock item if ach.unlocks_deck is set.
          - Increments profile.achievements_unlocked and profile.current_points.
        """
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        earned = UserAchievement(
            achievement_id=ach.id,
            unlocked_at=now,
        )
        key = user_achievement_key(user_id, ach.id)
        try:
            self._t.put_item(
                Item=_model_to_item(earned, key["PK"], key["SK"]),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False
            raise

        if ach.unlocks_deck:
            unlock = DeckUnlock(
                deck_name=ach.unlocks_deck,
                unlocked_at=now,
                via_achievement=ach.id,
            )
            dk = user_deck_unlock_key(user_id, ach.unlocks_deck)
            self._t.put_item(Item=_model_to_item(unlock, dk["PK"], dk["SK"]))

        self._increment_profile_achievement(user_id, ach.points)
        return True

    def _increment_profile_achievement(self, user_id: str, points: int) -> None:
        """Atomically bump achievements_unlocked and current_points on the
        profile. Uses UpdateItem so we never overwrite a concurrent write."""
        self._t.update_item(
            Key=user_profile_key(user_id),
            UpdateExpression=(
                "SET totals.achievements_unlocked = "
                "    if_not_exists(totals.achievements_unlocked, :zero) + :one, "
                "    current_points = "
                "    if_not_exists(current_points, :zero) + :pts"
            ),
            ExpressionAttributeValues={":one": 1, ":pts": points, ":zero": 0},
        )

    # -------------------------------------------------------------------------
    # Bulk delete — wipe an entire user's partition (guest cleanup)
    # -------------------------------------------------------------------------

    def delete_all_user_data(self, user_id: str) -> int:
        """Delete every item under USER#<user_id> (profile, runs, anything else).

        Used by the guest-cleanup sweep. Queries the partition (keys only) and
        batch-deletes. Returns the number of items removed.
        """
        pk = user_pk(user_id)
        deleted = 0
        kwargs = {
            "KeyConditionExpression": Key("PK").eq(pk),
            "ProjectionExpression": "PK, SK",
        }
        with self._t.batch_writer() as batch:
            while True:
                resp = self._t.query(**kwargs)
                for item in resp.get("Items", []):
                    batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                    deleted += 1
                lek = resp.get("LastEvaluatedKey")
                if not lek:
                    break
                kwargs["ExclusiveStartKey"] = lek
        return deleted

    # -------------------------------------------------------------------------
    # Guest claim — migrate a guest's data onto a real account
    # -------------------------------------------------------------------------

    def claim_guest_data(self, guest_user_id: str, real_user_id: str) -> int:
        """Move a guest's runs onto a real account and merge profile totals.

        Merge semantics (no data loss): the real account keeps its own runs and
        gains all of the guest's; profile lifetime totals + points are summed
        into the real profile (display name stays the real user's). Run ids are
        UUIDs, so re-keying a guest run into the real partition never collides.

        Returns the number of runs migrated. The guest's PROFILE row is removed;
        the caller is responsible for deleting the guest's Cognito account.
        """
        runs = self.list_runs_for_user(guest_user_id)
        migrated = 0
        for state in runs:
            state.user_id = real_user_id
            try:
                self.insert_run(state)
            except RunConflict:
                # UUID collision across accounts is astronomically unlikely;
                # skip rather than clobber whatever already sits there.
                continue
            self.delete_run(guest_user_id, state.id)
            migrated += 1

        self._merge_profiles(guest_user_id, real_user_id)
        return migrated

    def _merge_profiles(self, guest_user_id: str, real_user_id: str) -> None:
        from datetime import datetime, timezone

        guest = self.get_profile(guest_user_id)
        if guest is None:
            return
        real = self.get_profile(real_user_id)
        now = datetime.now(timezone.utc)

        if real is None:
            # Real profile missing (PostConfirmation slow/failed) — re-key the
            # guest profile onto the real id so totals aren't lost.
            guest.user_id = real_user_id
            guest.updated_at = now
            self.put_profile(guest)
        else:
            real.totals.runs_started += guest.totals.runs_started
            real.totals.runs_completed += guest.totals.runs_completed
            real.totals.runs_abandoned += guest.totals.runs_abandoned
            real.totals.achievements_unlocked += guest.totals.achievements_unlocked
            real.current_points += guest.current_points
            real.updated_at = now
            self.put_profile(real)

        # Drop the guest PROFILE row regardless of branch.
        self._t.delete_item(Key=user_profile_key(guest_user_id))

    # -------------------------------------------------------------------------
    # Achievements
    # -------------------------------------------------------------------------

    def list_user_achievements(self, user_id: str) -> list[str]:
        """Return all achievement ids the user has already unlocked.

        Used by evaluate_achievements as a prefilter so we don't re-grade
        achievements they already own. ProjectionExpression keeps the row size
        down — the run-finalize path is hot, and we only need ids."""
        ids: list[str] = []
        kwargs = {
            "KeyConditionExpression":
                Key("PK").eq(user_pk(user_id))
                & Key("SK").begins_with(UserSk.ACH_PREFIX),
            "ProjectionExpression": "achievement_id",
        }
        while True:
            resp = self._t.query(**kwargs)
            for item in resp.get("Items", []):
                aid = item.get("achievement_id")
                if aid:
                    ids.append(aid)
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return ids

    def list_user_achievement_rows(self, user_id: str) -> list[UserAchievement]:
        """Full earned-achievement rows (incl. unlocked_at) for the admin user
        view. Unlike list_user_achievements (ids only, hot finalize path), this
        keeps the whole item so the admin can see when each was granted."""
        rows: list[UserAchievement] = []
        kwargs = {
            "KeyConditionExpression":
                Key("PK").eq(user_pk(user_id))
                & Key("SK").begins_with(UserSk.ACH_PREFIX),
        }
        while True:
            resp = self._t.query(**kwargs)
            for item in resp.get("Items", []):
                rows.append(UserAchievement.model_validate(_item_to_dict(item)))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return rows

    def unlock_achievement(
        self,
        user_id: str,
        ach_id: str,
        points: int,
        unlocks_deck: str | None = None,
    ) -> bool:
        """Idempotently grant an achievement.

        Sequenced sync writes (matches insert_run's pattern; no TransactWrite
        because the resource layer doesn't expose it cleanly):
          1. Conditional put of ACH#<id> — `attribute_not_exists(PK)` makes
             this idempotent against a TOCTOU double-eval race.
          2. Only if (1) wrote a new row: bump profile.current_points +
             totals.achievements_unlocked + updated_at.
          3. Only if `unlocks_deck`: write the UNLOCK#DECK#<name> row. Plain
             put — overwriting a default-grant row is harmless.

        Returns True if newly unlocked, False if the user already had it.
        Doing the counter bump AFTER the conditional put is the whole point:
        a second concurrent call short-circuits in step 1 and never
        double-counts.
        """
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        ach_key = user_achievement_key(user_id, ach_id)
        ua = UserAchievement(achievement_id=ach_id, unlocked_at=now)
        try:
            self._t.put_item(
                Item=_model_to_item(ua, ach_key["PK"], ach_key["SK"]),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False
            raise

        self._t.update_item(
            Key=user_profile_key(user_id),
            UpdateExpression=(
                "SET updated_at = :now "
                "ADD current_points :p, totals.achievements_unlocked :one"
            ),
            ExpressionAttributeValues={
                ":p": points,
                ":one": 1,
                ":now": now_iso,
            },
        )

        if unlocks_deck:
            dk = user_deck_unlock_key(user_id, unlocks_deck)
            self._t.put_item(Item={
                "PK": dk["PK"],
                "SK": dk["SK"],
                "deck_name": unlocks_deck,
                "unlocked_at": now_iso,
                "via_achievement": ach_id,
            })

        return True

    # -------------------------------------------------------------------------
    # Deck unlocks
    # -------------------------------------------------------------------------

    def list_unlocked_deck_names(self, user_id: str) -> list[str]:
        """Deck names the user has unlocked via achievements (the UNLOCK#DECK#
        rows). Default decks aren't here — those are unlocked for everyone and
        resolved from the catalog. Projects deck_name only; small partition but
        paginated for safety."""
        names: list[str] = []
        kwargs = {
            "KeyConditionExpression":
                Key("PK").eq(user_pk(user_id))
                & Key("SK").begins_with(UserSk.UNLOCK_DECK_PREFIX),
            "ProjectionExpression": "deck_name",
        }
        while True:
            resp = self._t.query(**kwargs)
            for item in resp.get("Items", []):
                name = item.get("deck_name")
                if name:
                    names.append(name)
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return names

    def list_runs_for_user(self, user_id: str) -> list[GameState]:
        """All runs for a user, any status: one Query (SK begins_with RUN#)
        with a 1 MB pagination loop. If users ever accumulate thousands of runs,
        give the summary endpoint a ProjectionExpression that strips deck/history.
        """
        items: list[dict] = []
        kwargs = {
            "KeyConditionExpression":
                Key("PK").eq(user_pk(user_id))
                & Key("SK").begins_with(UserSk.RUN_PREFIX),
        }
        while True:
            resp = self._t.query(**kwargs)
            items.extend(resp.get("Items", []))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return [GameState.model_validate(_item_to_dict(i)) for i in items]

    # -------------------------------------------------------------------------
    # Admin user directory (PK = USERS#all)
    # -------------------------------------------------------------------------

    def put_directory_entry(self, user_id: str, display_name: str) -> None:
        """Add a real (non-guest) account to the admin user directory.

        Called once at profile creation (Cognito PostConfirmation). Plain put so
        a re-fire just refreshes the row; guests are deliberately never written
        here, so the directory stays a clean list of real players and guest
        cleanup needs no directory delete.
        """
        from datetime import datetime, timezone
        entry = DirectoryEntry(
            user_id=user_id,
            display_name=display_name,
            created_at=datetime.now(timezone.utc),
        )
        key = directory_user_key(user_id)
        self._t.put_item(Item=_model_to_item(entry, key["PK"], key["SK"]))

    def list_directory(self) -> list[DirectoryEntry]:
        """Every real player, one Query on PK=USERS#all, sorted by name.

        Full directory of real accounts (guests excluded by design). Backs the
        admin Users view + run-inspector name search.
        """
        rows: list[DirectoryEntry] = []
        kwargs = {"KeyConditionExpression": Key("PK").eq(directory_pk())}
        while True:
            resp = self._t.query(**kwargs)
            for item in resp.get("Items", []):
                rows.append(DirectoryEntry.model_validate(_item_to_dict(item)))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return sorted(rows, key=lambda e: e.display_name.lower())
