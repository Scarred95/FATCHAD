"""Gameplay-side dependency providers + shared route guards.

Gameplay never touches CatalogRepo (that's the admin/publish path) — it
reads the published snapshot via CatalogSnapshot's pointer-versioned cache.
"""
from fastapi import Depends, HTTPException

from shared.auth import get_current_user, get_current_user_id
from shared.db.catalog_snapshot import CatalogSnapshot, get_current_snapshot
from shared.db.leaderboard_repo import LeaderboardRepo
from shared.db.user_repo import UserRepo
from shared.schemas import GameState

_GUEST_GROUP = "guest"


def get_user_repo() -> UserRepo:
    return UserRepo()


def get_leaderboard_repo() -> LeaderboardRepo:
    return LeaderboardRepo()


def get_is_guest(claims: dict = Depends(get_current_user)) -> bool:
    """True when the caller is a throwaway guest (carries the `guest` Cognito
    group). Guests are kept off the leaderboard — they're swept daily and would
    just litter it with `Gast` rows."""
    return _GUEST_GROUP in (claims.get("cognito:groups") or [])


def get_catalog() -> CatalogSnapshot:
    """Cached in-memory snapshot of the published catalog. Pointer-version
    checked per call; S3 refetch only on bump (see get_current_snapshot)."""
    return get_current_snapshot()


def get_owned_run(
    run_id: str,
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
) -> GameState:
    """Load (user_id, run_id) or 404. The single seam for run lookup; ownership
    is enforced by deriving user_id from the caller's Cognito JWT (`sub` claim)."""
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    return state


def require_active(state: GameState) -> GameState:
    """409 unless the run is still active."""
    if state.status != "active":
        raise HTTPException(409, f"Run is already {state.status}")
    return state


def require_inactive(state: GameState) -> GameState:
    """409 while the run is still active (for end-of-run-only endpoints)."""
    if state.status == "active":
        raise HTTPException(409, "Run is still active")
    return state
