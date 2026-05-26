# app/game/endings.py
"""Ending evaluation — data-driven, async.

Called once per turn after stats, flags, and deck are fully updated.
Checks for Active, not Disabled, endings whose requirements are satisfied by the new state, 
and applies the highest-priority match if any. 
Also applies card-triggered endings if the card has one

The "active set" lives on the savestate and is mutated by quest choices —
new runs snapshot defaults at creation, then the run's rules evolve.
"""

from app.db.repositories import EndingRepo
from app.schemas import Choice, Ending, EndingRequirements, GameState



# =============================================================================
# Public entry point
# =============================================================================

async def check_endings(
    state: GameState,
    choice: Choice,
    endings_repo: EndingRepo,
) -> GameState:
    """Evaluate active endings and apply this choice's ending mutations.

    May set state.status = "ended" + state.ending = <id> if an ending fires.
    Always returns the (possibly mutated) state — never raises.
    """
    # 1-2. Load + filter to enabled-only.
    active = await endings_repo.get_many(state.active_endings)
    active = [e for e in active if e.enabled]
    by_id = {e.id: e for e in active}

    # 3. Card-triggered finale — only honored if the id is in active_endings.
    if choice.triggers_ending and choice.triggers_ending in by_id:
        _fire(state, by_id[choice.triggers_ending])

    # 4. Threshold endings — pick lowest priority among matches.
    elif (match := _first_matching(state, active)) is not None:
        _fire(state, match)

    # 5. Apply choice's ending-set mutations (removes win over unlocks).
    state.active_endings = _mutate_active_endings(
        state.active_endings,
        unlocks=choice.unlocks_endings,
        removes=choice.removes_endings,
    )

    return state


# =============================================================================
# Internal — evaluation
# =============================================================================

def _first_matching(state: GameState, candidates: list[Ending]) -> Ending | None:
    """Lowest-priority Ending whose requirements are satisfied, or None."""
    matches = [e for e in candidates if _requirements_satisfied(state, e.requires)]
    if not matches:
        return None
    matches.sort(key=lambda e: e.priority)
    return matches[0]


def _fire(state: GameState, ending: Ending) -> None:
    """Stamp the ending onto state. Mutates in place."""
    state.status = "ended"
    state.ending = ending.id


def _requirements_satisfied(state: GameState, req: EndingRequirements) -> bool:
    """All four predicates must hold. Identical shape to event eligibility
    but kept here on purpose — endings will grow conditions cards don't have."""
    return (
        _flags_all_satisfied(state, req)
        and _flags_none_satisfied(state, req)
        and _flags_any_satisfied(state, req)
        and _stats_satisfied(state, req)
    )


def _flags_all_satisfied(state: GameState, req: EndingRequirements) -> bool:
    if not req.flags_all:
        return True
    held = set(state.flags)
    return all(f in held for f in req.flags_all)


def _flags_none_satisfied(state: GameState, req: EndingRequirements) -> bool:
    if not req.flags_none:
        return True
    held = set(state.flags)
    return not any(f in held for f in req.flags_none)


def _flags_any_satisfied(state: GameState, req: EndingRequirements) -> bool:
    if not req.flags_any:
        return True
    held = set(state.flags)
    return any(f in held for f in req.flags_any)


def _stats_satisfied(state: GameState, req: EndingRequirements) -> bool:
    if not req.stats:
        return True
    stats_dict = state.stats.model_dump()
    for stat_name, range_spec in req.stats.items():
        if stat_name not in stats_dict:
            return False
        value = stats_dict[stat_name]
        if range_spec.min is not None and value < range_spec.min:
            return False
        if range_spec.max is not None and value > range_spec.max:
            return False
    return True


# =============================================================================
# Internal — active-set mutation
# =============================================================================

def _mutate_active_endings(
    current: list[str],
    unlocks: list[str],
    removes: list[str],
) -> list[str]:
    """Apply unlocks + removes to the active set. Removes win on conflict.

    Returns a NEW sorted list so:
      - state mutations stay reproducible (sorted ids = stable serialization)
      - the caller doesn't accidentally retain a reference to the old list
    """
    if not unlocks and not removes:
        return current  # zero-mutation fast path, keep the same reference
    next_set = set(current)
    next_set.update(unlocks)
    next_set.difference_update(removes)
    return sorted(next_set)
