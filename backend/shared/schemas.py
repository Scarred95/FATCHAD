# shared/schemas.py
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

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

    Nominal ranges are 0-100 for the main stats and -100..+100 for Chaos, but
    values are NOT clamped — quests/endings handle out-of-band behavior. The
    nominal ranges only matter for UI display and as the default ending
    thresholds (see seed endings). A quest can remove the corresponding
    ending and let a stat climb past 100 (or below 0).
    """
    moneten: int
    aura: int
    respekt: int
    rizz: int
    chaos: int

# =============================================================================
# Event schema (catalog: PK=EVENT)
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
    # If set, attempts to force this ending on play. Only fires if the id is
    # in state.active_endings — otherwise silently no-ops, by design (a quest
    # that removed the ending wins over a card that tries to invoke it).
    triggers_ending: Optional[str] = None
    # Quest mechanics: mutate state.active_endings AFTER ending evaluation.
    # Removes win over unlocks if the same id appears in both. Effects land
    # next turn (won't insta-kill on the same play that unlocks).
    unlocks_endings: list[str] = Field(default_factory=list)
    removes_endings: list[str] = Field(default_factory=list)

class Event(BaseModel):
    """An immutable event/card definition stored in the catalog."""
    id: str = Field(alias="_id")
    title: str
    description: str
    category: str
    # Human-readable name of the deck/pack this card belongs to. Surfaced in
    # the card-art top-right corner so the player can see which storyline /
    # source pack a card is drawn from. Optional — older content may not
    # declare it; the UI falls back to a generic label.
    deck_name: Optional[str] = None
    weight: int = Field(default=10, ge=0)
    # If True, this card is preserved when ineligible — re-shuffled to a random
    # position in the deck instead of being dropped. Use for questline / arc
    # cards that should still get a chance to play once their requirements
    # eventually unlock.
    important: bool = False
    # Soft-toggle published state. Disabled cards are skipped by the
    # gameplay deck loop (never refilled, dropped if surfaced) but stay in
    # the database so they remain editable / re-enabled via the admin UI.
    # Defaults True so pre-existing documents (no `enabled` field) read as enabled.
    enabled: bool = True
    requires: Requirements = Field(default_factory=Requirements)
    choices: list[Choice] = Field(min_length=2, max_length=3)
    image_url: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)

# =============================================================================
# Ending state schema
# =============================================================================

class EndingRequirements(BaseModel):
    """Same shape as Event.requires — reused so predicate logic stays DRY."""
    flags_all:  list[str] = []
    flags_none: list[str] = []
    flags_any:  list[str] = []
    stats: dict[str, StatRange] = {}   # e.g. {"moneten": {"min": 100}}


class Ending(BaseModel):
    """Immutable ending definition stored in the catalog."""
    id: str = Field(alias="_id")
    title: str
    description: str
    # Optional parent deck. None = global ending (always available regardless
    # of which decks the player has unlocked). When set, the ending is only
    # added to runs that include the named deck — same string as the parent
    # Deck.name, mirroring how Event.deck_name links cards to their deck.
    # Effective enabled-ness becomes: ending.enabled AND parent_deck.enabled,
    # with deck-less endings only gated by their own `enabled`.
    deck_name: Optional[str] = None
    priority: int = 100                # lower = checked first when multiple match
    requires: EndingRequirements = Field(default_factory=EndingRequirements)
    default: bool = False              # auto-added to new runs' active_endings
    enabled: bool = True               # soft-disable, mirrors Event.enabled
    image_url: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


# =============================================================================
# Game state schema (user_data: SK=RUN#<status>#<run_id>)
# =============================================================================

class ScheduledCard(BaseModel):
    card_id: str
    play_on_turn: int = Field(ge=0)


class HistoryEntry(BaseModel):
    event_id: str
    choice: int = Field(ge=0)
    turn: int = Field(ge=0)

GameStatus = Literal["active", "ended", "abandoned"]

class GameState(BaseModel):
    """Per-run save data."""
    id: str = Field(alias="_id")
    user_id: str
    deck: list[str] = Field(default_factory=list)
    scheduled: list[ScheduledCard] = Field(default_factory=list)
    active_endings: list[str] = Field(default_factory=list)
    stats: Stats
    flags: list[str] = Field(default_factory=list)
    history: list[HistoryEntry] = Field(default_factory=list)
    turn: int = Field(default=0, ge=0)
    rng_seed: int
    status: GameStatus = "active"
    ending: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(populate_by_name=True)

    @staticmethod
    def generate_id() -> str:
        """Mint a new run id. Single source of truth for the run_<hex> format."""
        return f"run_{uuid4().hex[:12]}"

    @classmethod
    def new_run(
        cls,
        run_id: str,
        user_id: str,
        rng_seed: int,
        starting_stats: Stats | None = None,
        starting_deck: list[str] | None = None,
        starting_endings: list[str] | None = None,
    ) -> "GameState":
        """Factory for a fresh run with sensible defaults.
        """
        now = datetime.now(timezone.utc)
        return cls(
            _id=run_id,
            user_id=user_id,
            deck=starting_deck or [],
            active_endings=starting_endings or [],
            stats=starting_stats or Stats(moneten=50, aura=50, respekt=50, rizz=50, chaos=0),
            rng_seed=rng_seed,
            created_at=now,
            updated_at=now,
        )


# =============================================================================
# Catalog: Deck schema (fatchad_catalog, PK=DECK, SK=<name>)
# =============================================================================

class DeckUnlockRule(BaseModel):
    """How a deck becomes available to a user.

    - kind="default":     available to everyone from the start.
    - kind="achievement": unlocks when `achievement_id` is earned. The user's
                          UNLOCK#DECK# item is written by the achievement
                          handler, not by gameplay.
    """
    kind: Literal["default", "achievement"] = "default"
    achievement_id: Optional[str] = None


class Deck(BaseModel):
    """A pack of cards/endings the admin can toggle as a unit.

    The DDB SK is `<name>` (within PK=DECK), so `name` is the natural key.
    Cards and endings reference their parent deck by name via `Event.deck_name`
    / `Ending` (linked through requirements, not a direct field).

    Effective enabled-ness at publish time:
        item.enabled AND parent_deck.enabled
    So disabling a deck cascades to all its cards without touching them.
    """
    name: str
    description: str = ""
    enabled: bool = True
    unlock_rule: DeckUnlockRule = Field(default_factory=DeckUnlockRule)
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Catalog: Achievement schema (fatchad_catalog, PK=ACH, SK=<id>)
# =============================================================================

class AchievementCriteria(BaseModel):
    """Free-form criteria payload for v1.

    We deliberately don't lock down a criteria DSL yet — we don't know which
    predicates we'll actually need until a few achievements exist. Once we do,
    replace `description` with typed predicates (min_stats, ended_with,
    survived_turns, ...). For now the criteria engine is a Lambda that reads
    this blob plus run history and decides.
    """
    description: str
    payload: dict = Field(default_factory=dict)


class Achievement(BaseModel):
    """Admin-managed achievement definition."""
    id: str = Field(alias="_id")
    name: str
    description: str = ""
    criteria: AchievementCriteria
    points: int = 0
    # If set, earning this achievement also writes a UNLOCK#DECK#<name> item
    # for the user. Lets us model "complete the Tutorial deck → Office deck
    # unlocks" without a separate unlock-rules table.
    unlocks_deck: Optional[str] = None
    enabled: bool = True
    image_url: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


# =============================================================================
# Catalog: pointer to the currently published bundle (PK=META, SK=current)
# =============================================================================

class CatalogPointer(BaseModel):
    """The 'what is currently live?' item.

    Publishing flow:
      1. Lambda reads the whole catalog table (decks/events/endings/achs).
      2. Strips disabled items + admin-only fields, writes two JSON blobs to
         the catalog S3 bucket: catalog_public.json and catalog_full.json.
      3. Writes this pointer item (PK=META, SK=current) so backend/frontend
         know which version to fetch and cache.

    `version` is the `database-v*` tag at publish time, or a content hash if
    publishing happened off-tag.
    """
    version: str
    public_url: str
    full_url: str
    published_at: datetime


# =============================================================================
# User data: profile (fatchad_user_data, SK = "PROFILE")
# =============================================================================

class ProfileTotals(BaseModel):
    """Lifetime counters surfaced on the profile screen.

    These are denormalized — the source of truth is the RUN#ENDED# /
    RUN#ABANDONED# items plus ACH# items. Totals are updated by the same
    Lambda that writes those, so they stay consistent without scans.
    """
    runs_started: int = 0
    runs_completed: int = 0
    runs_abandoned: int = 0
    achievements_unlocked: int = 0


class Profile(BaseModel):
    """Per-user profile item. One per user, PK=USER#<uid>, SK=PROFILE."""
    user_id: str
    display_name: str
    totals: ProfileTotals = Field(default_factory=ProfileTotals)
    # Current point total — matches the value mirrored into LB#points entries.
    # Stored here so a profile lookup doesn't require a leaderboard query.
    current_points: int = 0
    created_at: datetime
    updated_at: datetime


