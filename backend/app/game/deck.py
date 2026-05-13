# app/game/deck.py
"""Deck operations: draw eligible cards, refill from generic pool,
advance scheduled cards into the deck.

These functions are async ONLY because they need EventRepo to fetch card
content. The mutations themselves are pure.
"""
import random

from app.db.repositories import EventRepo
from app.game.eligibility import is_eligible
from app.schemas import DeckAddition, Event, GameState, ScheduledCard


# ----- tunable constants  -----

DECK_TARGET_SIZE = 12
DECK_REFILL_THRESHOLD = 5

# How many top-of-deck cards to fetch in one batch when looking for an eligible card.
# Bigger value = fewer round-trips at the cost of fetching cards we may not use.
DECK_DRAW_BATCH = 5

# Categories considered "filler" — used to top up the deck when running low
GENERIC_CATEGORIES = ["politik", "social", "economy", "chaos"]

# Tutorial cards share this ID prefix (evt_tut_01_*..evt_tut_10_*). While any
# tutorial card is still sitting in the deck, refill is held off so the
# scripted intro plays out without generic cards bleeding in between beats.
TUTORIAL_ID_PREFIX = "evt_tut_"


# =============================================================================
# Drawing
# =============================================================================

async def draw_eligible_card(state: GameState, events: EventRepo) -> Event | None:
    """Find the top-of-deck card that's eligible given current state.

    Fetches the top DECK_DRAW_BATCH cards from the deck in a single Mongo call
    and walks them top-down. Skips ineligible / stale cards without removing
    them — consumption happens in consume_top_card when a choice is committed.

    Returns None if none of the top batch are eligible. Refill should keep the
    deck large enough that the eligible card is almost always inside this window.
    """
    if not state.deck:
        return None

    top_ids = state.deck[:DECK_DRAW_BATCH]
    cards = await events.get_many(top_ids)
    by_id = _by_id(cards)

    for card_id in top_ids:
        card = by_id.get(card_id)
        if card is None:
            continue  # stale ID (card deleted from content) — skip
        if is_eligible(card, state):
            return card

    return None


async def consume_top_card(state: GameState, events: EventRepo) -> tuple[GameState, Event | None]:
    """Remove the top eligible card from the deck and return it along with the new state.

    Cleanup of ineligible cards happens here, only when something is actually
    consumed. For each ineligible card sitting above the drawn card:
      - card.important == True  → re-shuffled to a random position deeper in the deck
      - card.important == False → dropped (its moment passed; it won't come up again)
      - stale ID (card deleted)  → dropped
    If no card in the top batch is eligible, returns (cloned_state, None) with
    the deck UNCHANGED so it can recover later if state changes.
    """
    new_state = _clone(state)
    if not new_state.deck:
        return new_state, None

    top_ids = new_state.deck[:DECK_DRAW_BATCH]
    cards = await events.get_many(top_ids)
    by_id = {c.id: c for c in cards}

    drawn_index: int | None = None
    for i, card_id in enumerate(top_ids):
        card = by_id.get(card_id)
        if card is None:
            continue
        if is_eligible(card, new_state):
            drawn_index = i
            break

    if drawn_index is None:
        # Nothing eligible in the top batch — leave the deck untouched.
        return new_state, None

    drawn_card = by_id[top_ids[drawn_index]]

    # Walk the cards above the drawn one: drop non-important ineligibles and
    # stales; collect important ineligibles to re-shuffle back into the deck.
    to_reshuffle: list[str] = []
    for j in range(drawn_index):
        cid = top_ids[j]
        card = by_id.get(cid)
        if card is None:
            continue  # stale → dropped
        if card.important:
            to_reshuffle.append(cid)
        # else: ineligible non-important → dropped

    # Keep everything from drawn_index+1 onward (untouched portion of deck).
    new_deck = new_state.deck[drawn_index + 1:]

    # Re-insert important cards at random positions. Per-turn seeded RNG so
    # reshuffles are reproducible from (rng_seed, turn).
    rng = random.Random(state.rng_seed + state.turn)
    for cid in to_reshuffle:
        idx = rng.randrange(len(new_deck) + 1) if new_deck else 0
        new_deck.insert(idx, cid)

    new_state.deck = new_deck
    return new_state, drawn_card

# =============================================================================
# Adding cards from a choice
# =============================================================================

def apply_deck_additions(
    state: GameState,
    additions: list[DeckAddition],
    rng: random.Random,
) -> GameState:
    """Insert cards from a choice's adds_to_deck into deck or scheduled list.

    - position="top"     → prepend to deck
    - position="bottom"  → append to deck
    - position="shuffle" → random index
    - in_turns=N         → goes to scheduled, fires on state.turn + N
    """
    # Most choices have no deck additions — skip the deep copy in that case.
    if not additions:
        return state

    new_state = _clone(state)

    for addition in additions:
        if addition.in_turns is not None:
            new_state.scheduled.append(
                ScheduledCard(
                    card_id=addition.card_id,
                    play_on_turn=new_state.turn + addition.in_turns,
                )
            )
            continue

        if addition.position == "top":
            new_state.deck.insert(0, addition.card_id)
        elif addition.position == "bottom":
            new_state.deck.append(addition.card_id)
        elif addition.position == "shuffle":
            # randrange(n+1) covers all valid insert positions: 0 (top) through n (bottom).
            idx = rng.randrange(len(new_state.deck) + 1) if new_state.deck else 0
            new_state.deck.insert(idx, addition.card_id)
        # any other position value: silently ignored — schema's Literal prevents this

    return new_state

