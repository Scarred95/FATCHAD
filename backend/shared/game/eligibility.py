# shared/game/eligibility.py
"""Eligibility checks — can a card be drawn given the current game state?

Pure functions. No I/O, no side effects. Easy to test in isolation.
"""
from shared.schemas import Event, GameState, StatRange


def is_eligible(event: Event, state: GameState) -> bool:
    """True if the card's requirements are satisfied by the current state.

    Disabled cards (`enabled=False`) are never eligible — they're soft-removed
    from the live game without being deleted from the database. Existing
    documents that don't have the field read as enabled by default (handled
    in the Pydantic schema, not here).
    """
    if not event.enabled:
        return False
    return (
        _flags_all_satisfied(event, state)
        and _flags_none_satisfied(event, state)
        and _flags_any_satisfied(event, state)
        and _stats_satisfied(event, state)
    )


def _flags_all_satisfied(event: Event, state: GameState) -> bool:
    """Every flag in flags_all must be set."""
    required = event.requires.flags_all
    if not required:
        return True
    player_flags = set(state.flags)
    return all(flag in player_flags for flag in required)


def _flags_none_satisfied(event: Event, state: GameState) -> bool:
    """No flag in flags_none may be set."""
    forbidden = event.requires.flags_none
    if not forbidden:
        return True
    player_flags = set(state.flags)
    return not any(flag in player_flags for flag in forbidden)


def _flags_any_satisfied(event: Event, state: GameState) -> bool:
    """At least one flag in flags_any must be set (if the list is non-empty)."""
    options = event.requires.flags_any
    if not options:
        return True
    player_flags = set(state.flags)
    return any(flag in player_flags for flag in options)


def _stats_satisfied(event: Event, state: GameState) -> bool:
    """Every stat constraint must be satisfied by the player's current stats."""
    constraints = event.requires.stats
    if not constraints:
        return True

    stats_dict = state.stats.model_dump()
    for stat_name, range_spec in constraints.items():
        if stat_name not in stats_dict:
            # Unknown stat in requirements — treat as unsatisfiable to surface bugs
            return False
        value = stats_dict[stat_name]
        if not _in_range(value, range_spec):
            return False
    return True


def _in_range(value: int, range_spec: StatRange) -> bool:
    if range_spec.min is not None and value < range_spec.min:
        return False
    if range_spec.max is not None and value > range_spec.max:
        return False
    return True
