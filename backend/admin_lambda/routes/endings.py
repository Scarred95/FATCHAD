# admin_lambda/routes/endings.py
"""Ending CRUD — mirrors cards.py shape so the admin UI can reuse patterns."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.db.catalog_repo import CatalogConflict, CatalogRepo
from shared.schemas import Ending, EndingRequirements

from admin_lambda.routes._deps import get_catalog_repo

router = APIRouter()


@router.get("", response_model=list[Ending])
def list_endings(
    limit: int = 100,
    skip: int = 0,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """List all endings. No category filter — endings are few enough
    that the admin UI can keep them all in memory and filter client-side."""
    endings_ = catalog.list_endings()
    return endings_[skip:skip + limit]


@router.get("/{ending_id}", response_model=Ending)
def get_ending(
    ending_id: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    ending = catalog.get_ending(ending_id)
    if ending is None:
        raise HTTPException(404, "Ending not found")
    return ending


@router.post("", response_model=Ending, status_code=201)
def create_ending(
    ending: Ending,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Create a new ending. Pydantic validates the full document on input."""
    try:
        catalog.insert_ending(ending)
    except CatalogConflict:
        raise HTTPException(409, f"Ending {ending.id} already exists")
    return ending


@router.put("/{ending_id}", response_model=Ending)
def replace_ending(
    ending_id: str,
    ending: Ending,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Replace an ending entirely. id in URL must match id in body."""
    if ending.id != ending_id:
        raise HTTPException(400, "ending_id in URL must match _id in body")
    existing = catalog.get_ending(ending_id)
    if existing is None:
        raise HTTPException(404, "Ending not found")
    catalog.put_ending(ending)
    return ending


class PatchEndingRequest(BaseModel):
    """Partial ending update — only provided fields are changed, rest left as-is."""
    title:       str | None = Field(default=None, min_length=1)
    description: str | None = None
    priority:    int | None = None
    requires:    EndingRequirements | None = None
    default:     bool | None = None
    enabled:     bool | None = None
    image_url:   str | None = None


@router.patch("/{ending_id}", response_model=Ending)
def patch_ending(
    ending_id: str,
    payload: PatchEndingRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Partial update — only fields present in the request body are changed."""
    existing = catalog.get_ending(ending_id)
    if existing is None:
        raise HTTPException(404, "Ending not found")
    updated = existing.model_copy(update=payload.model_dump(exclude_unset=True))
    catalog.put_ending(updated)
    return updated


@router.delete("/{ending_id}", status_code=204)
def delete_ending(
    ending_id: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    deleted = catalog.delete_ending(ending_id)
    if not deleted:
        raise HTTPException(404, "Ending not found")
