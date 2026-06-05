"""Shared API-layer request / response models for the gameplay surface.

Distinct from the DB-layer schemas in shared/schemas.py — these are the
shapes the HTTP layer speaks. Kept in one module so runs.py and
gameplay.py can import them without circular imports.
"""
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from shared.schemas import Effects, Event, GameState, GameStatus, StatHint, Stats
from shared.views import public_card_dict


# =============================================================================
# Requests
# =============================================================================

class CreateRunRequest(BaseModel):
    # Deck names the player wants active in this run. Empty = all generic
    # categories (legacy behaviour). The backend validates that each name
    # exists in the catalog and is available to the user.
    selected_decks: list[str] = Field(default_factory=list, min_length=1, max_length=3)


class ChoiceRequest(BaseModel):
    choice_index: int = Field(ge=0)
    # Current turn the client thinks the run is on. Required — guards against
    # double-applying the same choice when a client retries. Mismatch → 409.
    expected_turn: int = Field(ge=0)


class CreateRunRequest(BaseModel):
    """Options for starting a run. Both fields optional so a bare POST still
    works — defaults give a tutorial run over all default-unlocked decks."""
    # Whether to play the scripted tutorial intro (seeds the tutorial starter
    # card and holds off refill until it finishes).
    tutorial: bool = True
    # Decks to draw from. None/empty → the 'catch': all default-unlocked decks.
    # The future deck-selector populates this explicitly.
    deck_ids: list[str] | None = None


# =============================================================================
# Guest sessions
# =============================================================================

class GuestSessionResponse(BaseModel):
    """Credentials for a freshly minted guest account. The client signs in with
    these via the normal SRP flow — the password is a disposable random secret
    for a throwaway account, returned once over HTTPS and never stored server-side."""
    email: str
    password: str


class ClaimGuestRequest(BaseModel):
    """Sent by a freshly-registered real account to absorb a guest's progress.
    The caller authenticates as the real account (Authorization header); the
    guest is proven by its own still-valid access token in the body — so only
    the holder of the guest session can claim it."""
    guest_access_token: str


class ClaimGuestResponse(BaseModel):
    migrated_runs: int


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
    category: str
    deck_name: str | None = None
    choices: list[ChoicePreview]
    image_url: str | None = None

    @classmethod
    def from_event(cls, event: Event) -> "CardResponse":
        """Build the client-facing payload from a stored Event. Field set +
        hint resolution come from shared.views.public_card_dict (one source,
        shared with the publish path)."""
        return cls(**public_card_dict(event))


class TurnResponse(BaseModel):
    """State + next card, bundled so the client skips a round-trip to GET /card.
    Returned by create_run and every choice submission."""
    state: GameState
    next_card: CardResponse | None


# =============================================================================
# Run list / summary responses
# =============================================================================

class RunSummary(BaseModel):
    """Lightweight run entry for list/lobby views — omits deck, history, flags,
    rng_seed (none needed to render a run list)."""
    id: str = Field(alias="_id")
    status: GameStatus
    turn: int
    stats: Stats
    ending: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(populate_by_name=True)


class HistoryDetailEntry(BaseModel):
    """One past turn, joined server-side with its card + chosen option so the
    client renders a timeline without seeing the deck. Cards deleted since play
    keep the entry but get a placeholder title and zeroed effects."""
    turn: int
    event_id: str
    title: str
    description: str | None = None
    category: str | None = None
    deck_name: str | None = None
    choice_index: int
    choice_text: str
    effects: Effects
    sets_flags: list[str] = []
    clears_flags: list[str] = []
    triggered_ending: str | None = None


class UnlockedAchievement(BaseModel):
    """Per-achievement payload for the end-screen toast/banner stack. Built
    from catalog at /summary time so a deleted achievement just drops out of
    the list (no orphan rendering)."""
    id: str
    name: str
    description: str = ""
    points: int = 0
    unlocks_deck: str | None = None
    image_url: str | None = None
    unlocked_at: datetime


# =============================================================================
# Deck / achievement catalog responses (player-facing)
# =============================================================================

class DeckOption(BaseModel):
    """A deck a player may pick on the new-run screen. Just a label — unlock
    rules stay server-side (the endpoint only ever returns unlocked decks)."""
    name: str
    description: str = ""


class AchievementView(BaseModel):
    """Client-facing achievement label. Criteria stay server-side; `hint` is the
    deliberate, player-safe nudge. Hidden achievements are filtered out by the
    listing route until earned."""
    id: str
    name: str
    description: str = ""
    hint: str = ""
    points: int = 0
    unlocks_deck: str | None = None
    image_url: str | None = None

    @classmethod
    def from_achievement(cls, ach) -> "AchievementView":
        return cls(
            id=ach.id, name=ach.name, description=ach.description,
            hint=ach.hint, points=ach.points,
            unlocks_deck=ach.unlocks_deck, image_url=ach.image_url,
        )


class UnlockedAchievementView(AchievementView):
    """An achievement the caller has earned — adds when it was unlocked. Hidden
    achievements DO appear here once earned (the reveal-on-unlock pattern)."""
    unlocked_at: datetime


class EndSummary(BaseModel):
    """End-of-run stats for the game-over screen. ending_title/description are
    denormalised from the Ending doc so the recap needs no second fetch; both
    are None for an abandoned run or an ending id that no longer resolves.

    newly_unlocked is reconstructed from `GameState.newly_unlocked` (ids
    stamped at finalize) joined against the live catalog — survives refresh,
    re-renders the same banner stack."""
    ending: str | None
    ending_title: str | None
    ending_description: str | None
    status: GameStatus
    turns_survived: int
    final_stats: Stats
    cards_played: int
    newly_unlocked: list[UnlockedAchievement] = []
