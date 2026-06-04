# admin_lambda/routes/achievements.py
"""Achievement CRUD — mirrors endings.py shape."""
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
    if ach.id != ach_id:
        raise HTTPException(400, "ach_id in URL must match _id in body")
    if catalog.get_achievement(ach_id) is None:
        raise HTTPException(404, "Achievement not found")
    catalog.put_achievement(ach)
    return ach


class PatchAchievementRequest(BaseModel):
    name:         str | None = Field(default=None, min_length=1)
    description:  str | None = None
    criteria:     AchievementCriteria | None = None
    points:       int | None = Field(default=None, ge=0)
    unlocks_deck: str | None = None
    enabled:      bool | None = None
    image_url:    str | None = None


@router.patch("/{ach_id}", response_model=Achievement)
def patch_achievement(
    ach_id: str,
    payload: PatchAchievementRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
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
    if not catalog.delete_achievement(ach_id):
        raise HTTPException(404, "Achievement not found")
