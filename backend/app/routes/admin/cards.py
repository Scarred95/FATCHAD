# app/routes/admin/cards.py
"""Card CRUD — create, read, update, replace, delete card documents.

Mounted under /admin/cards. Auth is enforced at the parent admin router.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db.repositories import EventRepo
from app.routes._deps import get_event_repo
from app.schemas import Choice, Event, Requirements

router = APIRouter()


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
    enabled:     bool | None = None
    important:   bool | None = None
    deck_name:   str | None = None


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


# =============================================================================
# Bulk deck toggle — enable/disable every card in a deck in one call
# =============================================================================

class DeckToggleRequest(BaseModel):
    """Bulk-toggle the `enabled` flag on every card in a deck."""
    enabled: bool


class DeckToggleResponse(BaseModel):
    """Result of a bulk deck toggle — how many cards were touched."""
    matched: int
    modified: int


@router.post("/decks/{deck_name}/toggle", response_model=DeckToggleResponse)
async def toggle_deck(
    deck_name: str,
    payload: DeckToggleRequest,
    events: EventRepo = Depends(get_event_repo),
):
    """Set `enabled` on every card belonging to a given deck.

    Pass `deck_name="__orphans__"` to target cards with no deck_name
    (matches how the admin UI labels the orphan bucket).
    """
    matched, modified = await events.set_enabled_for_deck(deck_name, payload.enabled)
    return DeckToggleResponse(matched=matched, modified=modified)
