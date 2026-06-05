# admin_lambda/routes/decks.py
"""Deck CRUD — mirrors cards.py / endings.py shape.

Decks own their `name` as the natural key (DDB SK within PK=DECK). Timestamps
are stamped server-side because Deck.created_at / Deck.updated_at are required
fields on the model — the admin UI never sends them.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.db.catalog_repo import CatalogConflict, CatalogRepo
from shared.schemas import Deck, DeckUnlockRule

from admin_lambda.routes._deps import get_catalog_repo

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("", response_model=list[Deck])
def list_decks(
    limit: int = 100,
    skip: int = 0,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    """List all decks. Catalog-sized partition; in-memory pagination is fine."""
    decks_ = catalog.list_decks()
    return decks_[skip:skip + limit]


@router.get("/{deck_name}", response_model=Deck)
def get_deck(
    deck_name: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    deck = catalog.get_deck(deck_name)
    if deck is None:
        raise HTTPException(404, "Deck not found")
    return deck


class CreateDeckRequest(BaseModel):
    """Create payload. Timestamps are minted server-side."""
    name: str = Field(min_length=1)
    description: str = ""
    enabled: bool = True
    unlock_rule: DeckUnlockRule = Field(default_factory=DeckUnlockRule)
    removes_endings: list[str] = Field(default_factory=list)


@router.post("", response_model=Deck, status_code=201)
def create_deck(
    payload: CreateDeckRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    now = _now()
    deck = Deck(
        name=payload.name,
        description=payload.description,
        enabled=payload.enabled,
        unlock_rule=payload.unlock_rule,
        removes_endings=payload.removes_endings,
        created_at=now,
        updated_at=now,
    )
    try:
        catalog.insert_deck(deck)
    except CatalogConflict:
        raise HTTPException(409, f"Deck {deck.name} already exists")
    return deck


class ReplaceDeckRequest(BaseModel):
    """Full replace payload. name in URL is authoritative; created_at is
    preserved from the existing record; updated_at is refreshed."""
    description: str = ""
    enabled: bool = True
    unlock_rule: DeckUnlockRule = Field(default_factory=DeckUnlockRule)
    removes_endings: list[str] = Field(default_factory=list)


@router.put("/{deck_name}", response_model=Deck)
def replace_deck(
    deck_name: str,
    payload: ReplaceDeckRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    existing = catalog.get_deck(deck_name)
    if existing is None:
        raise HTTPException(404, "Deck not found")
    updated = Deck(
        name=existing.name,
        description=payload.description,
        enabled=payload.enabled,
        unlock_rule=payload.unlock_rule,
        removes_endings=payload.removes_endings,
        created_at=existing.created_at,
        updated_at=_now(),
    )
    catalog.put_deck(updated)
    return updated


class PatchDeckRequest(BaseModel):
    """Partial update — only provided fields change. updated_at refreshes
    whenever any patch is applied."""
    description: str | None = None
    enabled: bool | None = None
    unlock_rule: DeckUnlockRule | None = None
    removes_endings: list[str] | None = None


@router.patch("/{deck_name}", response_model=Deck)
def patch_deck(
    deck_name: str,
    payload: PatchDeckRequest,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    existing = catalog.get_deck(deck_name)
    if existing is None:
        raise HTTPException(404, "Deck not found")
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = _now()
    updated = existing.model_copy(update=updates)
    catalog.put_deck(updated)
    return updated


@router.delete("/{deck_name}", status_code=204)
def delete_deck(
    deck_name: str,
    catalog: CatalogRepo = Depends(get_catalog_repo),
):
    deleted = catalog.delete_deck(deck_name)
    if not deleted:
        raise HTTPException(404, "Deck not found")
