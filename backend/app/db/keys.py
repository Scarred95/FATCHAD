"""Typed PK/SK builders for the FATCHAD DynamoDB tables.

Single source of truth for every key shape documented in
`infra/lib/ddb-stack.ts`. Repos and Lambdas import from here instead of
hand-rolling strings, so a schema rename only touches this file.

Conventions:
- All key-building functions return a `DdbKey` TypedDict ({"PK": ..., "SK": ...})
  ready to drop into `table.get_item(Key=...)`, `table.delete_item(Key=...)`,
  or to spread into an item dict before `table.put_item`.
- Prefix constants (`CatalogSk`, `UserSk`) are exposed for `begins_with`
  Query expressions — e.g. listing all decks is a Query on
  `PK=CATALOG AND begins_with(SK, CatalogSk.DECK_PREFIX)`.

The pad width for leaderboard scores is centralized here. If we ever need
to support scores above 9_999_999_999 we bump SCORE_PAD_WIDTH and republish
the table (existing entries would re-pad themselves on their next update).
"""

from typing import Literal, TypedDict

# Number of digits the leaderboard score is left-padded to. 10 digits covers
# scores up to ~10 billion, which is more than enough headroom. The width
# MUST match between writes and prefix reads — never change without a full
# leaderboard rebuild.
SCORE_PAD_WIDTH = 10


class DdbKey(TypedDict):
    """The minimum (PK, SK) pair every DDB operation in this app uses."""
    PK: str
    SK: str


# =============================================================================
# fatchad_catalog (PK = "CATALOG", SK = <entity-prefix>#<id> or "current")
# =============================================================================

CATALOG_PK = "CATALOG"


class CatalogSk:
    """Sort-key prefixes for the catalog table.

    Use the *_PREFIX constants in `begins_with` Query expressions when listing.
    The `_key` helpers below build full keys for GetItem / PutItem / DeleteItem.
    """
    DECK_PREFIX = "DECK#"
    CARD_PREFIX = "EVENT#"      # cards are called Events in the codebase
    ENDING_PREFIX = "ENDING#"
    ACH_PREFIX = "ACH#"
    POINTER = "current"


def catalog_deck_key(deck_name: str) -> DdbKey:
    return {"PK": CATALOG_PK, "SK": f"{CatalogSk.DECK_PREFIX}{deck_name}"}


def catalog_card_key(card_id: str) -> DdbKey:
    return {"PK": CATALOG_PK, "SK": f"{CatalogSk.CARD_PREFIX}{card_id}"}


def catalog_ending_key(ending_id: str) -> DdbKey:
    return {"PK": CATALOG_PK, "SK": f"{CatalogSk.ENDING_PREFIX}{ending_id}"}


def catalog_achievement_key(ach_id: str) -> DdbKey:
    return {"PK": CATALOG_PK, "SK": f"{CatalogSk.ACH_PREFIX}{ach_id}"}


def catalog_pointer_key() -> DdbKey:
    """The singleton 'currently published version' item."""
    return {"PK": CATALOG_PK, "SK": CatalogSk.POINTER}


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
    ScanIndexForward=False; no client-side sort needed."""
    return f"SCORE#{_padded_score(score)}#{user_id}"


def leaderboard_key(scope: LbScope, score: int, user_id: str) -> DdbKey:
    return {
        "PK": leaderboard_pk(scope),
        "SK": leaderboard_sk(score, user_id),
    }
