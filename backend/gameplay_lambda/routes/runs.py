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
from shared.db.leaderboard_repo import LeaderboardRepo
from shared.db.user_repo import RunConflict, UserRepo
from shared.game.achievements import evaluate_achievements
from shared.game.constants import (
    MIN_RUN_DECKS,
    MIN_RUN_REDRAW_CARDS,
    TUTORIAL_DECK_NAME,
)
from shared.game.deck import build_run_deck, draw_eligible_card, refill_deck_if_needed
from shared.schemas import Effects, GameState

from gameplay_lambda.routes._deps import (
    get_catalog,
    get_is_guest,
    get_leaderboard_repo,
    get_owned_run,
    get_user_repo,
    require_active,
)
from gameplay_lambda.routes.leaderboard import sync_points_for_grants
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
_TUTORIAL_STARTER = ["evt_tut_01_awakening"]


@router.post("", response_model=TurnResponse, status_code=201)
def create_run(
    body: CreateRunRequest | None = None,
    user_id: str = Depends(get_current_user_id),
    users: UserRepo = Depends(get_user_repo),
    catalog: CatalogSnapshot = Depends(get_catalog),
    lb: LeaderboardRepo = Depends(get_leaderboard_repo),
    is_guest: bool = Depends(get_is_guest),
):
    """Start a new run. Returns state + first card so the client needs one request."""
    opts = body or CreateRunRequest()

    # One seeded RNG for the whole creation (deck shuffle + initial refill),
    # stored on the run so it replays deterministically.
    rng_seed = random.randint(0, 2**31 - 1)
    rng = random.Random(rng_seed)

    # Resolve which decks feed the run. The 'catch': no explicit selection →
    # every default-unlocked deck.
    resolved = opts.deck_ids or catalog.default_deck_names()
    if len(resolved) < MIN_RUN_DECKS:
        raise HTTPException(409, "Nicht genügend Decks ausgewählt, um einen Run zu starten.")

    # Tutorial is excluded from the random redraw pool (it has its own seeded
    # path); its cards only ever enter via the starter seed + adds_to_deck chain.
    deck_ids = [d for d in resolved if d != TUTORIAL_DECK_NAME]
    redraw_deck = build_run_deck(deck_ids, catalog, rng)
    if len(redraw_deck) < MIN_RUN_REDRAW_CARDS:
        raise HTTPException(409, "Nicht genügend ziehbare Karten, um einen Run zu starten.")

    # Seed the live start deck: the scripted tutorial starter (when enabled)
    # plus each selected story deck's starting_card_id, so a story deck opens on
    # its own scripted card that then chains via adds_to_deck. All seeds are
    # shuffled together so multi-deck runs get a random scripted opener.
    starting_deck: list[str] = list(_TUTORIAL_STARTER) if opts.tutorial else []
    for name in deck_ids:
        deck = catalog.get_deck(name)
        if deck and deck.starting_card_id:
            starting_deck.append(deck.starting_card_id)
    rng.shuffle(starting_deck)

    # Snapshot the run's ending set into the savestate — globals plus the
    # selected decks' default endings, minus deck removals. From here the set
    # lives in the run, so admin edits to defaults won't change in-flight runs.
    state = GameState.new_run(
        run_id=GameState.generate_id(),
        user_id=user_id,
        rng_seed=rng_seed,
        starting_deck=starting_deck,
        starting_endings=catalog.active_ending_ids_for_run(deck_ids),
        deck_ids=deck_ids,
        redraw_deck=redraw_deck,
    )

    # Fill the live deck from the redraw pool (force past the threshold) before
    # peeking. Safe to call unconditionally: refill_deck_if_needed honours the
    # tutorial gate internally, so a tutorial run keeps its scripted single-card
    # opener while a story-starter or plain run gets a full deck — the scripted
    # starter(s) stay on top and are drawn first.
    state = refill_deck_if_needed(state, catalog, force=True, rng=rng)

    # Peek the first card before saving — if nothing's playable, end the run
    # up-front so we write the final state in a single DDB round-trip.
    first_card = draw_eligible_card(state, catalog)
    if first_card is None:
        # Engine sentinel, not an Ending doc — the run never really started.
        state.status = "ended"
        state.ending = "softlock_no_cards"
        # A softlock can still satisfy turn/stat-based criteria; grade it.
        unlocked = evaluate_achievements(state, user_id, catalog, users)
        state.newly_unlocked = [a.id for a in unlocked]
        # Mirror any points gained onto the points board (skips guests).
        sync_points_for_grants(lb, users, user_id, unlocked, is_guest)

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
