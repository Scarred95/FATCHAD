# app/routes/_schemas.py
"""Shared API-layer request / response models.

These are the shapes the HTTP layer speaks — distinct from the DB-layer
schemas in app/schemas.py. Kept here so both runs.py and gameplay.py can
import them without creating circular dependencies.
"""
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from app.game.hints import derive_hints_from_effects
from app.schemas import Choice, Event, GameState, GameStatus, StatHint, Stats


# =============================================================================
# Requests
# =============================================================================

class CreateRunRequest(BaseModel):
    user_id: str  # TODO: derive from auth token once auth is wired up


class ChoiceRequest(BaseModel):
    choice_index: int
    # Include the current turn to guard against double-processing on client retries.
    # If provided and mismatched, the request is rejected as stale (see gameplay.py).
    expected_turn: int | None = None


# =============================================================================
# Card / turn responses
# =============================================================================

class ChoicePreview(BaseModel):
    """What the frontend sees about a choice — text + display hints, no raw effects."""
    text: str
    hints: dict[str, StatHint]  # e.g. {"moneten": "down", "aura": "up"}


class CardResponse(BaseModel):
    """Card as sent to the client — backend-only fields (weight, requires, etc.) stripped."""
    id: str
    title: str
    description: str
    choices: list[ChoicePreview]
    image_url: str | None = None

    @classmethod
    def from_event(cls, event: Event) -> "CardResponse":
        """Build the client-facing payload from a stored Event."""
        return cls(
            id=event.id,
            title=event.title,
            description=event.description,
            image_url=event.image_url,
            choices=[
                ChoicePreview(text=c.text, hints=_resolve_hints(c))
                for c in event.choices
            ],
        )


def _resolve_hints(choice: Choice) -> dict[str, StatHint]:
    """Use authored hints if present, else derive from effect signs.
    Returns only stats that have a non-null hint (no nulls in the dict)."""
    explicit = choice.hints.model_dump(exclude_none=True)
    if explicit:
        return explicit
    return derive_hints_from_effects(choice).model_dump(exclude_none=True)


class TurnResponse(BaseModel):
    """Returned after create_run and after every choice submission.

    Bundles the new game state with the next card so the client avoids
    an extra round-trip to GET /card.
    """
    state: GameState
    next_card: CardResponse | None


# =============================================================================
# Run list / summary responses
# =============================================================================

class RunSummary(BaseModel):
    """Lightweight run entry for list/lobby views.

    Omits deck, history, flags, flag_timers, rng_seed — none of which are
    needed to render a run list. Backed by a projected DB query.
    """
    id: str = Field(alias="_id")
    status: GameStatus
    turn: int
    stats: Stats
    ending: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(populate_by_name=True)


class EndSummary(BaseModel):
    """End-of-run stats shown on the results / game-over screen."""
    ending: str | None
    status: GameStatus
    turns_survived: int
    final_stats: Stats
    cards_played: int
