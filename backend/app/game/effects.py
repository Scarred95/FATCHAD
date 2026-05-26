# app/game/effects.py
"""Turn orchestrator — applies a player's choice to the game state.

This is the single mutation entry point. It sequences the sub-steps and
delegates to specialised modules:
  - deck.py      → card consumption, deck additions, scheduled promotion, refill
  - endings.py   → win/loss condition evaluation
  - hints.py     → frontend hint derivation (imported by routes, not called here)

Pure-ish: takes a state, returns a new state. The only async steps are the
deck operations that need EventRepo to fetch card content from the DB.
"""
import random
from datetime import datetime, timezone

from app.db.repositories import EventRepo
from app.game.constants import CHAOS_MAX, CHAOS_MIN, STAT_MAX, STAT_MIN
from app.game.deck import (
    apply_deck_additions,
    cleanup_zombie_tutorial_cards,
    consume_top_card,
    promote_due_scheduled,
    refill_deck_if_needed,
)
from app.game.endings import check_endings
from app.schemas import Choice, Effects, Event, GameState, HistoryEntry, Stats


# =============================================================================
# Main entry point
# =============================================================================

async def apply_choice(
    state: GameState,
    card: Event,
    choice_index: int,
    events: EventRepo,
) -> GameState:
    """Apply a choice and return the fully updated state.

    Steps:
      1. Remove the played card from the deck (consume_top_card handles the deep copy)
      2. Apply stat effects (clamped to valid ranges)
      3. Apply flag mutations (sets/clears)
      4. Add cards to deck/scheduled from this choice's adds_to_deck
      5. Append history entry, increment turn counter
      6. Promote scheduled cards whose turn has arrived
      7. Strip leftover tutorial cards if the tutorial just ended
      8. Refill deck if running low
      9. Evaluate win/loss/ending conditions

    Raises:
        ValueError: if `choice_index` is out of range. This is a
        programmer-error contract — the HTTP layer is expected to have
        already validated the index against the current card and returned a
        clean 400 to the user. The guard here protects non-HTTP callers
        (admin/debug tools, tests) and catches refactor regressions before
        they corrupt state with an IndexError.
    """
    if not (0 <= choice_index < len(card.choices)):
        raise ValueError(f"choice_index {choice_index} out of range for card {card.id}")

    choice = card.choices[choice_index]
    # Per-turn seeded RNG: deterministic within a turn, different each turn.
    rng = random.Random(state.rng_seed + state.turn)

    # 1. Remove the played card from the deck. consume_top_card deep-copies state,
    #    drops any stale/ineligible cards that were sitting above it, and returns
    #    the new deck state. The card itself is discarded (we already have it).
    new_state, _ = await consume_top_card(state, events)

    # 2. Stats — returns a new Stats object
    new_state.stats = _apply_effects(new_state.stats, choice.effects)

    # 3. Flags — returns a new flag list
    new_state.flags = _apply_flag_mutations(new_state.flags, choice)

    # 4. Deck additions
    new_state = apply_deck_additions(new_state, choice.adds_to_deck, rng)

    # 5. History + turn counter
    new_state.history.append(
        HistoryEntry(event_id=card.id, choice=choice_index, turn=new_state.turn)
    )
    new_state.turn += 1

    # 6. Promote scheduled cards whose turn has arrived
    new_state = promote_due_scheduled(new_state)

    # 7. Tutorial zombie cleanup — must run before refill so it doesn't waste
    #    candidate slots on cards that are about to be stripped.
    new_state = cleanup_zombie_tutorial_cards(new_state)

    # 8. Refill deck if running low (async — needs DB access)
    new_state = await refill_deck_if_needed(new_state, events)

    # 9. Evaluate win/loss/ending conditions (see endings.py for priority order)
    new_state = check_endings(new_state, choice)

    new_state.updated_at = datetime.now(timezone.utc)
    return new_state


# =============================================================================
# Stat effects
# =============================================================================

def _apply_effects(stats: Stats, effects: Effects) -> Stats:
    """Apply effect deltas, clamping each stat to its valid range."""
    return Stats(
        moneten=_clamp(stats.moneten + effects.moneten, STAT_MIN, STAT_MAX),
        aura=   _clamp(stats.aura    + effects.aura,    STAT_MIN, STAT_MAX),
        respekt=_clamp(stats.respekt + effects.respekt, STAT_MIN, STAT_MAX),
        rizz=   _clamp(stats.rizz    + effects.rizz,    STAT_MIN, STAT_MAX),
        chaos=  _clamp(stats.chaos   + effects.chaos,   CHAOS_MIN, CHAOS_MAX),
    )


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


# =============================================================================
# Flag mutations
# =============================================================================

def _apply_flag_mutations(flags: list[str], choice: Choice) -> list[str]:
    """Return a new flag list with the choice's sets/clears applied.

    Flags are one-time, binary state — setting a flag that's already set is a
    no-op (sets are idempotent). There are no flag counters; if you need
    "how many times" semantics, model it via stats or a stand-alone counter.

    Clears win over sets within a single choice — if a choice both sets and
    clears the same flag (authoring bug), the flag ends up cleared.
    """
    new_flags = set(flags)
    new_flags.update(choice.sets_flags)
    new_flags.difference_update(choice.clears_flags)
    return sorted(new_flags)  # sorted for stable serialization, easier diffs
