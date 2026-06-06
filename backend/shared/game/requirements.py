# shared/game/requirements.py
"""Shared flag/stat predicate evaluator.

Card eligibility and ending evaluation check the same `Requirements` shape
against a run's state — this is the one place that logic lives.
"""
from shared.schemas import GameState, Requirements, StatRange


def requirements_satisfied(state: GameState, req: Requirements) -> bool:
    """True when every flag and stat predicate holds for the given state."""
    return flags_satisfied(state, req) and _stats(state, req)


def flags_satisfied(state: GameState, req: Requirements) -> bool:
    """True when every FLAG predicate holds — stat constraints are ignored.

    Used by the refill/redraw path: a card pulled into the deck now may not
    surface for several turns, by which point stats have moved, so only the
    more deliberate flag gates apply at refill. Stats are re-checked at draw
    time via requirements_satisfied (is_eligible)."""
    return (
        _flags_all(state, req)
        and _flags_none(state, req)
        and _flags_any(state, req)
    )


def _flags_all(state: GameState, req: Requirements) -> bool:
    """Every flag in flags_all must be set."""
    if not req.flags_all:
        return True
    return set(req.flags_all).issubset(state.flags)


def _flags_none(state: GameState, req: Requirements) -> bool:
    """No flag in flags_none may be set."""
    if not req.flags_none:
        return True
    return set(state.flags).isdisjoint(req.flags_none)


def _flags_any(state: GameState, req: Requirements) -> bool:
    """At least one flag in flags_any must be set (when the list is non-empty)."""
    if not req.flags_any:
        return True
    return not set(state.flags).isdisjoint(req.flags_any)


def _stats(state: GameState, req: Requirements) -> bool:
    """Every stat constraint must hold. Unknown stat name => unsatisfiable,
    which surfaces authoring bugs instead of silently passing."""
    if not req.stats:
        return True
    values = state.stats.model_dump()
    for name, rng in req.stats.items():
        if name not in values or not _in_range(values[name], rng):
            return False
    return True


def _in_range(value: int, rng: StatRange) -> bool:
    """Inclusive min/max check; an unset bound doesn't constrain that side."""
    if rng.min is not None and value < rng.min:
        return False
    if rng.max is not None and value > rng.max:
        return False
    return True
