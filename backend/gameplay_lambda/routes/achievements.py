# gameplay_lambda/routes/achievements.py
"""Player-facing achievement endpoints.

GET /achievements/earned  →  list of achievements this user has unlocked,
                              joined with catalog metadata (name, points, etc.)
"""
from fastapi import APIRouter, Depends

from shared.auth import get_current_user_id
from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import UserRepo

from gameplay_lambda.routes._deps import get_catalog, get_user_repo
from gameplay_lambda.routes._schemas import EarnedAchievementResponse

router = APIRouter(prefix="/achievements", tags=["achievements"])


@router.get("/earned", response_model=list[EarnedAchievementResponse])
def list_earned_achievements(
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """All achievements the logged-in player has unlocked, with public metadata
    joined from the catalog. Achievements deleted from the catalog since earning
    are silently omitted."""
    earned = users.list_earned_achievements(user_id)
    result = []
    for ua in earned:
        ach = catalog.get_achievement(ua.achievement_id)
        if ach is None or ua.unlocked_at is None:
            continue
        result.append(EarnedAchievementResponse(
            id=ach.id,
            name=ach.name,
            description=ach.description,
            points=ach.points,
            unlocks_deck=ach.unlocks_deck,
            image_url=ach.image_url,
            unlocked_at=ua.unlocked_at,
        ))
    return result
