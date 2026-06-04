"""Typed PK/SK builders for the FATCHAD DynamoDB tables.

Single source of truth for every key shape in `infra/lib/ddb-stack.ts`, so a
schema rename only touches this file. Builders return a `DdbKey` TypedDict
ready for get_item/delete_item or to spread into a put_item body; prefix
constants feed `begins_with` Query expressions.
"""

from typing import Literal, TypedDict

# Left-pad width for leaderboard scores (~10 billion headroom). MUST match
# between writes and prefix reads — never change without a full LB rebuild.
SCORE_PAD_WIDTH = 10


class DdbKey(TypedDict):
    """The minimum (PK, SK) pair every DDB operation in this app uses."""
    PK: str
    SK: str


# =============================================================================
# fatchad_catalog — one partition per entity type
# =============================================================================
#
# Per-type PKs (DECK, EVENT, ENDING, ACH, META), not a single PK="CATALOG":
# catalog has no parent/child fetches, so per-type PKs make admin listings a
# clean Query (PK=EVENT) and spread load. META holds catalog-wide singletons
# (today just the publish pointer).

class CatalogPk:
    DECK = "DECK"
    CARD = "EVENT"        # cards are called Events in the codebase
    ENDING = "ENDING"
    ACH = "ACH"
    META = "META"         # singletons: pointer, schema_version, ...


class CatalogSk:
    """SK values for META-partition singletons. Other partitions use the entity
    id directly as the SK (the PK already names the type)."""
    POINTER = "current"


def catalog_deck_key(deck_name: str) -> DdbKey:
    return {"PK": CatalogPk.DECK, "SK": deck_name}


def catalog_card_key(card_id: str) -> DdbKey:
    return {"PK": CatalogPk.CARD, "SK": card_id}


def catalog_ending_key(ending_id: str) -> DdbKey:
    return {"PK": CatalogPk.ENDING, "SK": ending_id}


def catalog_achievement_key(ach_id: str) -> DdbKey:
    return {"PK": CatalogPk.ACH, "SK": ach_id}


def catalog_pointer_key() -> DdbKey:
    """The singleton 'currently published version' item."""
    return {"PK": CatalogPk.META, "SK": CatalogSk.POINTER}


# =============================================================================
# fatchad_user_data — user-scoped items (PK = "USER#<uid>")
# =============================================================================

RunStatus = Literal["ACTIVE", "ENDED", "ABANDONED"]


class UserSk:
    """Sort-key prefixes for the user-data table, USER#<uid> partition."""
    PROFILE = "PROFILE"
    UNLOCK_DECK_PREFIX = "UNLOCK#DECK#"
    ACH_PREFIX = "ACH#"
    RUN_PREFIX = "RUN#"
    RUN_ACTIVE_PREFIX = "RUN#ACTIVE#"
    RUN_ENDED_PREFIX = "RUN#ENDED#"
    RUN_ABANDONED_PREFIX = "RUN#ABANDONED#"


def user_pk(user_id: str) -> str:
    """Just the partition key — handy for Query expressions that build SK
    conditions separately (e.g. begins_with)."""
    return f"USER#{user_id}"


def user_profile_key(user_id: str) -> DdbKey:
    return {"PK": user_pk(user_id), "SK": UserSk.PROFILE}


def user_deck_unlock_key(user_id: str, deck_name: str) -> DdbKey:
    return {
        "PK": user_pk(user_id),
        "SK": f"{UserSk.UNLOCK_DECK_PREFIX}{deck_name}",
    }


def user_achievement_key(user_id: str, ach_id: str) -> DdbKey:
    return {"PK": user_pk(user_id), "SK": f"{UserSk.ACH_PREFIX}{ach_id}"}


def user_run_key(user_id: str, status: RunStatus, run_id: str) -> DdbKey:
    """Run keys encode status in the SK so 'active run' is a prefix query
    instead of a filter scan. Ending/abandoning a run is delete-old +
    put-new, two writes — see `infra/lib/ddb-stack.ts` for why."""
    return {
        "PK": user_pk(user_id),
        "SK": f"{UserSk.RUN_PREFIX}{status}#{run_id}",
    }


# =============================================================================
# fatchad_user_data — admin user directory (PK = "USERS#all")
# =============================================================================
#
# A flat "every real player" partition so the admin Users view can enumerate
# accounts with one Query instead of a table scan. Written once at profile
# creation for REAL (non-guest) accounts only — guests are skipped on purpose,
# so they never leave a row here and guest cleanup needs no directory delete.

DIRECTORY_PK = "USERS#all"


def directory_pk() -> str:
    return DIRECTORY_PK


def directory_user_key(user_id: str) -> DdbKey:
    return {"PK": DIRECTORY_PK, "SK": f"USER#{user_id}"}


# =============================================================================
# fatchad_user_data — leaderboards (PK = "LB#<scope>")
# =============================================================================

LbScope = Literal["points", "longest"]


def leaderboard_pk(scope: LbScope) -> str:
    return f"LB#{scope}"


def _padded_score(score: int) -> str:
    """Zero-pad a non-negative score so lexicographic SK sort matches numeric
    sort. Negative scores would break the ordering — leaderboards reject
    them at the boundary rather than smuggling them past the type system."""
    if score < 0:
        raise ValueError(f"Leaderboard score must be non-negative, got {score}")
    return f"{score:0{SCORE_PAD_WIDTH}d}"


def leaderboard_sk(score: int, user_id: str) -> str:
    """Build the SK for a leaderboard entry. Top-N is a Query with
    ScanIndexForward=False; no client-side sort needed.

    INVARIANT (writer must enforce): the score lives IN the SK, so a user's new
    score is a different SK than their old one. Updating an entry is therefore
    delete-old-SK + put-new-SK — a plain put leaves a stale row per old score.
    """
    return f"SCORE#{_padded_score(score)}#{user_id}"


def leaderboard_key(scope: LbScope, score: int, user_id: str) -> DdbKey:
    return {
        "PK": leaderboard_pk(scope),
        "SK": leaderboard_sk(score, user_id),
    }
