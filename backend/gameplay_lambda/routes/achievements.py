# gameplay_lambda/routes/achievements.py
"""Player-facing achievement views.

Two reads, both from the published snapshot + the caller's unlock rows:
  - GET /achievements          → the "client" catalog: every achievement the
    player is allowed to see (hidden ones excluded until earned), each with its
    hint. Criteria never leave the server.
  - GET /achievements/unlocked → what this caller has earned, with unlocked_at.
    Hidden achievements DO show up here once earned (reveal-on-unlock).

`user_id` is derived from the Cognito JWT — a caller only ever sees their own
unlock state.
"""
from fastapi import APIRouter, Depends

from shared.auth import get_current_user_id
from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import UserRepo

from gameplay_lambda.routes._deps import get_catalog, get_user_repo
from gameplay_lambda.routes._schemas import AchievementView, UnlockedAchievementView

router = APIRouter(prefix="/achievements", tags=["achievements"])

@router.get("", response_model=list[AchievementView])
def list_achievements(
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """The client catalog: every non-hidden achievement, each with its hint.
    Hidden achievements stay invisible here until the player earns one (then it
    surfaces under /achievements/unlocked)."""
    return [
        AchievementView.from_achievement(a)
        for a in catalog.get_achievements()
        if not a.hidden
    ]

@router.get("/unlocked", response_model=list[UnlockedAchievementView])
def list_unlocked_achievements(
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Achievements this caller has earned, newest field carried through as
    unlocked_at. Rows whose achievement was deleted since are skipped (no
    orphan rendering); hidden-but-earned ones are included."""
    out: list[UnlockedAchievementView] = []
    for row in users.list_user_achievement_rows(user_id):
        ach = catalog.get_achievement(row.achievement_id)
        if ach is None:
            continue
        base = AchievementView.from_achievement(ach)
        out.append(UnlockedAchievementView(
            **base.model_dump(),
            unlocked_at=row.unlocked_at,
        ))
    return out