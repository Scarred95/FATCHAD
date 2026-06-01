# gameplay_lambda/routes/runs.py
"""Run lifecycle — create, list, load, abandon, delete.

These routes manage the run record itself. The active game loop
(card display, choice submission, summary) lives in gameplay.py.

`user_id` is currently passed explicitly (query param on lookups, body
field on creates). When auth lands, derive it from the bearer token and
strip those parameters in one pass.
"""
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import RunConflict, UserRepo
from shared.game.deck import draw_eligible_card
from shared.schemas import Effects, GameState

from gameplay_lambda.routes._deps import get_catalog, get_user_repo
from gameplay_lambda.routes._schemas import (
    CardResponse,
    CreateRunRequest,
    HistoryDetailEntry,
    RunSummary,
    TurnResponse,
)

router = APIRouter(prefix="/runs", tags=["runs"])

# Tutorial chains itself via adds_to_deck — seeding the whole list would
# duplicate every card and clog the deck. One entry is enough.
_STARTER_DECK = ["evt_tut_01_awakening"]


@router.post("", response_model=TurnResponse, status_code=201)
def create_run(
    payload: CreateRunRequest,
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Start a new run. Returns state + first card so the client needs only one request."""
    # Snapshot the current default ending ids into the run. From here on the
    # set lives in the savestate and is mutated only by quest choices; admin
    # edits to default endings won't retroactively change in-flight runs.
    default_ending_ids = catalog.default_ending_ids()

    state = GameState.new_run(
        run_id=GameState.generate_id(),
        user_id=payload.user_id,
        rng_seed=random.randint(0, 2**31 - 1),
        starting_deck=list(_STARTER_DECK),
        starting_endings=default_ending_ids,
    )

    # Peek at the first card before saving — if nothing is playable, end the
    # run up-front so we write the final state in a single DDB round-trip.
    first_card = draw_eligible_card(state, catalog)
    if first_card is None:
        # Engine-level sentinel — not backed by an Ending doc. The run never
        # really started, so there are no active endings to evaluate against.
        state.status = "ended"
        state.ending = "softlock_no_cards"

    try:
        users.insert_run(state)
    except RunConflict:
        # generate_id() collided with an existing run — astronomically rare,
        # but treat as a real conflict rather than silently overwriting.
        raise HTTPException(409, "Run id collision — retry")

    return TurnResponse(
        state=state,
        next_card=CardResponse.from_event(first_card) if first_card else None,
    )


@router.get("", response_model=list[RunSummary])
def list_runs(
    user_id: str,  # TODO: derive from auth token once auth is wired up
    users: UserRepo = Depends(get_user_repo),
):
    """List all runs belonging to a user. Returns lightweight summaries only.

    Pulls full GameState rows from DDB then projects them down — a
    ProjectionExpression in UserRepo.list_runs_for_user would save bytes
    once a user has many hundreds of runs; for now the simpler path wins.
    """
    states = users.list_runs_for_user(user_id)
    return [
        RunSummary(
            _id=s.id,
            status=s.status,
            turn=s.turn,
            stats=s.stats,
            ending=s.ending,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in states
    ]


@router.get("/{run_id}", response_model=GameState)
def get_run(
    run_id: str,
    user_id: str,
    users: UserRepo = Depends(get_user_repo),
):
    """Load a run — used to resume an in-progress run after a page reload."""
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    return state


@router.get("/{run_id}/history", response_model=list[HistoryDetailEntry])
def get_history(
    run_id: str,
    user_id: str,
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Return the run's play history with card + chosen-option data joined.

    Oldest first. Entries whose event was deleted since play keep their
    turn/choice_index but get a placeholder title and zeroed effects.
    """
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")

    if not state.history:
        return []

    # De-dupe ids before the lookup; a card can be played multiple times.
    ids = list({h.event_id for h in state.history})
    by_id = {e.id: e for e in catalog.get_cards(ids)}

    result: list[HistoryDetailEntry] = []
    for h in state.history:
        event = by_id.get(h.event_id)
        if event is None or h.choice >= len(event.choices):
            # Card deleted, or choice index now out of range after an edit.
            result.append(HistoryDetailEntry(
                turn=h.turn,
                event_id=h.event_id,
                title="(gelöscht)",
                choice_index=h.choice,
                choice_text="(unbekannt)",
                effects=Effects(),
            ))
            continue
        choice = event.choices[h.choice]
        result.append(HistoryDetailEntry(
            turn=h.turn,
            event_id=h.event_id,
            title=event.title,
            description=event.description,
            category=event.category,
            deck_name=event.deck_name,
            choice_index=h.choice,
            choice_text=choice.text,
            effects=choice.effects,
            sets_flags=list(choice.sets_flags),
            clears_flags=list(choice.clears_flags),
            triggered_ending=choice.triggers_ending,
        ))
    return result


@router.post("/{run_id}/abandon", response_model=GameState)
def abandon_run(
    run_id: str,
    user_id: str,
    users: UserRepo = Depends(get_user_repo),
):
    """Gracefully quit an active run. Marks it abandoned (preserves history) rather than deleting."""
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status != "active":
        raise HTTPException(409, f"Run is already {state.status}")
    prior_status = state.status
    state.status     = "abandoned"
    state.updated_at = datetime.now(timezone.utc)
    users.update_run(state, prior_status=prior_status)
    return state


@router.delete("/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    user_id: str,
    force: bool = False,
    users: UserRepo = Depends(get_user_repo),
):
    """Permanently delete a run record.

    Active runs are protected — pass ?force=true to delete anyway.
    Prefer POST /abandon to quit cleanly while preserving history.
    """
    state = users.get_run(user_id, run_id)
    if state is None:
        raise HTTPException(404, "Run not found")
    if state.status == "active" and not force:
        raise HTTPException(
            409,
            "Run is active. Use POST /abandon to quit cleanly, "
            "or pass ?force=true to delete anyway.",
        )
    deleted = users.delete_run(user_id, run_id)
    if not deleted:
        # Shouldn't happen — we just loaded it. Treat as race condition.
        raise HTTPException(404, "Run not found")
