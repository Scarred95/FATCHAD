# shared/game/deck.py
"""Deck operations: draw eligible cards, refill from the generic pool, and
advance scheduled cards into the deck.

Sync — input is a RAM-resident CatalogSnapshot and the Lambda is
single-invocation per container, so there's no concurrency to win.
"""
from __future__ import annotations

import random

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.game.constants import (
    DECK_DRAW_BATCH,
    DECK_REFILL_THRESHOLD,
    DECK_TARGET_SIZE,
    GENERIC_CATEGORIES,
    TUTORIAL_ID_PREFIX,
)
from shared.game.eligibility import is_eligible
from shared.schemas import DeckAddition, Event, GameState, ScheduledCard


# =============================================================================
# Drawing
# =============================================================================

def _scan_top(
    state: GameState,
    catalog: CatalogSnapshot,
) -> tuple[list[str], dict[str, Event], int | None]:
    """Inspect the top DECK_DRAW_BATCH cards; find the first eligible one.

    Single source of truth for the top-of-deck scan, shared by the peek
    (draw_eligible_card) and pop (consume_top_card) paths.

    Returns (top_ids, id->Event lookup, index of first eligible or None).
    """
    if not state.deck:
        return [], {}, None

    top_ids = state.deck[:DECK_DRAW_BATCH]
    by_id = _by_id(catalog.get_cards(top_ids))

    for i, card_id in enumerate(top_ids):
        card = by_id.get(card_id)
        if card is None:
            continue  # stale id (card deleted from content) — skip
        if is_eligible(card, state):
            return top_ids, by_id, i

    return top_ids, by_id, None


def draw_eligible_card(state: GameState, catalog: CatalogSnapshot) -> Event | None:
    """Peek the first eligible top-of-deck card without mutating the deck.

    Returns None if the deck is empty or no card in the top batch is eligible.
    """
    top_ids, by_id, drawn_index = _scan_top(state, catalog)
    if drawn_index is None:
        return None
    return by_id[top_ids[drawn_index]]


def draw_with_refill_retry(
    state: GameState,
    catalog: CatalogSnapshot,
) -> tuple[GameState, Event | None]:
    """Draw; if nothing eligible, force-refill once and retry. In-memory only
    (no DB writes). Returns (state, card) — state may be new if refill ran.

    For callers that can't assume a healthy deck, e.g. POST /choice where stat
    or flag changes can leave the top batch all ineligible.
    """
    card = draw_eligible_card(state, catalog)
    if card is not None:
        return state, card

    new_state = refill_deck_if_needed(state, catalog, force=True)
    card = draw_eligible_card(new_state, catalog)
    return new_state, card


def consume_top_card(state: GameState, catalog: CatalogSnapshot) -> tuple[GameState, Event | None]:
    """Pop the top eligible card, returning it and the new state.

    Ineligible cards above the drawn one are resolved here (only on an actual
    consume): important+enabled → reshuffled deeper; everything else (non-
    important, disabled, stale) → dropped. If nothing's eligible, the deck is
    left UNCHANGED so it can recover when state changes.
    """
    new_state = _clone(state)
    top_ids, by_id, drawn_index = _scan_top(new_state, catalog)

    if drawn_index is None:
        return new_state, None

    drawn_card = by_id[top_ids[drawn_index]]

    # Collect important cards above the drawn one to reshuffle; drop the rest.
    # `enabled=False` overrides `important`, so a soft-decommissioned questline
    # card is dropped, not preserved.
    to_reshuffle: list[str] = []
    for j in range(drawn_index):
        card = by_id.get(top_ids[j])
        if card is None:
            continue  # stale → dropped
        if card.important and card.enabled:
            to_reshuffle.append(top_ids[j])

    # Keep everything below the drawn card untouched.
    new_deck = new_state.deck[drawn_index + 1:]

    # Re-insert important cards at random positions, per-turn seeded for replay.
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
    """Insert a choice's adds_to_deck into the deck or the scheduled list.

    position top/bottom/shuffle place into the deck; in_turns=N defers to
    scheduled, firing on state.turn + N.
    """
    # Most choices add nothing — skip the deep copy.
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
            # randrange(n+1) spans every insert slot, 0 (top) through n (bottom).
            idx = rng.randrange(len(new_state.deck) + 1) if new_state.deck else 0
            new_state.deck.insert(idx, addition.card_id)
        # other values can't occur — schema Literal constrains position.

    return new_state


