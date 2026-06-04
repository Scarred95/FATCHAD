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

def _scan_deck(
    state: GameState,
    catalog: CatalogSnapshot,
) -> tuple[list[str], dict[str, Event], int | None]:
    """Scan the WHOLE deck top→bottom for the first eligible card. Shared by the
    peek (draw_eligible_card) and pop (consume_top_card) paths, so they always
    agree. Returns (deck_ids, id->Event lookup, index of first eligible or None)."""
    if not state.deck:
        return [], {}, None

    ids = state.deck
    by_id = _by_id(catalog.get_cards(ids))
    for i, card_id in enumerate(ids):
        card = by_id.get(card_id)
        if card is not None and is_eligible(card, state):
            return ids, by_id, i
    return ids, by_id, None


def draw_eligible_card(state: GameState, catalog: CatalogSnapshot) -> Event | None:
    """Peek the first eligible card anywhere in the deck — read-only, no mutation.
    Recovery (refill/shuffle) lives in draw_with_refill_retry, never here, so a
    GET peek can't rewrite the saved deck."""
    ids, by_id, idx = _scan_deck(state, catalog)
    return by_id[ids[idx]] if idx is not None else None


def draw_with_refill_retry(
    state: GameState,
    catalog: CatalogSnapshot,
) -> tuple[GameState, Event | None]:
    """Peek the deck; if nothing's eligible anywhere, recover exactly ONCE:
    DRAW (force refill) → MIX (seeded whole-deck shuffle) → peek again. In-memory
    only. Returns (state, card); card may still be None if the candidate pool is
    dry, which the caller treats as a softlock."""
    card = draw_eligible_card(state, catalog)
    if card is not None:
        return state, card

    rng = turn_rng(state)  # one stream shared by refill + shuffle (no correlation)
    new_state = refill_deck_if_needed(state, catalog, force=True, rng=rng)
    new_state = _shuffle_deck(new_state, rng)
    return new_state, draw_eligible_card(new_state, catalog)


def consume_top_card(
    state: GameState,
    catalog: CatalogSnapshot,
    rng: random.Random | None = None,
) -> tuple[GameState, Event | None]:
    """Pop the first eligible card (scanning the whole deck). Cards ABOVE it are
    resolved now: important+enabled → reshuffled to a random slot (kept);
    everything else (non-important ineligible, disabled, stale) → dropped. With
    nothing eligible the deck is left UNCHANGED so it can recover."""
    new_state = _clone(state)
    ids, by_id, idx = _scan_deck(new_state, catalog)
    if idx is None:
        return new_state, None

    drawn_card = by_id[ids[idx]]
    rng = rng or turn_rng(state)

    # Keep everything below the drawn card; rebuild what's above it.
    new_deck = new_state.deck[idx + 1:]
    for j in range(idx):
        card = by_id.get(ids[j])
        if card is not None and card.important and card.enabled:
            pos = rng.randrange(len(new_deck) + 1) if new_deck else 0
            new_deck.insert(pos, ids[j])
        # else (non-important ineligible / disabled / stale) → dropped

    new_state.deck = new_deck
    return new_state, drawn_card


def _shuffle_deck(state: GameState, rng: random.Random) -> GameState:
    """Whole-deck shuffle with the given seeded RNG (replay-stable). Only used by
    the recovery path, where deck order is moot (nothing was playable)."""
    new_state = _clone(state)
    rng.shuffle(new_state.deck)
    return new_state


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
    rng: random.Random | None = None,
) -> GameState:
    """Top the deck up to DECK_TARGET_SIZE when below threshold.

    `force=True` bypasses the threshold (not the tutorial gate). Assumes the
    caller already ran cleanup_zombie_tutorial_cards (the effects.py orchestrator
    does)."""
    if _tutorial_still_queued(state):
        return state

    if not force and len(state.deck) >= DECK_REFILL_THRESHOLD:
        return state

    new_state = _clone(state)
    rng = rng or turn_rng(state)
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
    """Eligible refill candidates for the deck.

    When the run has selected_deck_names, draws only from those decks.
    Falls back to GENERIC_CATEGORIES for runs started before deck selection
    existed (empty list = legacy run).

    Excludes weight<=0 (questline/ending opt-outs) and important cards
    (those only enter via adds_to_deck, never at random).
    """
    if state.selected_deck_names:
        cards = catalog.cards_by_deck_names(state.selected_deck_names)
    else:
        cards = catalog.cards_by_categories(GENERIC_CATEGORIES)
    return [
        c for c in cards
        if c.weight > 0 and not c.important and is_eligible(c, state)
    ]


# =============================================================================
# Helpers
# =============================================================================

def turn_rng(state: GameState) -> random.Random:
    """Per-turn seeded RNG: deterministic within a turn, different each turn.
    Single source so every draw/shuffle/refill in a turn shares one definition."""
    return random.Random(state.rng_seed + state.turn)


def _clone(state: GameState) -> GameState:
    """Deep-copy state to keep mutations isolated."""
    return state.model_copy(deep=True)


def _by_id(cards: list[Event]) -> dict[str, Event]:
    return {c.id: c for c in cards}
