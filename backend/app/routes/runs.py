# app/routes/runs.py
"""Run lifecycle — create, list, load, abandon, delete.

These routes manage the run record itself. The active game loop
(card display, choice submission, summary) lives in gameplay.py.
"""
import random
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.repositories import EventRepo, GameStateRepo
from app.schemas import GameState
from app.game.deck import draw_eligible_card
from app.routes._schemas import CardResponse, CreateRunRequest, RunSummary, TurnResponse

router = APIRouter(prefix="/runs", tags=["runs"])


# --- Dependency injectors ---

def get_state_repo(request: Request) -> GameStateRepo:
    return GameStateRepo(request.app.state.mongo.db)

def get_event_repo(request: Request) -> EventRepo:
    return EventRepo(request.app.state.mongo.db)


# --- Routes ---

@router.post("", response_model=TurnResponse, status_code=201)
async def create_run(
    payload: CreateRunRequest,
    states: GameStateRepo = Depends(get_state_repo),
    events: EventRepo = Depends(get_event_repo),
):
    """Start a new run. Returns state + first card so the client needs only one request."""
    run_id   = f"run_{uuid4().hex[:12]}"
    rng_seed = random.randint(0, 2**31 - 1)

    # Seed the deck with only the first tutorial card; every tutorial card chains
    # the next via `adds_to_deck` (position="top"), so they enter as they're earned.
    # Seeding the whole tutorial here would duplicate every card (once from the
    # starter, once from the chain) — the duplicates become ineligible the moment
    # they're played and clog the deck.
    starter_deck = ["evt_tut_01_awakening"]

    state = GameState.new_run(
        run_id=run_id,
        user_id=payload.user_id,
        rng_seed=rng_seed,
        starting_deck=starter_deck,
    )
    

    # Peek at the first card BEFORE saving — if there's nothing playable
    # (no tutorial cards seeded), record the run as already-lost in a single write.
    first_card = await draw_eligible_card(state, events)
    if first_card is None:
        state.status = "lost"
        state.ending = "softlock_no_cards"

    await states.save(state)

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
    await states.save(state)
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
