# shared/game/endings.py
"""Ending evaluation — data-driven, sync.

Run once per turn after stats/flags/deck settle. Fires the highest-priority
enabled+active ending whose requirements match, then applies the choice's
own unlocks/removes to the run's active set.
"""
from __future__ import annotations

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.game.requirements import requirements_satisfied
from shared.schemas import Choice, Ending, GameState


# =============================================================================
# Public entry point
# =============================================================================

def check_endings(
    state: GameState,
    choice: Choice,
    catalog: CatalogSnapshot,
) -> GameState:
    """Evaluate active endings and apply this choice's ending mutations.

    May set status="ended" + ending=<id>. Always returns the (possibly
    mutated) state — never raises.
    """
    # Active set. The snapshot is already enabled-only (publish strips disabled
    # endings); the `if e.enabled` is a cheap defensive guard, not the gate.
    active = [e for e in catalog.get_endings(state.active_endings) if e.enabled]
    by_id = {e.id: e for e in active}

    # Card-triggered finale wins, but only if its id is in the active set.
    if choice.triggers_ending and choice.triggers_ending in by_id:
        _fire(state, by_id[choice.triggers_ending])
    # Otherwise the lowest-priority threshold match (if any).
    elif (match := _first_matching(state, active)) is not None:
        _fire(state, match)

    # Apply the choice's active-set mutations (removes win over unlocks).
    state.active_endings = _mutate_active_endings(
        state.active_endings,
        unlocks=choice.unlocks_endings,
        removes=choice.removes_endings,
    )
    return state


# =============================================================================
# Internal
# =============================================================================

def _first_matching(state: GameState, candidates: list[Ending]) -> Ending | None:
    """Lowest-priority ending whose requirements are satisfied, or None."""
    matches = [e for e in candidates if requirements_satisfied(state, e.requires)]
    if not matches:
        return None
    return min(matches, key=lambda e: e.priority)


def _fire(state: GameState, ending: Ending) -> None:
    """Stamp the ending onto state. Mutates in place."""
    state.status = "ended"
    state.ending = ending.id


def _mutate_active_endings(
    current: list[str],
    unlocks: list[str],
    removes: list[str],
) -> list[str]:
    """Apply unlocks + removes (removes win). Returns a NEW sorted list so
    serialization stays stable; the no-mutation case keeps the same reference."""
    if not unlocks and not removes:
        return current
    next_set = set(current)
    next_set.update(unlocks)
    next_set.difference_update(removes)
    return sorted(next_set)
