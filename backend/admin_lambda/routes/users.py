"""Admin user lookup — directory + per-user aggregate (profile, runs, achievements).

Read-only support view: search a player, then see their lifetime stats, every
run, and which achievements they've earned (resolved against the working-copy
catalog so names/points show even before a publish). The single-run deep-dive
lives in runs.py (the Run-Inspektor); a run row here links into it.

The directory is leaderboard-sourced (PK=LB#points), so it only lists players
who have a recorded score. The per-user routes work for any user_id, so guests
reachable by id still resolve via the manual-id path in the UI.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from shared.db.catalog_repo import CatalogRepo
from shared.db.user_repo import UserRepo
from shared.schemas import ProfileTotals

from admin_lambda.routes._deps import get_catalog_repo
from admin_lambda.routes.runs import RunSummaryRow, build_run_rows, get_user_repo

router = APIRouter()


class PlayerSummary(BaseModel):
    """One directory row. Sourced from the points leaderboard, so `points` is
    that user's best recorded score."""
    user_id: str
    display_name: str
    points: int


class AchievementRow(BaseModel):
    """An achievement a user has earned, joined against the catalog. `name`
    falls back to the id when the achievement was deleted after being granted."""
    id: str
    name: str
    points: int
    unlocks_deck: str | None = None
    unlocked_at: str | None = None
    # True when the id no longer resolves in the working-copy catalog.
    orphaned: bool = False


class UserDetail(BaseModel):
    """Everything the admin user view needs in one fetch."""
    user_id: str
    display_name: str
    current_points: int
    totals: ProfileTotals
    created_at: str | None = None
    updated_at: str | None = None
    runs: list[RunSummaryRow]
    achievements: list[AchievementRow]


@router.get("", response_model=list[PlayerSummary])
def list_users(users: UserRepo = Depends(get_user_repo)):
    """Players known to the points leaderboard, best-score first. Not a full
    directory — scoreless users (e.g. guests who never finished a run) won't
    appear, but they're still reachable by id via the detail route."""
    return [
        PlayerSummary(user_id=p.user_id, display_name=p.display_name, points=p.score)
        for p in users.list_players()
    ]


@router.get("/{user_id}", response_model=UserDetail)
def get_user_detail(
    user_id: str,
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Aggregate view for one user: profile/stats + every run + earned
    achievements. 404 only if the user has no profile, no runs and no
    achievements (i.e. nothing to show)."""
    profile = users.get_profile(user_id)
    runs = build_run_rows(users, user_id)
    earned = users.list_user_achievement_rows(user_id)

    if profile is None and not runs and not earned:
        raise HTTPException(404, "User not found")

    achievements: list[AchievementRow] = []
    for ua in earned:
        doc = catalog.get_achievement(ua.achievement_id)
        achievements.append(AchievementRow(
            id=ua.achievement_id,
            name=doc.name if doc else ua.achievement_id,
            points=doc.points if doc else 0,
            unlocks_deck=doc.unlocks_deck if doc else None,
            unlocked_at=ua.unlocked_at.isoformat() if ua.unlocked_at else None,
            orphaned=doc is None,
        ))
    achievements.sort(key=lambda a: a.unlocked_at or "", reverse=True)

    return UserDetail(
        user_id=user_id,
        display_name=profile.display_name if profile else user_id,
        current_points=profile.current_points if profile else 0,
        totals=profile.totals if profile else ProfileTotals(),
        created_at=profile.created_at.isoformat() if profile else None,
        updated_at=profile.updated_at.isoformat() if profile else None,
        runs=runs,
        achievements=achievements,
    )
