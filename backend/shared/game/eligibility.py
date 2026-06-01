# shared/game/eligibility.py
"""Card eligibility — can a card be drawn given the current state?"""
from shared.game.requirements import requirements_satisfied
from shared.schemas import Event, GameState


def is_eligible(event: Event, state: GameState) -> bool:
    """True if the card is enabled and its requirements hold.

    Disabled cards are soft-removed from the live game (never deleted); the
    schema defaults a missing `enabled` field to True.
    """
    if not event.enabled:
        return False
    return requirements_satisfied(state, event.requires)
