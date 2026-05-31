# gameplay_lambda/routes/gameplay.py
"""Active game loop — the endpoints a client calls while playing.

GET  /runs/{run_id}/card      → peek at the current card (used on resume)
POST /runs/{run_id}/choice    → submit a choice; returns updated state + next card
GET  /runs/{run_id}/summary   → end-screen data (only available once run has ended)

Run lifecycle (create / list / get / abandon / delete) lives in runs.py.
"""
from fastapi import APIRouter, Depends, HTTPException

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import UserRepo
from shared.game.deck import draw_eligible_card, draw_with_refill_retry
from shared.game.effects import apply_choice

from gameplay_lambda.routes._deps import get_catalog, get_user_repo
from gameplay_lambda.routes._schemas import (
    CardResponse,
    ChoiceRequest,
    EndSummary,
    TurnResponse,
)

router = APIRouter(prefix="/runs", tags=["gameplay"])


@router.get("/{run_id}/card", response_model=CardResponse | None)
def get_current_card(
    run_id: str,
    user_id: str,
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Peek at the card currently at the top of the deck without consuming it.

    Used on resume after a page reload — during normal play the next card is
    already included in the TurnResponse from POST /choice.

    Read-only: never writes to the DB. apply_choice keeps the deck stocked,
    so a None here is a real signal (no playable cards right now) rather than
    something to paper over with a force-refill.
    """
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status != "active":
        raise HTTPException(409, f"Run is no longer active (status={state.status}); no current card")

    card = draw_eligible_card(state, catalog)
    return CardResponse.from_event(card) if card else None


@router.post("/{run_id}/choice", response_model=TurnResponse)
def submit_choice(
    run_id: str,
    user_id: str,
    payload: ChoiceRequest,
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Submit a choice for the current card.

    Applies all effects, advances the turn, and returns the updated state
    plus the next card (saves the client an extra round-trip).
    """
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status != "active":
        raise HTTPException(409, f"Run is already {state.status}")

    # Reject stale retries — if the client thinks it's on a different turn,
    # this request was already applied. Required field (no opt-out).
    if payload.expected_turn != state.turn:
        raise HTTPException(
            409,
            f"Stale request: client expected turn {payload.expected_turn}, "
            f"run is on turn {state.turn}",
        )

    # Use the refill-retry helper as a safety net — apply_choice's standard
    # refill almost always covers this, but a rare flag/stat shift could leave
    # the top batch all ineligible. Refill is in-memory only; we save once at
    # the end of the request.
    state, current_card = draw_with_refill_retry(state, catalog)
    if current_card is None:
        raise HTTPException(409, "No drawable card right now — try again")

    if not (0 <= payload.choice_index < len(current_card.choices)):
        raise HTTPException(400, "Invalid choice_index for this card")

    # apply_choice handles: card consumption, stat effects, flags, deck
    # additions, scheduled promotion, tutorial cleanup, refill, and ending checks.
    prior_status = state.status
    new_state = apply_choice(state, current_card, payload.choice_index, catalog)

    # Ending hit — save and return without a next card.
    if new_state.status != "active":
        users.update_run(new_state, prior_status=prior_status)
        return TurnResponse(state=new_state, next_card=None)

    # Piggyback the next card on the response. Same safety-net retry — if still
    # None, the run stays active and the client can poll /card again.
    new_state, next_card = draw_with_refill_retry(new_state, catalog)

    users.update_run(new_state, prior_status=prior_status)
    return TurnResponse(
        state=new_state,
        next_card=CardResponse.from_event(next_card) if next_card else None,
    )


@router.get("/{run_id}/summary", response_model=EndSummary)
def get_summary(
    run_id: str,
    user_id: str,
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """End-screen data: ending label + body, final stats, turn count, card count.

    Only callable once the run has ended (status != active). The ending body
    is denormalised in so the frontend renders the recap from one fetch.
    """
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status == "active":
        raise HTTPException(409, "Run is still active")

    ending_doc = catalog.get_ending(state.ending) if state.ending else None

    return EndSummary(
        ending=state.ending,
        ending_title=ending_doc.title if ending_doc else None,
        ending_description=ending_doc.description if ending_doc else None,
        status=state.status,
        turns_survived=state.turn,
        final_stats=state.stats,
        cards_played=len(state.history),
    )
