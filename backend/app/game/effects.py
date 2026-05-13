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
from app.game.deck import (
    apply_deck_additions,
    consume_top_card,
    promote_due_scheduled,
    refill_deck_if_needed,
)
from app.game.endings import (
    CHAOS_MAX, CHAOS_MIN, STAT_MAX, STAT_MIN,
    check_endings,
)
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
      4. Tick down flag timers (and clear any that expired)
      5. Add cards to deck/scheduled from this choice's adds_to_deck
      6. Append history entry, increment turn counter
      7. Promote scheduled cards whose turn has arrived
      8. Refill deck if running low
      9. Evaluate win/loss/ending conditions
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

    # 3–4. Flags and timers — mutate new_state in-place (safe: it's already a deep copy)
    new_state = _apply_flag_mutations(new_state, choice)
    new_state = _tick_flag_timers(new_state)

    # 5. Deck additions
    new_state = apply_deck_additions(new_state, choice.adds_to_deck, rng)

    # 6. History + turn counter
    new_state.history.append(
        HistoryEntry(event_id=card.id, choice=choice_index, turn=new_state.turn)
    )
    new_state.turn += 1

    # 7. Promote scheduled cards whose turn has arrived
    new_state = promote_due_scheduled(new_state, rng)

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
# Flag mutations and timers
# =============================================================================

def _apply_flag_mutations(state: GameState, choice: Choice) -> GameState:
    """Set and clear flags as the choice dictates.

    Flags are one-time, binary state — setting a flag that's already set is a
    no-op (sets are idempotent). There are no flag counters; if you need
    "how many times" semantics, model it via stats or a stand-alone counter.
    """
    flags = set(state.flags)

    for flag in choice.sets_flags:
        flags.add(flag)

    for flag in choice.clears_flags:
        flags.discard(flag)
        # Also clear the timer so it can't ghost-expire if the flag is re-set later.
        state.flag_timers.pop(flag, None)

    state.flags = sorted(flags)  # sorted for stable serialization, easier diffs
    return state


def _tick_flag_timers(state: GameState) -> GameState:
    """Decrement all active flag timers; remove flags whose timers reach zero."""
    expired: list[str] = []
    new_timers: dict[str, int] = {}

    for flag, turns_left in state.flag_timers.items():
        remaining = turns_left - 1
        if remaining <= 0:
            expired.append(flag)
        else:
            new_timers[flag] = remaining

    state.flag_timers = new_timers
    if expired:
        flags = set(state.flags)
        for flag in expired:
            flags.discard(flag)
        state.flags = sorted(flags)

    return state
