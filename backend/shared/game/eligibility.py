# shared/game/eligibility.py
"""Card eligibility — can a card be drawn given the current state?"""
from shared.game.requirements import flags_satisfied, requirements_satisfied
from shared.schemas import Event, GameState


def is_eligible(event: Event, state: GameState) -> bool:
    """Draw-time check: True if the card is enabled and ALL its requirements
    hold (flags AND stats).

    Disabled cards are soft-removed from the live game (never deleted); the
    schema defaults a missing `enabled` field to True.
    """
    if not event.enabled:
        return False
    return requirements_satisfied(state, event.requires)


def is_redraw_eligible(event: Event, state: GameState) -> bool:
    """Refill-time check: enabled + FLAG requirements only — stat ranges are
    intentionally ignored.

    A card refilled into the deck now may not be reached for several turns, by
    which point stats have changed, so stat-gating at refill is misleading.
    Stats are enforced when the card actually surfaces, via is_eligible.
    """
    if not event.enabled:
        return False
    return flags_satisfied(state, event.requires)
