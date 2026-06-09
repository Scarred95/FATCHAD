# gameplay_lambda/routes/decks.py
"""Deck selection — the decks a player may pick when starting a run.

Returns default-unlocked decks plus the caller's achievement-unlocked decks
(the UNLOCK#DECK# rows), minus the Tutorial deck (its own checkbox owns it) and
minus any deck that can't actually open a run. `user_id` comes from the Cognito
JWT, never the request — a caller only ever sees their own unlocks.
"""
from fastapi import APIRouter, Depends

from shared.auth import get_current_user_id
from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import UserRepo
from shared.schemas import Deck

from gameplay_lambda.routes._deps import get_catalog, get_user_repo
from gameplay_lambda.routes._schemas import DeckOption

router = APIRouter(prefix="/decks", tags=["decks"])


def _is_startable(deck: Deck, catalog: CatalogSnapshot) -> bool:
    """A deck can open a run only if it brings playable content: either a
    scripted starting card that still exists, or at least one enabled, drawable
    (weight>0) card in its pool. A deck whose cards are all disabled/add-only
    would be selectable but unstartable, so it's hidden here."""
    if deck.starting_card_id and catalog.get_card(deck.starting_card_id):
        return True
    return any(
        c.enabled and c.weight > 0
        for c in catalog.cards_by_deck_names([deck.name])
    )


@router.get("", response_model=list[DeckOption])
def list_available_decks(
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Return the decks the calling user may pick for a run.

    `available_decks` already enforces the rules that decide *visibility*:
    enabled-only, Tutorial excluded, and default-unlocked OR in the user's
    achievement grants. On top of that we drop decks that can't open a run
    (no startable cards) so the picker never offers an empty/unplayable deck.
    """
    unlocked_names = set(users.list_unlocked_decks(user_id))

    return [
        DeckOption(
            name=deck.name,
            description=deck.description,
            image_url=deck.image_url,
        )
        for deck in catalog.available_decks(unlocked_names)
        if _is_startable(deck, catalog)
    ]
