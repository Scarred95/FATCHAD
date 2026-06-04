# gameplay_lambda/routes/runs.py
"""Run lifecycle — create, list, load, abandon, delete.

The active game loop (card display, choice submission, summary) lives in
gameplay.py. `user_id` is derived from the caller's Cognito JWT (`sub` claim)
via the get_current_user_id dependency — never taken from the request body or
query string, so a caller can only ever touch their own runs.
"""
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from shared.auth import get_current_user_id
from shared.db.catalog_snapshot import CatalogSnapshot
from shared.db.user_repo import RunConflict, UserRepo
from shared.game.deck import draw_eligible_card
from shared.schemas import Effects, GameState

from gameplay_lambda.routes._deps import (
    get_catalog,
    get_owned_run,
    get_user_repo,
    require_active,
)
from gameplay_lambda.routes._schemas import (
    CardResponse,
    CreateRunRequest,
    HistoryDetailEntry,
    RunSummary,
    TurnResponse,
)

router = APIRouter(prefix="/runs", tags=["runs"])

# Fallback seed when no decks are selected or a selected deck has no
# starting_card_id. Tutorial chains itself via adds_to_deck.
_TUTORIAL_SEED = "evt_tut_01_awakening"


@router.post("", response_model=TurnResponse, status_code=201)
def create_run(
    payload: CreateRunRequest = None,
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Start a new run. Returns state + first card so the client needs one request."""
    selected = (payload.selected_decks if payload else []) or []

    # Build starting deck from each selected deck's seed card.
    # Fall back to the tutorial seed if no deck provides a starting card.
    starting_deck: list[str] = []
    for deck_name in selected:
        deck = catalog.get_deck(deck_name)
        if deck and deck.starting_card_id:
            starting_deck.append(deck.starting_card_id)
    if not starting_deck:
        starting_deck = [_TUTORIAL_SEED]

    # Snapshot the default ending ids into the run — from here the set lives in
    # the savestate, so admin edits to defaults won't change in-flight runs.
    state = GameState.new_run(
        run_id=GameState.generate_id(),
        user_id=user_id,
        rng_seed=random.randint(0, 2**31 - 1),
        starting_deck=starting_deck,
        starting_endings=catalog.default_ending_ids(),
        selected_deck_names=selected,
    )

    # Peek the first card before saving — if nothing's playable, end the run
    # up-front so we write the final state in a single DDB round-trip.
    first_card = draw_eligible_card(state, catalog)
    if first_card is None:
        # Engine sentinel, not an Ending doc — the run never really started.
        state.status = "ended"
        state.ending = "softlock_no_cards"

    try:
        users.insert_run(state)
    except RunConflict:
        # generate_id() collided — astronomically rare; treat as a real conflict.
        raise HTTPException(409, "Run id collision — retry")

    return TurnResponse(
        state=state,
        next_card=CardResponse.from_event(first_card) if first_card else None,
    )


@router.get("", response_model=list[RunSummary])
def list_runs(
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
):
    """List a user's runs as lightweight summaries. Pulls full rows then projects
    — a ProjectionExpression would save bytes once a user has many runs."""
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
        for s in users.list_runs_for_user(user_id)
    ]


@router.get("/{run_id}", response_model=GameState)
def get_run(state: GameState = Depends(get_owned_run)):
    """Load a run — used to resume an in-progress run after a page reload."""
    return state


@router.get("/{run_id}/history", response_model=list[HistoryDetailEntry])
def get_history(
    state: GameState = Depends(get_owned_run),
    catalog: CatalogSnapshot = Depends(get_catalog),
):
    """Run play history (oldest first) with card + chosen-option data joined.
    Entries whose event was deleted since play get a placeholder + zeroed effects."""
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
    state: GameState = Depends(get_owned_run),
    users: UserRepo = Depends(get_user_repo),
):
    """Gracefully quit an active run — marks it abandoned (keeps history)."""
    require_active(state)
    prior_status = state.status
    state.status     = "abandoned"
    state.updated_at = datetime.now(timezone.utc)
    users.update_run(state, prior_status=prior_status)
    return state


@router.delete("/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    force: bool = False,
    user_id: str = Depends(get_current_user_id),
    state: GameState = Depends(get_owned_run),
    users: UserRepo = Depends(get_user_repo),
):
    """Permanently delete a run. Active runs are protected — pass ?force=true to
    delete anyway; prefer POST /abandon to quit cleanly while keeping history."""
    if state.status == "active" and not force:
        raise HTTPException(
            409,
            "Run is active. Use POST /abandon to quit cleanly, "
            "or pass ?force=true to delete anyway.",
        )
    if not users.delete_run(user_id, run_id):
        # Shouldn't happen — we just loaded it. Treat as race condition.
        raise HTTPException(404, "Run not found")
