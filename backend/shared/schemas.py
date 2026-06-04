# shared/schemas.py
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, ConfigDict


# Bump when a persisted model's stored shape changes in a way that needs a
# read-time migration. The migrate() hook is deferred (see FEATURE_IDEAS.md);
# for now records are stamped with the current version so the field exists the
# day we need it.
CURRENT_SCHEMA_VERSION = 1


# =============================================================================
# Shared building blocks
# =============================================================================

class StatBlock(BaseModel):
    """The five stat axes as ints. One place defines the axis set; STAT_NAMES
    in game/constants.py mirrors it for iteration code. A shared base so
    Effects (deltas) and Stats (absolutes) are substitutable in stat helpers."""
    moneten: int
    aura: int
    respekt: int
    rizz: int
    chaos: int

class Effects(StatBlock):
    """Per-choice stat deltas. Optional — a card only declares the axes it
    touches, so every axis defaults to 0 (overriding StatBlock's required)."""
    moneten: int = 0
    aura: int = 0
    respekt: int = 0
    rizz: int = 0
    chaos: int = 0

StatHint = Literal["up", "down", "unknown", "hidden"]
# up/down → arrow icons; unknown → "?" (will change, magnitude hidden);
# hidden → omit the stat entirely.

class ChoiceHints(BaseModel):
    """Frontend display hints for a choice. AUTHORED separately from effects
    and free to lie — a card can hide consequences or show fake arrows."""
    moneten: Optional[StatHint] = None
    aura: Optional[StatHint] = None
    respekt: Optional[StatHint] = None
    rizz: Optional[StatHint] = None
    chaos: Optional[StatHint] = None

class StatRange(BaseModel):
    """Min/max constraint on a single stat."""
    min: Optional[int] = None
    max: Optional[int] = None


class Stats(StatBlock):
    """Absolute player stats (the five required axes from StatBlock). Nominal
    ranges (0-100, Chaos -100..+100) are NOT clamped — they only drive UI
    display and default ending thresholds; quests handle out-of-band values."""

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
    # Parent deck/pack name, shown in the card-art corner. Optional — UI falls
    # back to a generic label for older content.
    deck_name: Optional[str] = None
    weight: int = Field(default=10, ge=0)
    # If True, kept when ineligible (re-shuffled, not dropped) so questline/arc
    # cards still get a chance once their requirements unlock.
    important: bool = False
    # Soft-toggle. Disabled cards are skipped by the deck loop but stay in the
    # DB for re-enabling. Defaults True so pre-`enabled` docs read as enabled.
    enabled: bool = True
    requires: Requirements = Field(default_factory=Requirements)
    choices: list[Choice] = Field(min_length=2, max_length=3)
    image_url: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)

# =============================================================================
# Ending state schema
# =============================================================================

# Endings use the same predicate shape as cards — alias the type so the two
# can't drift apart (and so default_factory mutable-default handling stays in
# one place). Was a duplicate class; the name is kept for readability at use sites.
EndingRequirements = Requirements


class Ending(BaseModel):
    """Immutable ending definition stored in the catalog."""
    id: str = Field(alias="_id")
    title: str
    description: str
    # Parent deck name (mirrors Event.deck_name). None = global ending, always
    # available; when set, only added to runs including that deck. Effective
    # enabled = ending.enabled AND parent_deck.enabled.
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
    # Post-effect stat snapshot for this turn — drives group-C achievement
    # predicates (peak/trough/stay/swing) and the admin run-trail view.
    # Optional (not a zero default) so entries written before this field
    # existed read back as "no snapshot" rather than a phantom all-zero row,
    # which would false-match trough/stay predicates on partially-migrated
    # runs. Never surfaced to players — see HistoryDetailEntry.
    stats: Optional[Stats] = None

GameStatus = Literal["active", "ended", "abandoned"]

class GameState(BaseModel):
    """Per-run save data."""
    # Stored-format version; read path migrates older records (hook deferred).
    schema_version: int = CURRENT_SCHEMA_VERSION
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
    # Achievement ids that fired when this run ended. Empty for active runs;
    # stamped once by evaluate_achievements at finalize so the end-screen
    # endpoint can rebuild the unlock list on every refresh.
    newly_unlocked: list[str] = Field(default_factory=list)
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
        """Factory for a fresh run with sensible defaults."""
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
    """How a deck becomes available. "default" = everyone from the start;
    "achievement" = unlocks when `achievement_id` is earned (the UNLOCK#DECK#
    item is written by the achievement handler, not gameplay)."""
    kind: Literal["default", "achievement"] = "default"
    achievement_id: Optional[str] = None


class Deck(BaseModel):
    """A pack of cards/endings the admin can toggle as a unit. `name` is the
    natural key (DDB SK within PK=DECK); cards/endings link via deck_name. At
    publish, effective-enabled = item.enabled AND deck.enabled, so disabling a
    deck cascades to its content without touching each item."""
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
    """Free-form criteria payload for v1. No DSL yet — until a few achievements
    exist we don't know which predicates we need. A Lambda reads this blob plus
    run history and decides; typed predicates replace `description` later."""
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
    """The 'what is currently live?' item (PK=META, SK=current). `version` is a
    minted UTC timestamp per publish (CI may pass an explicit one); bundle keys
    derive from it — v<version>/catalog_{full,public}.json — so no URL stored."""
    version: str
    published_at: datetime


# =============================================================================
# User data: profile (fatchad_user_data, SK = "PROFILE")
# =============================================================================

class ProfileTotals(BaseModel):
    """Lifetime counters for the profile screen. Denormalized from the
    RUN#ENDED#/RUN#ABANDONED#/ACH# items and updated by the same Lambda that
    writes those, so they stay consistent without scans."""
    runs_started: int = 0
    runs_completed: int = 0
    runs_abandoned: int = 0
    achievements_unlocked: int = 0


class Profile(BaseModel):
    """Per-user profile item. One per user, PK=USER#<uid>, SK=PROFILE."""
    # Stored-format version; read path migrates older records (hook deferred).
    schema_version: int = CURRENT_SCHEMA_VERSION
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
    """An earned/in-progress achievement (PK=USER#<uid>, SK=ACH#<ach_id>).
    `progress` is opaque — each achievement type tracks different things and
    the achievement Lambda owns the shape; gameplay only reads `unlocked_at`."""
    achievement_id: str
    unlocked_at: Optional[datetime] = None
    progress: dict = Field(default_factory=dict)


# =============================================================================
# User data: admin directory entry (PK = USERS#all, SK = USER#<uid>)
# =============================================================================

class DirectoryEntry(BaseModel):
    """A row in the admin user directory. One per real (non-guest) account,
    written at profile creation so the admin Users view can enumerate every
    player with a single Query. Holds just enough to list + search; live
    points/stats come from the profile on the detail page."""
    user_id: str
    display_name: str
    created_at: datetime


# =============================================================================
# User data: leaderboard entries (PK = LB#<scope>, SK = SCORE#<padded>#<uid>)
# =============================================================================

class LbEntry(BaseModel):
    """A leaderboard row, one model for both scopes — LB#points reads `score`
    as points, LB#longest as turn count (with `run_id` for deep-linking). Build
    the SK via `keys.leaderboard_sk`; its padding makes DDB's lexicographic
    sort agree with numeric sort — don't hand-roll it."""
    user_id: str
    display_name: str
    score: int
    run_id: Optional[str] = None
    updated_at: datetime
