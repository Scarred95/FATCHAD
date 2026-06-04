"""Deck availability endpoint.

GET /decks/available  → list of decks the calling user can choose from,
                        with unlock status per deck.

Default decks (unlock_rule.kind == "default") are always available.
Achievement-gated decks appear only when the user has the matching
UNLOCK#DECK#<name> item in fatchad_user_data.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from shared.auth import get_current_user_id
from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import UserRepo

from gameplay_lambda.routes._deps import get_catalog, get_user_repo

router = APIRouter(prefix="/decks", tags=["decks"])


class DeckInfo(BaseModel):
    name: str
    description: str
    unlocked: bool
    is_default: bool
    has_starting_card: bool


@router.get("/available", response_model=list[DeckInfo])
def list_available_decks(
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
) -> list[DeckInfo]:
    """Return all enabled decks with unlock status for the calling user.

    - Default decks are always unlocked (no achievement required).
    - Achievement-gated decks are only included when the user has the
      matching UNLOCK#DECK#<name> item in DynamoDB.
    - Decks without a starting_card_id are included but marked accordingly
      so the frontend can disable or hide them until content is ready.
    """
    unlocked_names = set(users.list_unlocked_decks(user_id))

    result: list[DeckInfo] = []
    for deck in catalog.list_decks():
        is_default = deck.unlock_rule.kind == "default"
        unlocked = is_default or deck.name in unlocked_names
        if not unlocked:
            continue  # achievement-gated and not yet earned — hide entirely
        result.append(DeckInfo(
            name=deck.name,
            description=deck.description,
            unlocked=unlocked,
            is_default=is_default,
            has_starting_card=deck.starting_card_id is not None,
        ))

    return result
