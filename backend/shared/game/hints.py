# shared/game/hints.py
"""Frontend hint derivation.

Generates ChoiceHints from a choice's actual effects when the author didn't
write explicit ones. Presentation-only — no role in the game engine.
"""
from shared.game.constants import STAT_NAMES
from shared.schemas import Choice, ChoiceHints, StatHint


def derive_hints_from_effects(choice: Choice) -> ChoiceHints:
    """Directional hint per stat from the sign of its effect delta: "up" for
    positive, "down" for negative, None (hidden) for zero."""
    e = choice.effects
    return ChoiceHints(**{n: _sign(getattr(e, n)) for n in STAT_NAMES})


def _sign(value: int) -> StatHint | None:
    if value > 0:
        return "up"
    if value < 0:
        return "down"
    return None


def resolve_hints(choice: Choice) -> dict[str, StatHint]:
    """Authored hints if present, else derived from effect signs. Returns only
    stats with a non-null hint (no nulls). Shared by the publish and live paths."""
    explicit = choice.hints.model_dump(exclude_none=True)
    if explicit:
        return explicit
    return derive_hints_from_effects(choice).model_dump(exclude_none=True)
