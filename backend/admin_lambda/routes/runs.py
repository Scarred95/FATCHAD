"""Admin run inspection — read-only view of a run's full state + per-turn trail.

Debugging aid for "why didn't this achievement fire?": surfaces the complete
GameState including the per-turn `history[].stats` snapshot (which the
player-facing history endpoint deliberately omits) plus the `newly_unlocked`
ids that the run stamped at finalize. Read-only — no mutation surface.

A run row lives under USER#<uid>, and there is no run_id GSI, so lookup needs
the user id. The route therefore takes both ids rather than run_id alone.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared.db.user_repo import UserRepo
from shared.schemas import GameState

router = APIRouter()


def get_user_repo() -> UserRepo:
    return UserRepo()


class RunSummaryRow(BaseModel):
    """Lightweight run row for the per-user run-picker — no deck/history, so a
    user with many runs stays cheap to list."""
    run_id: str
    status: str
    turn: int
    ending: str | None = None
    created_at: str
    updated_at: str


def build_run_rows(users: UserRepo, user_id: str) -> list[RunSummaryRow]:
    """Shared run-summary builder — also used by the user-detail aggregate."""
    runs = users.list_runs_for_user(user_id)
    runs.sort(key=lambda r: r.created_at, reverse=True)
    return [
        RunSummaryRow(
            run_id=r.id,
            status=r.status,
            turn=r.turn,
            ending=r.ending,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )
        for r in runs
    ]


@router.get("/{user_id}", response_model=list[RunSummaryRow])
def list_user_runs(user_id: str, users: UserRepo = Depends(get_user_repo)):
    """Every run for a user (any status), newest first — the run-picker list."""
    return build_run_rows(users, user_id)


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
