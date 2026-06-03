"""Admin run inspection — read-only view of a run's full state + per-turn trail.

Debugging aid for "why didn't this achievement fire?": surfaces the complete
GameState including the per-turn `history[].stats` snapshot (which the
player-facing history endpoint deliberately omits) plus the `newly_unlocked`
ids that the run stamped at finalize. Read-only — no mutation surface.

A run row lives under USER#<uid>, and there is no run_id GSI, so lookup needs
the user id. The route therefore takes both ids rather than run_id alone.
"""
from fastapi import APIRouter, Depends, HTTPException

from shared.db.user_repo import UserRepo
from shared.schemas import GameState

router = APIRouter()


def get_user_repo() -> UserRepo:
    return UserRepo()


@router.get("/{user_id}/{run_id}/history", response_model=GameState)
def get_run_history(
    user_id: str,
    run_id: str,
    users: UserRepo = Depends(get_user_repo),
):
    """Return the full run state, including the per-turn stat trail. 404 if the
    run is absent from all status partitions for this user."""
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    return state
