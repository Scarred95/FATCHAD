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

from gameplay_lambda.routes._deps import get_catalog, get_user_repo
from gameplay_lambda.routes._schemas import DeckOption

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("", response_model=list[DeckOption])
def list_available_decks(
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Decks this player can choose from on the new-run screen."""
    unlocked = set(users.list_unlocked_deck_names(user_id))
    return [
        DeckOption(name=d.name, description=d.description)
        for d in catalog.available_decks(unlocked)
    ]
