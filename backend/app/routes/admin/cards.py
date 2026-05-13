# app/routes/admin/cards.py
"""Card CRUD — create, read, update, replace, delete card documents.

All routes are prefixed /admin/cards by the parent router in __init__.py.
TODO: Add authentication/authorization — these endpoints are currently open to anyone.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.db.repositories import EventRepo
from app.schemas import Choice, Event, Requirements

router = APIRouter()


def get_event_repo(request: Request) -> EventRepo:
    return EventRepo(request.app.state.mongo.db)


@router.get("", response_model=list[Event])
async def list_cards(
    category: str | None = None,
    limit: int = 100,
    skip: int = 0,
    events: EventRepo = Depends(get_event_repo),
):
    """List all cards, optionally filtered by category. Paginated."""
    return await events.list_paginated(category=category, limit=limit, skip=skip)


@router.get("/{card_id}", response_model=Event)
async def get_card(
    card_id: str,
    events: EventRepo = Depends(get_event_repo),
):
    card = await events.get_by_id(card_id)
    if card is None:
        raise HTTPException(404, "Card not found")
    return card


@router.post("", response_model=Event, status_code=201)
async def create_card(
    card: Event,
    events: EventRepo = Depends(get_event_repo),
):
    """Create a new card. Pydantic validates the full document on input."""
    existing = await events.get_by_id(card.id)
    if existing is not None:
        raise HTTPException(409, f"Card {card.id} already exists")
    await events.insert(card)
    return card


@router.put("/{card_id}", response_model=Event)
async def replace_card(
    card_id: str,
    card: Event,
    events: EventRepo = Depends(get_event_repo),
):
    """Replace a card entirely. id in URL must match id in body."""
    if card.id != card_id:
        raise HTTPException(400, "card_id in URL must match _id in body")
    existing = await events.get_by_id(card_id)
    if existing is None:
        raise HTTPException(404, "Card not found")
    await events.upsert(card)
    return card


class PatchCardRequest(BaseModel):
    """Partial card update — only provided fields are changed, rest left as-is."""
    title:       str | None = Field(default=None, min_length=1)
    description: str | None = None
    category:    str | None = None
    weight:      int | None = Field(default=None, ge=0)
    image_url:   str | None = None
    requires:    Requirements | None = None
    choices:     list[Choice] | None = Field(default=None, min_length=2, max_length=3)


@router.patch("/{card_id}", response_model=Event)
async def patch_card(
    card_id: str,
    payload: PatchCardRequest,
    events: EventRepo = Depends(get_event_repo),
):
    """Partial update — only fields present in the request body are changed."""
    existing = await events.get_by_id(card_id)
    if existing is None:
        raise HTTPException(404, "Card not found")
    # exclude_unset so fields the caller didn't send don't overwrite existing values
    updated = existing.model_copy(update=payload.model_dump(exclude_unset=True))
    await events.upsert(updated)
    return updated


@router.delete("/{card_id}", status_code=204)
async def delete_card(
    card_id: str,
    events: EventRepo = Depends(get_event_repo),
):
    deleted = await events.delete(card_id)
    if not deleted:
        raise HTTPException(404, "Card not found")
