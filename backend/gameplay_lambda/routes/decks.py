# gameplay_lambda/routes/decks.py
"""Deck selection — the decks a player may pick when starting a run.

Returns default-unlocked decks plus the caller's achievement-unlocked decks
(the UNLOCK#DECK# rows), minus the Tutorial deck (its own checkbox owns it).
`user_id` comes from the Cognito JWT, never the request — a caller only ever
sees their own unlocks.
"""
from fastapi import APIRouter, Depends

from shared.auth import get_current_user_id
from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import UserRepo
from shared.game.constants import TUTORIAL_DECK_NAME

from gameplay_lambda.routes._deps import get_catalog, get_user_repo
from gameplay_lambda.routes._schemas import DeckOption

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("", response_model=list[DeckOption])
def list_available_decks(
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),  
):
    """Return all enabled decks with unlock status for the calling user.
    
    - Default decks are always unlocked (no achievement required).
    - Achievement-gated decks are only included when the user has the
      matching UNLOCK#DECK#<name> item in DynamoDB.
    - Decks without a starting_card_id are included but marked accordingly
      so the frontend can disable or hide them until content is ready.
    """
    unlocked_names = set(users.list_unlocked_decks(user_id))

    result: list[DeckOption] = []
    for deck in catalog.list_decks():
        # The Tutorial deck is owned by the tutorial checkbox, not the deck
        # picker — its cards are seeded one-by-one via the scripted intro.
        if deck.name == TUTORIAL_DECK_NAME:
            continue
        is_default = deck.unlock_rule.kind == "default"
        unlocked = is_default or deck.name in unlocked_names
        if not unlocked:
            continue  # achievement-gated and not yet earned — hide entirely
        result.append(DeckOption(
            name=deck.name,
            description=deck.description,
            image_url=deck.image_url,
        ))

    return result
