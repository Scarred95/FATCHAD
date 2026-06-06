# gameplay_lambda/routes/leaderboard.py
"""Public leaderboards — two boards backed by the fatchad_leaderboard table.

  GET  /leaderboard/points          → top accounts by career achievement points
  GET  /leaderboard/runs            → top runs by rounds survived (highscore)
  GET  /leaderboard/runs/mine       → the caller's own published runs (<=5)
  POST /leaderboard/runs/{run_id}   → publish a finished run to the highscore board
  DELETE /leaderboard/runs/{run_id} → take one of your runs back off the board

The points board is maintained automatically (see sync_points_for_grants, called
from the run-finalize sites) — players never publish it by hand. The run board
is opt-in from the end-screen and capped at MAX_RUNS_PER_USER per account; at the
cap the client must pick which existing run to replace. Guests are blocked from
both write paths — they're throwaway accounts swept daily.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from shared.auth import get_current_user_id
from shared.db.leaderboard_repo import MAX_RUNS_PER_USER, LeaderboardRepo
from shared.db.user_repo import UserRepo
from shared.schemas import GameState, LbRunEntry

from gameplay_lambda.routes._deps import (
    get_is_guest,
    get_leaderboard_repo,
    get_owned_run,
    get_user_repo,
    require_inactive,
)
from gameplay_lambda.routes._schemas import (
    LeaderboardPointsRow,
    LeaderboardRunRow,
    PublishRunRequest,
    PublishRunResponse,
)

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])

# Cap how many rows a single Query can pull, so a hostile ?limit= can't fan out.
_MAX_LIMIT = 200


def _clamp(limit: int) -> int:
    return max(1, min(limit, _MAX_LIMIT))


@router.get("/points", response_model=list[LeaderboardPointsRow])
def get_points_board(
    limit: int = 100,
    lb: LeaderboardRepo = Depends(get_leaderboard_repo),
):
    """Top accounts by career achievement points (highest first)."""
    return [LeaderboardPointsRow.from_entry(e) for e in lb.top_points(_clamp(limit))]


@router.get("/runs", response_model=list[LeaderboardRunRow])
def get_runs_board(
    limit: int = 100,
    lb: LeaderboardRepo = Depends(get_leaderboard_repo),
):
    """Top runs by rounds survived (highest first)."""
    return [LeaderboardRunRow.from_entry(e) for e in lb.top_runs(_clamp(limit))]


@router.get("/runs/mine", response_model=list[LeaderboardRunRow])
def get_my_published_runs(
    user_id: str = Depends(get_current_user_id),
    lb: LeaderboardRepo = Depends(get_leaderboard_repo),
):
    """The caller's currently-published runs (oldest first). The end-screen uses
    this to show 'N/5 published' and to populate the replace picker."""
    return [LeaderboardRunRow.from_entry(e) for e in lb.list_user_runs(user_id)]


@router.post("/runs/{run_id}", response_model=PublishRunResponse, status_code=201)
def publish_run(
    body: PublishRunRequest | None = None,
    state: GameState = Depends(get_owned_run),
    user_id: str = Depends(get_current_user_id),
    is_guest: bool = Depends(get_is_guest),
    users: UserRepo = Depends(get_user_repo),
    lb: LeaderboardRepo = Depends(get_leaderboard_repo),
):
    """Publish a finished run to the highscore board.

    The run must be the caller's and no longer active. At the 5-run cap the
    client must name a `replace_run_id`; without one we 409 with the player's
    current five so the UI can prompt for a swap.
    """
    if is_guest:
        raise HTTPException(403, "Gäste können keine Runs ins Leaderboard stellen.")
    require_inactive(state)

    profile = users.get_profile(user_id)
    display_name = profile.display_name if profile else "Spieler"
    entry = LbRunEntry(
        user_id=user_id,
        display_name=display_name,
        score=state.turn,
        run_id=state.id,
        deck_ids=state.deck_ids,
        status=state.status,
        ending=state.ending,
        published_at=datetime.now(timezone.utc),
    )

    replace_run_id = body.replace_run_id if body else None
    outcome = lb.publish_run(entry, replace_run_id)

    if outcome.status == "already_published":
        raise HTTPException(409, "Dieser Run steht bereits im Leaderboard.")
    if outcome.status == "bad_replace":
        raise HTTPException(400, "Der zu ersetzende Run gehört nicht zu deinen Einträgen.")
    if outcome.status == "full":
        # Structured 409 so the client can open the replace picker rather than
        # just showing an error string.
        raise HTTPException(409, detail={
            "reason": "leaderboard_full",
            "max": MAX_RUNS_PER_USER,
            "current": [
                LeaderboardRunRow.from_entry(e).model_dump(mode="json")
                for e in (outcome.current or [])
            ],
        })

    return PublishRunResponse(
        entry=LeaderboardRunRow.from_entry(entry),
        evicted_run_id=outcome.evicted_run_id,
    )


@router.delete("/runs/{run_id}", status_code=204)
def unpublish_run(
    run_id: str,
    user_id: str = Depends(get_current_user_id),
    lb: LeaderboardRepo = Depends(get_leaderboard_repo),
):
    """Remove one of the caller's runs from the highscore board. 404 if they
    never published it."""
    if not lb.unpublish_run(user_id, run_id):
        raise HTTPException(404, "Dieser Run steht nicht im Leaderboard.")


# =============================================================================
# Points-board sync — called from the run-finalize sites (runs.py / gameplay.py)
# =============================================================================

def sync_points_for_grants(
    lb: LeaderboardRepo,
    users: UserRepo,
    user_id: str,
    unlocked: list,
    is_guest: bool,
) -> None:
    """Mirror an account's new career-point total onto the points board after a
    finalize granted achievements. No-op for guests (kept off the board) or when
    nothing unlocked. Best-effort: the board is a denormalisation, so a write
    failure here must never sink the run-finalize response.

    `unlocked` is the list of Achievement docs evaluate_achievements just
    granted; their points sum is the delta, so the previous board score is
    (new current_points − delta) — no extra read needed beyond the profile we
    already need for the display name.
    """
    if is_guest or not unlocked:
        return
    delta = sum(a.points for a in unlocked)
    if delta <= 0:
        return
    profile = users.get_profile(user_id)
    if profile is None:
        return
    new_score = profile.current_points
    lb.sync_points(
        user_id, profile.display_name, new_score=new_score, old_score=new_score - delta
    )
