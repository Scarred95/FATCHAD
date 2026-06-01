# shared/game/effects.py
"""Turn orchestrator — the single mutation entry point for a player's choice.

Sequences the sub-steps and delegates to deck.py (cards), endings.py
(win/loss), and hints.py (presentation; called by routes, not here).
"""
from __future__ import annotations

from datetime import datetime, timezone

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.game.constants import STAT_NAMES
from shared.game.deck import (
    apply_deck_additions,
    cleanup_zombie_tutorial_cards,
    consume_top_card,
    promote_due_scheduled,
    refill_deck_if_needed,
    turn_rng,
)
from shared.game.endings import check_endings
from shared.schemas import Choice, Effects, Event, GameState, HistoryEntry, Stats


# =============================================================================
# Main entry point
# =============================================================================

def apply_choice(
    state: GameState,
    card: Event,
    choice_index: int,
    catalog: CatalogSnapshot,
) -> GameState:
    """Apply a choice and return the fully updated state.

    Raises ValueError if choice_index is out of range — a programmer-error
    contract. The HTTP layer should have already validated it and returned a
    400; this guard protects non-HTTP callers and catches refactor regressions.
    """
    if not (0 <= choice_index < len(card.choices)):
        raise ValueError(f"choice_index {choice_index} out of range for card {card.id}")

    choice = card.choices[choice_index]
    # One RNG stream for the whole turn — threaded through every sub-step so
    # they don't independently replay the same seed (no correlated draws).
    rng = turn_rng(state)

    # 1. Remove the played card (deep-copies state, drops stale/ineligible
    #    cards above it). The card itself is discarded — we already have it.
    new_state, _ = consume_top_card(state, catalog, rng=rng)

    # 2. Stats (no clamping). 3. Flags.
    new_state.stats = _apply_effects(new_state.stats, choice.effects)
    new_state.flags = _apply_flag_mutations(new_state.flags, choice)

    # 4. Deck additions from this choice.
    new_state = apply_deck_additions(new_state, choice.adds_to_deck, rng)

    # 5. History + turn counter.
    new_state.history.append(
        HistoryEntry(event_id=card.id, choice=choice_index, turn=new_state.turn)
    )
    new_state.turn += 1

    # 6. Promote due scheduled cards.
    new_state = promote_due_scheduled(new_state)

    # 7. Tutorial zombie cleanup — before refill, so it doesn't waste candidate
    #    slots on cards about to be stripped.
    new_state = cleanup_zombie_tutorial_cards(new_state)

    # 8. Refill if low.
    new_state = refill_deck_if_needed(new_state, catalog, rng=rng)

    # 9. Evaluate endings + apply this choice's unlocks/removes (see endings.py).
    new_state = check_endings(new_state, choice, catalog)

    new_state.updated_at = datetime.now(timezone.utc)
    return new_state


# =============================================================================
# Stat + flag mutation
# =============================================================================

def _apply_effects(stats: Stats, effects: Effects) -> Stats:
    """Add effect deltas to stats. No clamping — endings (not the engine) gate
    out-of-band values, so a quest can drop an ending to lift the cap."""
    return Stats(**{n: getattr(stats, n) + getattr(effects, n) for n in STAT_NAMES})


def _apply_flag_mutations(flags: list[str], choice: Choice) -> list[str]:
    """Return a new flag list with the choice's sets/clears applied.

    Flags are idempotent binary state. Clears win over sets within one choice
    (so a set+clear authoring bug ends cleared). Sorted for stable diffs.
    """
    new_flags = set(flags)
    new_flags.update(choice.sets_flags)
    new_flags.difference_update(choice.clears_flags)
    return sorted(new_flags)
