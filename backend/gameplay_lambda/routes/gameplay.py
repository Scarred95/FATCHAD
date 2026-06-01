# gameplay_lambda/routes/gameplay.py
"""Active game loop — the endpoints a client calls while playing.

GET  /runs/{run_id}/card      → peek at the current card (used on resume)
POST /runs/{run_id}/choice    → submit a choice; returns updated state + next card
GET  /runs/{run_id}/summary   → end-screen data (only once the run has ended)

Run lifecycle (create / list / get / abandon / delete) lives in runs.py.
"""
from fastapi import APIRouter, Depends, HTTPException

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import StaleRunWrite, UserRepo
from shared.game.deck import draw_eligible_card, draw_with_refill_retry
from shared.game.effects import apply_choice
from shared.schemas import GameState

from gameplay_lambda.routes._deps import (
    get_catalog,
    get_owned_run,
    get_user_repo,
    require_active,
    require_inactive,
)
from gameplay_lambda.routes._schemas import (
    CardResponse,
    ChoiceRequest,
    EndSummary,
    TurnResponse,
)

router = APIRouter(prefix="/runs", tags=["gameplay"])


@router.get("/{run_id}/card", response_model=CardResponse | None)
def get_current_card(
    state: GameState = Depends(get_owned_run),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Peek the current card without consuming it (used on resume; normal play
    already gets the next card in the POST /choice response). Read-only — a None
    is a real "nothing playable right now" signal, not papered over here."""
    require_active(state)
    card = draw_eligible_card(state, catalog)
    return CardResponse.from_event(card) if card else None


@router.post("/{run_id}/choice", response_model=TurnResponse)
def submit_choice(
    payload: ChoiceRequest,
    state: GameState = Depends(get_owned_run),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Submit a choice: apply effects, advance the turn, return updated state +
    the next card (saves the client a round-trip)."""
    require_active(state)

    # Reject stale sequential retries — a turn mismatch means it already applied.
    if payload.expected_turn != state.turn:
        raise HTTPException(
            409,
            f"Stale request: client expected turn {payload.expected_turn}, "
            f"run is on turn {state.turn}",
        )

    # Safety net for a top batch gone all-ineligible: refill+shuffle once,
    # in-memory only. We save a single time at the end of the request.
    state, current_card = draw_with_refill_retry(state, catalog)
    if current_card is None:
        raise HTTPException(409, "No drawable card right now — try again")

    if not (0 <= payload.choice_index < len(current_card.choices)):
        raise HTTPException(400, "Invalid choice_index for this card")

    # apply_choice handles consumption, effects, flags, deck adds, scheduling,
    # tutorial cleanup, refill, and ending checks.
    prior_status = state.status
    new_state = apply_choice(state, current_card, payload.choice_index, catalog)

    try:
        # Ending hit — save and return without a next card.
        if new_state.status != "active":
            users.update_run(new_state, prior_status=prior_status)
            return TurnResponse(state=new_state, next_card=None)

        # Piggyback the next card; same refill safety net.
        new_state, next_card = draw_with_refill_retry(new_state, catalog)
        users.update_run(
            new_state, prior_status=prior_status, expected_turn=payload.expected_turn
        )
    except StaleRunWrite as e:
        # A concurrent submit already advanced this run.
        raise HTTPException(409, "Run was updated concurrently — reload and retry") from e

    return TurnResponse(
        state=new_state,
        next_card=CardResponse.from_event(next_card) if next_card else None,
    )


@router.get("/{run_id}/summary", response_model=EndSummary)
def get_summary(
    state: GameState = Depends(get_owned_run),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """End-screen data: ending label + body, final stats, turn count, card count.
    Only callable once the run has ended; the ending body is denormalised in so
    the recap renders from one fetch."""
    require_inactive(state)

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