# =============================================================================
# Scheduling — promote due scheduled cards into the deck
# =============================================================================

def promote_due_scheduled(state: GameState) -> GameState:
    """Move scheduled cards whose play_on_turn has arrived to the top of the
    deck (so the consequence lands now). Called once per turn after updates."""
    new_state = _clone(state)
    still_scheduled: list[ScheduledCard] = []

    for sched in new_state.scheduled:
        if sched.play_on_turn <= new_state.turn:
            new_state.deck.insert(0, sched.card_id)
        else:
            still_scheduled.append(sched)

    new_state.scheduled = still_scheduled
    return new_state


# =============================================================================
# Refill — keep the deck from drying up
# =============================================================================

def cleanup_zombie_tutorial_cards(state: GameState) -> GameState:
    """Once `tutorial_done` is set, drop any leftover tut_* cards from deck and
    scheduled — they're permanently ineligible and would clog the deck. No-op
    while the tutorial is still running."""
    if "tutorial_done" not in state.flags:
        return state

    new_state = _clone(state)
    new_state.deck = [
        cid for cid in new_state.deck if not cid.startswith(TUTORIAL_ID_PREFIX)
    ]
    new_state.scheduled = [
        s for s in new_state.scheduled if not s.card_id.startswith(TUTORIAL_ID_PREFIX)
    ]
    return new_state


def refill_deck_if_needed(
    state: GameState,
    catalog: CatalogSnapshot,
    force: bool = False,
) -> GameState:
    """Top the deck up to DECK_TARGET_SIZE when below threshold.

    `force=True` bypasses the threshold (not the tutorial gate) — used by read
    routes to recover from "has cards but none eligible". Assumes the caller
    already ran cleanup_zombie_tutorial_cards (the effects.py orchestrator does).
    """
    if _tutorial_still_queued(state):
        return state

    if not force and len(state.deck) >= DECK_REFILL_THRESHOLD:
        return state

    new_state = _clone(state)
    rng = random.Random(state.rng_seed + state.turn)  # per-turn seeded RNG
    needed = DECK_TARGET_SIZE - len(new_state.deck)

    candidates = _gather_candidate_pool(new_state, catalog)
    if not candidates:
        # Nothing to add. Caller should probably end the run gracefully.
        return new_state

    # Skip cards already in the deck or scheduled.
    in_deck = set(new_state.deck)
    in_scheduled = {s.card_id for s in new_state.scheduled}
    fresh = [
        c for c in candidates
        if c.id not in in_deck and c.id not in in_scheduled
    ]

    # Weighted sample without replacement (Efraimidis-Spirakis): key each card
    # by rand^(1/weight), take the top-k. One pass, stable under the seeded RNG.
    keyed = [(rng.random() ** (1.0 / c.weight), c) for c in fresh]
    keyed.sort(key=lambda kc: kc[0], reverse=True)

    to_take = min(needed, len(keyed))
    for _, card in keyed[:to_take]:
        new_state.deck.append(card.id)

    return new_state


def _tutorial_still_queued(state: GameState) -> bool:
    """True while the tutorial is running and tut_* cards remain in the deck.

    Drops once `evt_tut_10_finale` sets `tutorial_done` (otherwise zombie
    tutorial cards would block refill forever). Ignores state.scheduled on
    purpose: a not-yet-due scheduled tutorial card would gate refill and empty
    the deck — it gets promoted to the top when due, so it still plays next.
    """
    if "tutorial_done" in state.flags:
        return False
    return any(cid.startswith(TUTORIAL_ID_PREFIX) for cid in state.deck)


def _gather_candidate_pool(
    state: GameState,
    catalog: CatalogSnapshot,
) -> list[Event]:
    """Eligible refill candidates from the generic categories. Excludes
    weight<=0 (questline/ending opt-outs) and important cards (those only
    enter via adds_to_deck, never at random)."""
    cards = catalog.cards_by_categories(GENERIC_CATEGORIES)
    return [
        c for c in cards
        if c.weight > 0 and not c.important and is_eligible(c, state)
    ]


# =============================================================================
# Helpers
# =============================================================================

def _clone(state: GameState) -> GameState:
    """Deep-copy state to keep mutations isolated."""
    return state.model_copy(deep=True)


def _by_id(cards: list[Event]) -> dict[str, Event]:
    return {c.id: c for c in cards}
