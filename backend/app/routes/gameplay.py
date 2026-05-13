# app/routes/gameplay.py
"""Active game loop — the endpoints a client calls while playing.

GET  /runs/{run_id}/card      → peek at the current card (used on resume)
POST /runs/{run_id}/choice    → submit a choice; returns updated state + next card
GET  /runs/{run_id}/summary   → end-screen data (only available once run has ended)

Run lifecycle (create / list / get / abandon / delete) lives in runs.py.
"""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.repositories import EventRepo, GameStateRepo
from app.game.deck import draw_eligible_card, refill_deck_if_needed
from app.game.effects import apply_choice
from app.routes._schemas import (
    CardResponse,
    ChoiceRequest,
    EndSummary,
    TurnResponse,
)

router = APIRouter(prefix="/runs", tags=["gameplay"])


# --- Dependency injectors ---

def get_state_repo(request: Request) -> GameStateRepo:
    return GameStateRepo(request.app.state.mongo.db)

def get_event_repo(request: Request) -> EventRepo:
    return EventRepo(request.app.state.mongo.db)


# --- Routes ---

@router.get("/{run_id}/card", response_model=CardResponse | None)
async def get_current_card(
    run_id: str,
    states: GameStateRepo = Depends(get_state_repo),
    events: EventRepo = Depends(get_event_repo),
):
    """Peek at the card currently at the top of the deck without consuming it.

    Mainly used when resuming a run after a page reload — during normal play
    the next card is already included in the TurnResponse from POST /choice.

    If the top batch is all ineligible, force a refill once and retry; if that
    still yields nothing, return null so the client can show an empty state.
    The run is NOT ended — generic cards will keep flowing.
    """
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status != "active":
        raise HTTPException(409, f"Run is {state.status}, no current card")

    card = await draw_eligible_card(state, events)
    if card is None:
        # Top batch all ineligible — top up and retry once.
        state = await refill_deck_if_needed(state, events, force=True)
        await states.save(state)
        card = await draw_eligible_card(state, events)

    if card is None:
        return None
    return CardResponse.from_event(card)


@router.post("/{run_id}/choice", response_model=TurnResponse)
async def submit_choice(
    run_id: str,
    payload: ChoiceRequest,
    states: GameStateRepo = Depends(get_state_repo),
    events: EventRepo = Depends(get_event_repo),
):
    """Submit a choice for the current card.

    Applies all effects, advances the turn, and returns the updated state
    plus the next card to display (saves the client an extra round-trip).
    """
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status != "active":
        raise HTTPException(409, f"Run is already {state.status}")

    # Idempotency guard: if expected_turn is provided and doesn't match, this
    # request was already processed (state advanced). Reject to prevent the same
    # choice being applied twice on a client retry.
    if payload.expected_turn is not None and payload.expected_turn != state.turn:
        raise HTTPException(
            409,
            f"Stale request: client expected turn {payload.expected_turn}, "
            f"run is on turn {state.turn}",
        )

    current_card = await draw_eligible_card(state, events)
    if current_card is None:
        # Top batch all ineligible — top up and retry once before giving up.
        state = await refill_deck_if_needed(state, events, force=True)
        await states.save(state)
        current_card = await draw_eligible_card(state, events)
    if current_card is None:
        raise HTTPException(409, "No drawable card right now — try again")

    if not (0 <= payload.choice_index < len(current_card.choices)):
        raise HTTPException(400, "Invalid choice_index for this card")

    # apply_choice handles: card consumption, stat effects, flags, timers,
    # deck additions, scheduled promotion, refill, and ending checks.
    new_state = await apply_choice(state, current_card, payload.choice_index, events)

    # If the turn resolved with an ending, save and return — no next card needed.
    if new_state.status != "active":
        await states.save(new_state)
        return TurnResponse(state=new_state, next_card=None)

    # Draw the next card to piggyback on the response (saves the client a round-trip).
    next_card = await draw_eligible_card(new_state, events)
    if next_card is None:
        # Top batch all ineligible — top up once and retry. If still nothing,
        # return next_card=null; the run stays active and the client can poll
        # /card again. No softlock ending.
        new_state = await refill_deck_if_needed(new_state, events, force=True)
        next_card = await draw_eligible_card(new_state, events)

    await states.save(new_state)
    return TurnResponse(
        state=new_state,
        next_card=CardResponse.from_event(next_card) if next_card else None,
    )


@router.get("/{run_id}/summary", response_model=EndSummary)
async def get_summary(
    run_id: str,
    states: GameStateRepo = Depends(get_state_repo),
):
    """End-screen data: ending label, final stats, turn count, card count.

    Only callable once the run has ended (status != active).
    """
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status == "active":
        raise HTTPException(409, "Run is still active")

    return EndSummary(
        ending=state.ending,
        status=state.status,
        turns_survived=state.turn,
        final_stats=state.stats,
        cards_played=len(state.history),
    )
