# admin_lambda/routes/cards.py
"""Card CRUD — create, read, update, replace, delete card documents.

Mounted under /admin/cards. Auth is enforced at the parent admin router.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.db.catalog_repo import CatalogConflict, CatalogRepo
from shared.schemas import Choice, Event, Requirements

from admin_lambda.routes._deps import get_catalog_repo

router = APIRouter()


@router.get("", response_model=list[Event])
def list_cards(
    category: str | None = None,
    limit: int = 100,
    skip: int = 0,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """List all cards, optionally filtered by category.

    Pagination is applied in-memory — the catalog partition is small enough
    (a few thousand items max) that a full-partition query is cheap and the
    DDB cost of a Query is the same regardless of how many items the
    frontend asks for in a page.
    """
    cards = catalog.list_cards(category=category)
    return cards[skip:skip + limit]


@router.get("/{card_id}", response_model=Event)
def get_card(
    card_id: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    card = catalog.get_card(card_id)
    if card is None:
        raise HTTPException(404, "Card not found")
    return card


@router.post("", response_model=Event, status_code=201)
def create_card(
    card: Event,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Create a new card. Pydantic validates the full document on input."""
    try:
        catalog.insert_card(card)
    except CatalogConflict:
        raise HTTPException(409, f"Card {card.id} already exists")
    return card


@router.put("/{card_id}", response_model=Event)
def replace_card(
    card_id: str,
    card: Event,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Replace a card entirely. id in URL must match id in body."""
    if card.id != card_id:
        raise HTTPException(400, "card_id in URL must match _id in body")
    existing = catalog.get_card(card_id)
    if existing is None:
        raise HTTPException(404, "Card not found")
    catalog.put_card(card)
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
def patch_card(
    card_id: str,
    payload: PatchCardRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Partial update — only fields present in the request body are changed."""
    existing = catalog.get_card(card_id)
    if existing is None:
        raise HTTPException(404, "Card not found")
    updated = existing.model_copy(update=payload.model_dump(exclude_unset=True))
    catalog.put_card(updated)
    return updated


@router.delete("/{card_id}", status_code=204)
def delete_card(
    card_id: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    deleted = catalog.delete_card(card_id)
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
def toggle_deck(
    deck_name: str,
    payload: DeckToggleRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """Set `enabled` on every card belonging to a given deck.

    Pass "__orphans__" (catalog_repo.ORPHAN_DECK_SENTINEL) to target cards with no
    deck_name — matches how the admin UI labels the orphan bucket.
    """
    matched, modified = catalog.set_enabled_for_deck(deck_name, payload.enabled)
    return DeckToggleResponse(matched=matched, modified=modified)