# =============================================================================
# User data: deck unlock + achievement unlock items
# =============================================================================

class DeckUnlock(BaseModel):
    """A deck the user has unlocked. PK=USER#<uid>, SK=UNLOCK#DECK#<name>."""
    deck_name: str
    unlocked_at: datetime
    # Which achievement triggered the unlock — None for default decks granted
    # at profile creation.
    via_achievement: Optional[str] = None


class UserAchievement(BaseModel):
    """An achievement the user has earned or is making progress on.

    PK=USER#<uid>, SK=ACH#<ach_id>.

    Progress is an opaque dict because each achievement type tracks different
    things (counters, sets, max-values). The achievement Lambda owns the
    shape; gameplay code only reads `unlocked_at`.
    """
    achievement_id: str
    unlocked_at: Optional[datetime] = None
    progress: dict = Field(default_factory=dict)


# =============================================================================
# User data: leaderboard entries (PK = LB#<scope>, SK = SCORE#<padded>#<uid>)
# =============================================================================

class LbEntry(BaseModel):
    """A leaderboard row.

    One model for both leaderboard scopes — the LB#points board reads
    `score` as points; the LB#longest board reads it as turn count. `run_id`
    is set on `longest` entries so the UI can deep-link to the run.

    The padded numeric portion of the SK is built by `keys.leaderboard_sk` —
    do not hand-roll it. DynamoDB sorts SKs lexicographically, so the
    padding is the only thing making string sort agree with numeric sort.
    """
    user_id: str
    display_name: str
    score: int
    run_id: Optional[str] = None
    updated_at: datetime
