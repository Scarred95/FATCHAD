# admin_lambda/routes/achievements.py
"""Achievement CRUD — mirrors cards.py / endings.py shape.

Achievements have no timestamps on the model (unlike Deck), so the request
shapes look like endings: full document in, full document out.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.db.catalog_repo import CatalogConflict, CatalogRepo
from shared.schemas import Achievement, AchievementCriteria

from admin_lambda.routes._deps import get_catalog_repo

router = APIRouter()


@router.get("", response_model=list[Achievement])
def list_achievements(
    limit: int = 100,
    skip: int = 0,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """List all achievements. Catalog-sized partition; in-memory pagination."""
    achs = catalog.list_achievements()
    return achs[skip:skip + limit]


@router.get("/{ach_id}", response_model=Achievement)
def get_achievement(
    ach_id: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    ach = catalog.get_achievement(ach_id)
    if ach is None:
        raise HTTPException(404, "Achievement not found")
    return ach


@router.post("", response_model=Achievement, status_code=201)
def create_achievement(
    ach: Achievement,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Create a new achievement. Pydantic validates the full document on input."""
    try:
        catalog.insert_achievement(ach)
    except CatalogConflict:
        raise HTTPException(409, f"Achievement {ach.id} already exists")
    return ach


@router.put("/{ach_id}", response_model=Achievement)
def replace_achievement(
    ach_id: str,
    ach: Achievement,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Replace an achievement entirely. id in URL must match id in body."""
    if ach.id != ach_id:
        raise HTTPException(400, "ach_id in URL must match _id in body")
    existing = catalog.get_achievement(ach_id)
    if existing is None:
        raise HTTPException(404, "Achievement not found")
    catalog.put_achievement(ach)
    return ach


class PatchAchievementRequest(BaseModel):
    """Partial achievement update — only provided fields are changed."""
    name:         str | None = Field(default=None, min_length=1)
    description:  str | None = None
    criteria:     AchievementCriteria | None = None
    points:       int | None = None
    unlocks_deck: str | None = None
    enabled:      bool | None = None
    hint:         str | None = None
    hidden:       bool | None = None
    image_url:    str | None = None


@router.patch("/{ach_id}", response_model=Achievement)
def patch_achievement(
    ach_id: str,
    payload: PatchAchievementRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Partial update — only fields present in the request body are changed."""
    existing = catalog.get_achievement(ach_id)
    if existing is None:
        raise HTTPException(404, "Achievement not found")
    updated = existing.model_copy(update=payload.model_dump(exclude_unset=True))
    catalog.put_achievement(updated)
    return updated


@router.delete("/{ach_id}", status_code=204)
def delete_achievement(
    ach_id: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    deleted = catalog.delete_achievement(ach_id)
    if not deleted:
        raise HTTPException(404, "Achievement not found")