# =============================================================================
# Scheduling — promote due scheduled cards into the deck
# =============================================================================

def promote_due_scheduled(state: GameState, rng: random.Random) -> GameState:
    """Move scheduled cards whose play_on_turn has arrived into the deck.

    Called once per turn after stats/flags are updated.
    """
    new_state = _clone(state)
    still_scheduled: list[ScheduledCard] = []

    for sched in new_state.scheduled:
        if sched.play_on_turn <= new_state.turn:
            # Insert at top so the consequence lands now, not in 5 more cards
            new_state.deck.insert(0, sched.card_id)
        else:
            still_scheduled.append(sched)

    new_state.scheduled = still_scheduled
    return new_state

# =============================================================================
# Refill — keep the deck from drying up
# =============================================================================

async def refill_deck_if_needed(
    state: GameState,
    events: EventRepo,
    force: bool = False,
) -> GameState:
    """If the deck has fewer than threshold cards, top it up to the target size.

    Tutorial gate: skipped while a tutorial card is still in the deck so the
    scripted intro plays without generic cards bleeding in.

    `force=True` bypasses the threshold check (but not the tutorial gate),
    used by the read-side routes to recover from a "deck has cards but none
    eligible right now" state.
    """
    rng = random.Random(state.rng_seed + state.turn)  # per-turn seeded RNG
    if _tutorial_still_queued(state):
        return state

    new_state = _clone(state)

    # Tutorial-done cleanup: tut_10_finale clears the intermediate tutorial
    # flags, leaving any leftover tut_* cards in the deck permanently
    # ineligible. Strip them so they can't clog the top of the deck.
    if "tutorial_done" in new_state.flags:
        new_state.deck = [cid for cid in new_state.deck if not cid.startswith(TUTORIAL_ID_PREFIX)]
        new_state.scheduled = [s for s in new_state.scheduled if not s.card_id.startswith(TUTORIAL_ID_PREFIX)]

    if not force and len(new_state.deck) >= DECK_REFILL_THRESHOLD:
        return new_state

    needed = DECK_TARGET_SIZE - len(new_state.deck)

    candidates = await _gather_candidate_pool(new_state, events)
    if not candidates:
        # Nothing to add. Caller should probably end the run gracefully.
        return new_state

    # Already in the deck or scheduled? Don't double-add.
    in_deck = set(new_state.deck)
    in_scheduled = {s.card_id for s in new_state.scheduled}
    fresh = [
        c for c in candidates
        if c.id not in in_deck and c.id not in in_scheduled
    ]

    # Weighted-random sample without replacement (Efraimidis-Spirakis):
    # for each card draw a key = rand^(1/weight), then take the top-k by key.
    # Equivalent to repeated weighted picks but in one pass and stable under
    # the per-turn seeded RNG.
    keyed = [(rng.random() ** (1.0 / c.weight), c) for c in fresh]
    keyed.sort(key=lambda kc: kc[0], reverse=True)

    to_take = min(needed, len(keyed))
    for _, card in keyed[:to_take]:
        new_state.deck.append(card.id)

    return new_state

def _tutorial_still_queued(state: GameState) -> bool:
    """True if the tutorial is still running and tutorial cards remain in the deck.

    Once the player has played `evt_tut_10_finale` (which sets `tutorial_done`
    and clears the intermediate tutorial flags), the gate drops — any
    leftover tutorial cards in the deck are zombies (their required flags
    were just cleared) and would block refill forever otherwise.

    Intentionally ignores `state.scheduled` — a scheduled tutorial card may
    not be due to promote for several turns, and gating refill on it would
    leave the deck empty in the meantime, softlocking the run. Scheduled
    tutorial cards get inserted at the top of the deck via
    `promote_due_scheduled` when their turn arrives, so they still play
    next even if a few generic refill cards now sit under them.
    """
    if "tutorial_done" in state.flags:
        return False
    return any(cid.startswith(TUTORIAL_ID_PREFIX) for cid in state.deck)


async def _gather_candidate_pool(
    state: GameState,
    events: EventRepo,
) -> list[Event]:
    """Collect eligible cards from generic categories for refill.

    Single $in query — fetches all cards across all generic categories at once.
    Fine for hundreds of cards; if your library grows past a few thousand,
    switch to a server-side sample query.

    Excludes:
      - weight <= 0  (questline / ending cards opt-out of refill explicitly)
      - important   (these only enter the deck via adds_to_deck from another
                     card; they should never be picked at random)
    """
    cards = await events.get_by_categories(GENERIC_CATEGORIES)
    return [
        c for c in cards
        if c.weight > 0 and not c.important and is_eligible(c, state)
    ]

# =============================================================================
# Helpers
# =============================================================================

def _clone(state: GameState) -> GameState:
    """Deep-copy a state to keep mutations isolated."""
    return state.model_copy(deep=True)

def _by_id(cards: list[Event]) -> dict[str, Event]:
    """Helper to map card IDs to card objects."""
    return {c.id: c for c in cards}
