# app/schemas.py
from datetime import datetime, timezone
from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


# =============================================================================
# Shared building blocks
# =============================================================================

class Effects(BaseModel):
    """Stat changes applied by a choice. All default to 0 so cards only
    declare the stats they actually touch."""
    moneten: int = 0
    aura: int = 0
    respekt: int = 0
    rizz: int = 0
    chaos: int = 0

StatHint = Literal["up", "down", "unknown", "hidden"]
# "up"      → arrow up icon
# "down"    → arrow down icon
# "unknown" → question mark icon (this stat will change, magnitude unknown)
# "hidden"  → don't show this stat at all (acts like the field wasn't there)

class ChoiceHints(BaseModel):
    """Frontend display hints for what a choice will do.
    
    These are AUTHORED separately from effects — they don't have to mirror
    the actual effects. A card writer can hide consequences for drama,
    or show fake hints for a card that "lies" to the player.
    """
    moneten: Optional[StatHint] = None
    aura: Optional[StatHint] = None
    respekt: Optional[StatHint] = None
    rizz: Optional[StatHint] = None
    chaos: Optional[StatHint] = None



class StatRange(BaseModel):
    """Min/max constraint on a single stat."""
    min: Optional[int] = None
    max: Optional[int] = None


class Stats(BaseModel):
    """The four player stats plus the global Chaos value.
    Stats are 0-100, Chaos is -100 to +100."""
    moneten: int = Field(ge=0, le=100)
    aura: int = Field(ge=0, le=100)
    respekt: int = Field(ge=0, le=100)
    rizz: int = Field(ge=0, le=100)
    chaos: int = Field(ge=-100, le=100)

# =============================================================================
# Event schema (events collection)
# =============================================================================

class Requirements(BaseModel):
    """Eligibility constraints for a card to be drawable."""
    flags_all: list[str] = Field(default_factory=list)
    flags_none: list[str] = Field(default_factory=list)
    flags_any: list[str] = Field(default_factory=list)
    stats: dict[str, StatRange] = Field(default_factory=dict)

class DeckAddition(BaseModel):
    """A card scheduled to be added to the deck after a choice."""
    card_id: str
    position: Literal["top", "shuffle", "bottom"] = "shuffle"
    in_turns: Optional[int] = Field(default=None, ge=0)
    # If in_turns is set, the card goes to the scheduled list instead of the deck.

class Choice(BaseModel):
    text: str = Field(min_length=1)
    effects: Effects = Field(default_factory=Effects)
    hints: ChoiceHints = Field(default_factory=ChoiceHints)
    sets_flags: list[str] = Field(default_factory=list)
    clears_flags: list[str] = Field(default_factory=list)
    adds_to_deck: list[DeckAddition] = Field(default_factory=list)
    triggers_ending: Optional[str] = None

class Event(BaseModel):
    """An immutable event/card definition stored in the events collection."""
    id: str = Field(alias="_id")
    title: str
    description: str
    category: str
    weight: int = Field(default=10, ge=0)
    # If True, this card is preserved when ineligible — re-shuffled to a random
    # position in the deck instead of being dropped. Use for questline / arc
    # cards that should still get a chance to play once their requirements
    # eventually unlock.
    important: bool = False
    requires: Requirements = Field(default_factory=Requirements)
    choices: list[Choice] = Field(min_length=2, max_length=3)
    image_url: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

# =============================================================================
# Game state schema (game_states collection)
# =============================================================================

class ScheduledCard(BaseModel):
    card_id: str
    play_on_turn: int = Field(ge=0)


class HistoryEntry(BaseModel):
    event_id: str
    choice: int = Field(ge=0)
    turn: int = Field(ge=0)

GameStatus = Literal["active", "won", "lost", "abandoned"]

class GameState(BaseModel):
    """Per-run save data stored in the game_states collection."""
    id: str = Field(alias="_id")
    user_id: str
    deck: list[str] = Field(default_factory=list)
    scheduled: list[ScheduledCard] = Field(default_factory=list)
    stats: Stats
    flags: list[str] = Field(default_factory=list)
    flag_timers: dict[str, int] = Field(default_factory=dict)
    history: list[HistoryEntry] = Field(default_factory=list)
    turn: int = Field(default=0, ge=0)
    rng_seed: int
    status: GameStatus = "active"
    ending: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(populate_by_name=True)

    @classmethod
    def new_run(
        cls,
        run_id: str,
        user_id: str,
        rng_seed: int,
        starting_stats: Stats | None = None,
        starting_deck: list[str] | None = None,
    ) -> "GameState":
        """Factory for a fresh run with sensible defaults."""
        now = datetime.now(timezone.utc)
        return cls(
            _id=run_id,
            user_id=user_id,
            deck=starting_deck or [],
            stats=starting_stats or Stats(moneten=50, aura=50, respekt=50, rizz=50, chaos=0),
            rng_seed=rng_seed,
            created_at=now,
            updated_at=now,
        )