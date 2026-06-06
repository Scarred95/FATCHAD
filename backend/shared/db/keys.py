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
# fatchad_leaderboard — public boards (its own table, env LEADERBOARD_TABLE)
# =============================================================================
#
# Kept out of fatchad_user_data on purpose: board churn (every score change is
# a delete+put) never contends with run/profile writes. Two boards + one index:
#
#   * points board  PK=LB#points   — one row per account,  score = career points
#   * run board     PK=LB#longest  — up to 5 rows/account,  score = rounds survived
#   * per-account index  PK=LBRUN#<uid>  — a player's published runs, so the
#     5-run cap + replace picker is one Query (no GSI; mirrors USERS#all).
#
# The score sits IN the board SK, zero-padded so DDB's lexicographic order
# matches numeric order — top-N is Query(ScanIndexForward=False, Limit=N), no
# client-side sort. The index SK keys only on run_id (publish order is restored
# by sorting the <=5 rows in Python), so deletes never depend on a datetime
# string round-tripping byte-for-byte.

LbScope = Literal["points", "longest"]

POINTS_SCOPE: LbScope = "points"
RUNS_SCOPE: LbScope = "longest"

LBRUN_MEMBER_PREFIX = "RUN#"


def leaderboard_pk(scope: LbScope) -> str:
    return f"LB#{scope}"


def _padded_score(score: int) -> str:
    """Zero-pad a non-negative score so lexicographic SK sort matches numeric
    sort. Negative scores would break the ordering — leaderboards reject
    them at the boundary rather than smuggling them past the type system."""
    if score < 0:
        raise ValueError(f"Leaderboard score must be non-negative, got {score}")
    return f"{score:0{SCORE_PAD_WIDTH}d}"


def leaderboard_points_sk(user_id: str, score: int) -> str:
    """Points board SK — one row per account (user_id ends the SK).

    INVARIANT (writer must enforce): the score lives IN the SK, so a new score
    is a new SK. Updating is delete-old-SK + put-new-SK — a plain put would
    strand the row under its old score."""
    return f"SCORE#{_padded_score(score)}#{user_id}"


def leaderboard_points_key(user_id: str, score: int) -> DdbKey:
    return {"PK": leaderboard_pk(POINTS_SCOPE), "SK": leaderboard_points_sk(user_id, score)}


def leaderboard_run_sk(run_id: str, score: int) -> str:
    """Run board SK — one row per published run (run_id ends the SK, since an
    account may have up to five). Same padded-score ordering as the points
    board; the score-in-SK delete-old + put-new invariant applies here too."""
    return f"SCORE#{_padded_score(score)}#{run_id}"


def leaderboard_run_key(run_id: str, score: int) -> DdbKey:
    return {"PK": leaderboard_pk(RUNS_SCOPE), "SK": leaderboard_run_sk(run_id, score)}


def leaderboard_member_pk(user_id: str) -> str:
    return f"LBRUN#{user_id}"


def leaderboard_member_sk(run_id: str) -> str:
    """Per-account index SK — one row per published run, keyed only on run_id so
    a delete is fully deterministic. Publish order isn't encoded here; callers
    sort the (<=5) rows by their `published_at` field."""
    return f"{LBRUN_MEMBER_PREFIX}{run_id}"


def leaderboard_member_key(user_id: str, run_id: str) -> DdbKey:
    return {"PK": leaderboard_member_pk(user_id), "SK": leaderboard_member_sk(run_id)}
