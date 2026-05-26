# app/routes/runs.py
"""Run lifecycle — create, list, load, abandon, delete.

These routes manage the run record itself. The active game loop
(card display, choice submission, summary) lives in gameplay.py.
"""
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from app.db.repositories import EndingRepo, EventRepo, GameStateRepo
from app.schemas import GameState
from app.game.deck import draw_eligible_card
from app.routes._deps import get_ending_repo, get_event_repo, get_state_repo
from app.routes._schemas import CardResponse, CreateRunRequest, RunSummary, TurnResponse

router = APIRouter(prefix="/runs", tags=["runs"])

# Tutorial chains itself via adds_to_deck — seeding the whole list would
# duplicate every card and clog the deck. One entry is enough.
_STARTER_DECK = ["evt_tut_01_awakening"]


@router.post("", response_model=TurnResponse, status_code=201)
async def create_run(
    payload: CreateRunRequest,
    states: GameStateRepo = Depends(get_state_repo),
    events: EventRepo = Depends(get_event_repo),
    endings: EndingRepo = Depends(get_ending_repo),
):
    """Start a new run. Returns state + first card so the client needs only one request."""
    # Snapshot the current default ending ids into the run. From here on the
    # set lives in the savestate and is mutated only by quest choices; admin
    # edits to default endings won't retroactively change in-flight runs.
    default_ending_ids = await endings.list_default_ids()

    state = GameState.new_run(
        run_id=GameState.generate_id(),
        user_id=payload.user_id,
        rng_seed=random.randint(0, 2**31 - 1),
        starting_deck=list(_STARTER_DECK),
        starting_endings=default_ending_ids,
    )

    # Peek at the first card before saving — if nothing is playable, mark the
    # run lost up-front so we write the final state in a single Mongo round-trip.
    first_card = await draw_eligible_card(state, events)
    if first_card is None:
        # Engine-level sentinel — not backed by an Ending doc. The run never
        # really started, so there are no active endings to evaluate against.
        state.status = "ended"
        state.ending = "softlock_no_cards"

    try:
        await states.insert(state)
    except DuplicateKeyError:
        # generate_id() collided with an existing run — astronomically rare,
        # but treat as a real conflict rather than silently overwriting.
        raise HTTPException(409, "Run id collision — retry")

    return TurnResponse(
        state=state,
        next_card=CardResponse.from_event(first_card) if first_card else None,
    )


@router.get("", response_model=list[RunSummary])
async def list_runs(
    user_id: str,  # TODO: derive from auth token once auth is wired up
    states: GameStateRepo = Depends(get_state_repo),
):
    """List all runs belonging to a user. Returns lightweight summaries only."""
    return await states.list_summaries_for_user(user_id)


@router.get("/{run_id}", response_model=GameState)
async def get_run(
    run_id: str,
    states: GameStateRepo = Depends(get_state_repo),
):
    """Load a run — used to resume an in-progress run after a page reload."""
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    return state


@router.post("/{run_id}/abandon", response_model=GameState)
async def abandon_run(
    run_id: str,
    states: GameStateRepo = Depends(get_state_repo),
):
    """Gracefully quit an active run. Marks it abandoned (preserves history) rather than deleting."""
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status != "active":
        raise HTTPException(409, f"Run is already {state.status}")
    state.status    = "abandoned"
    state.updated_at = datetime.now(timezone.utc)
    if not await states.update(state):
        # Deleted between load and write — race condition.
        raise HTTPException(404, "Run not found")
    return state


@router.delete("/{run_id}", status_code=204)
async def delete_run(
    run_id: str,
    force: bool = False,
    states: GameStateRepo = Depends(get_state_repo),
):
    """Permanently delete a run record.

    Active runs are protected — pass ?force=true to delete anyway.
    Prefer POST /abandon to quit cleanly while preserving history.
    """
    state = await states.get(run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status == "active" and not force:
        raise HTTPException(
            409,
            "Run is active. Use POST /abandon to quit cleanly, "
            "or pass ?force=true to delete anyway.",
        )
    deleted = await states.delete(run_id)
    if not deleted:
        # Shouldn't happen — we just loaded it. Treat as race condition.
        raise HTTPException(404, "Run not found")
