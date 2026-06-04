# shared/game/achievements.py
"""Achievement evaluation — pure function, no I/O.

Called once per ended run. Takes the final GameState and the catalog, returns
the list of Achievement objects that are newly earned (not yet in already_earned).
"""
from __future__ import annotations

from shared.db.catalog_snapshot import CatalogSnapshot
from shared.schemas import Achievement, GameState


def evaluate_new_achievements(
    state: GameState,
    catalog: CatalogSnapshot,
    already_earned: set[str],
) -> list[Achievement]:
    """Return achievements the completed run qualifies for that the user hasn't
    earned yet. Only called when state.status == 'ended'."""
    if state.status != "ended":
        return []

    return [
        ach
        for ach in catalog.list_achievements()
        if ach.enabled
        and ach.id not in already_earned
        and _matches(ach, state)
    ]


def _matches(ach: Achievement, state: GameState) -> bool:
    c = ach.criteria
    if c.kind == "ending_reached":
        return c.ending_id is not None and state.ending == c.ending_id
    if c.kind == "turns_survived":
        return c.min_turns is not None and state.turn >= c.min_turns
    return False
