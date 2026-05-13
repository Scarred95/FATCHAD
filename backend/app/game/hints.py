# app/game/hints.py
"""Frontend hint derivation.

Generates ChoiceHints from a choice's actual effects when the card author
didn't write explicit hints. This is a presentation concern — it lives
here rather than in the routes layer so it stays testable in isolation,
but it has no role in the game engine itself.
"""
from app.schemas import Choice, ChoiceHints, StatHint


def derive_hints_from_effects(choice: Choice) -> ChoiceHints:
    """Auto-generate directional hints based on the sign of each effect delta.

    Returns "up" for positive deltas, "down" for negative, None (hidden) for zero.
    Used as a fallback when a card author didn't write explicit hints.
    """
    def sign(value: int) -> StatHint | None:
        if value > 0: return "up"
        if value < 0: return "down"
        return None

    e = choice.effects
    return ChoiceHints(
        moneten=sign(e.moneten),
        aura=sign(e.aura),
        respekt=sign(e.respekt),
        rizz=sign(e.rizz),
        chaos=sign(e.chaos),
    )
