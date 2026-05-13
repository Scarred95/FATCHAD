# app/game/endings.py
"""Win, loss, and ending conditions.

Called once per turn after stats, flags, and deck are fully updated.
Pure functions — no I/O, no side effects.

Priority order inside check_endings:
  1. Choice explicitly triggers an ending (questline finale — win or loss)
  2. Stat-extreme death (any main stat hits 0 or 100)
  3. Chaos extremes (chaos reaches ±100 — both are wins by design)

Wins happen only via card-triggered endings (triggers_ending) or chaos extremes.
There is no time-based or stat-hold win condition.
"""
from app.schemas import Choice, GameState, Stats


# =============================================================================
# Tunables
# =============================================================================

# Stat boundaries — also imported by effects.py for clamping
STAT_MIN   =    0
STAT_MAX   =  100
CHAOS_MIN  = -100
CHAOS_MAX  =  100


# =============================================================================
# Public entry point
# =============================================================================

def check_endings(state: GameState, choice: Choice) -> GameState:
    """Evaluate all ending conditions and set state.status / state.ending if triggered.

    Returns the (possibly mutated) state. Only the first matching condition fires.
    """
    # 1. Explicit ending from card choice (questline finale).
    # TODO: add triggers_ending_status: "won"|"lost" to Choice so finales can
    # resolve as losses. For now all explicit card endings are wins.
    if choice.triggers_ending:
        state.status = "won"
        state.ending = choice.triggers_ending
        return state

    # 2. Stat death — any main stat pegged to its floor or ceiling.
    death = _check_stat_death(state.stats)
    if death:
        state.status = "lost"
        state.ending = death
        return state

    # 3. Chaos extremes — reaching either pole is a win (mastery of chaos, not failure).
    #    Chaos has no death condition at its limits; only the four main stats do.
    if state.stats.chaos >= CHAOS_MAX:
        state.status = "won"
        state.ending = "chaos_agent"
    elif state.stats.chaos <= CHAOS_MIN:
        state.status = "won"
        state.ending = "grey_eminence"

    return state


# =============================================================================
# Internal helpers
# =============================================================================

def _check_stat_death(stats: Stats) -> str | None:
    """Return the ending ID for a boundary-death condition, or None.

    Stats are clamped to [STAT_MIN, STAT_MAX] before this is called, so
    equality is sufficient — values can never go past the boundary.
    """
    if stats.moneten == STAT_MIN: return "death_bankrupt"
    if stats.moneten == STAT_MAX: return "death_revolution"
    if stats.aura    == STAT_MIN: return "death_irrelevant"
    if stats.aura    == STAT_MAX: return "death_jumped_shark"
    if stats.respekt == STAT_MIN: return "death_couped"
    if stats.respekt == STAT_MAX: return "death_conspiracy"
    if stats.rizz    == STAT_MIN: return "death_frozen_out"
    if stats.rizz    == STAT_MAX: return "death_drowned_in_drama"
    return None
