# app/routes/admin/endings.py
"""Ending CRUD — create, read, update, replace, delete ending documents.

Mounted under /admin/endings. Auth is enforced at the parent admin router.

Mirrors the shape of cards.py — the two collections need symmetric admin
surfaces so the frontend can reuse the same patterns (optimistic update,
rollback, toast) for both.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db.repositories import EndingRepo
from app.routes._deps import get_ending_repo
from app.schemas import Ending, EndingRequirements

router = APIRouter()


@router.get("", response_model=list[Ending])
async def list_endings(
    limit: int = 100,
    skip: int = 0,
    endings: EndingRepo = Depends(get_ending_repo),
):
    """List all endings. Paginated. No category filter — endings are few enough
    that the admin UI can keep them all in memory and filter client-side."""
    return await endings.list_paginated(limit=limit, skip=skip)


@router.get("/{ending_id}", response_model=Ending)
async def get_ending(
    ending_id: str,
    endings: EndingRepo = Depends(get_ending_repo),
):
    ending = await endings.get_by_id(ending_id)
    if ending is None:
        raise HTTPException(404, "Ending not found")
    return ending


@router.post("", response_model=Ending, status_code=201)
async def create_ending(
    ending: Ending,
    endings: EndingRepo = Depends(get_ending_repo),
):
    """Create a new ending. Pydantic validates the full document on input."""
    existing = await endings.get_by_id(ending.id)
    if existing is not None:
        raise HTTPException(409, f"Ending {ending.id} already exists")
    await endings.insert(ending)
    return ending


@router.put("/{ending_id}", response_model=Ending)
async def replace_ending(
    ending_id: str,
    ending: Ending,
    endings: EndingRepo = Depends(get_ending_repo),
):
    """Replace an ending entirely. id in URL must match id in body."""
    if ending.id != ending_id:
        raise HTTPException(400, "ending_id in URL must match _id in body")
    existing = await endings.get_by_id(ending_id)
    if existing is None:
        raise HTTPException(404, "Ending not found")
    await endings.upsert(ending)
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
async def patch_ending(
    ending_id: str,
    payload: PatchEndingRequest,
    endings: EndingRepo = Depends(get_ending_repo),
):
    """Partial update — only fields present in the request body are changed."""
    existing = await endings.get_by_id(ending_id)
    if existing is None:
        raise HTTPException(404, "Ending not found")
    # exclude_unset so fields the caller didn't send don't overwrite existing values
    updated = existing.model_copy(update=payload.model_dump(exclude_unset=True))
    await endings.upsert(updated)
    return updated


@router.delete("/{ending_id}", status_code=204)
async def delete_ending(
    ending_id: str,
    endings: EndingRepo = Depends(get_ending_repo),
):
    deleted = await endings.delete(ending_id)
    if not deleted:
        raise HTTPException(404, "Ending not found")
