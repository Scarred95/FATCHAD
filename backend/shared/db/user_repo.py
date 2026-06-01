"""Read/write access to fatchad_user_data (gameplay Lambda).

Sync boto3 — Lambda is one invocation per container, no async win. Covers
profile, runs, and the run-status-prefix mechanics of the single-table design.
"""
from __future__ import annotations

import json
from decimal import Decimal

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from shared.db.ddb import user_table
from shared.db.keys import (
    RunStatus,
    UserSk,
    user_pk,
    user_profile_key,
    user_run_key,
)
from shared.schemas import GameState, Profile


# =============================================================================
# (de)serialization helpers — same pattern as catalog_repo (duplicated for
# now; if a third repo lands we lift these into shared/db/_serde.py)
# =============================================================================

def _normalize_decimals(obj):
    if isinstance(obj, list):
        return [_normalize_decimals(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _normalize_decimals(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        # User-data numerics are all ints (stats, turn, rng_seed, score).
        return int(obj)
    return obj


def _model_to_item(model, pk: str, sk: str) -> dict:
    data = json.loads(model.model_dump_json())
    data["PK"] = pk
    data["SK"] = sk
    return data


def _item_to_dict(item: dict | None) -> dict | None:
    if item is None:
        return None
    cleaned = {k: v for k, v in item.items() if k not in ("PK", "SK")}
    return _normalize_decimals(cleaned)


_STATUS_TO_SK: dict[str, RunStatus] = {
    "active": "ACTIVE",
    "ended": "ENDED",
    "abandoned": "ABANDONED",
}


def _sk_status(schema_status: str) -> RunStatus:
    """Map schema's lowercase status to the UPPERCASE used in SK strings."""
    if schema_status not in _STATUS_TO_SK:
        raise ValueError(f"Unknown run status: {schema_status!r}")
    return _STATUS_TO_SK[schema_status]


# =============================================================================
# Exceptions
# =============================================================================

class RunConflict(Exception):
    """Raised on attempt to insert a run id that already exists. Routes
    translate this into HTTP 409."""


# =============================================================================
# The repo
# =============================================================================

class UserRepo:
    """All user-data table operations: profile, runs, (later) unlocks + lbs."""

    def __init__(self):
        self._t = user_table()

    # -------------------------------------------------------------------------
    # Profile
    # -------------------------------------------------------------------------

    def get_profile(self, user_id: str) -> Profile | None:
        item = self._t.get_item(Key=user_profile_key(user_id)).get("Item")
        return Profile.model_validate(_item_to_dict(item)) if item else None

    def put_profile(self, profile: Profile) -> None:
        self._t.put_item(
            Item=_model_to_item(profile, user_pk(profile.user_id), UserSk.PROFILE),
        )

    # -------------------------------------------------------------------------
    # Runs
    # -------------------------------------------------------------------------

    def get_run(self, user_id: str, run_id: str) -> GameState | None:
        """Locate a run across status partitions (worst case 3 GetItems).
        ACTIVE-first since the active run is the hot path. A run_id GSI would
        collapse this to one Query, but isn't worth maintaining yet."""
        for status in ("ACTIVE", "ENDED", "ABANDONED"):
            item = self._t.get_item(
                Key=user_run_key(user_id, status, run_id),  # type: ignore[arg-type]
            ).get("Item")
            if item is not None:
                return GameState.model_validate(_item_to_dict(item))
        return None

    def insert_run(self, state: GameState) -> None:
        """Insert a brand-new run. Raises RunConflict on id collision (route
        surfaces it as 409). Not an upsert — silent overwrites corrupt history."""
        sk_status = _sk_status(state.status)
        key = user_run_key(state.user_id, sk_status, state.id)
        try:
            self._t.put_item(
                Item=_model_to_item(state, key["PK"], key["SK"]),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise RunConflict(f"Run {state.id} already exists") from e
            raise

    def update_run(self, state: GameState, *, prior_status: str | None = None) -> bool:
        """Save an existing run. Status unchanged (hot path): one PutItem.

        Status changed: the SK changes (RUN#ACTIVE#x → RUN#ENDED#x), so PutItem
        the new key + DeleteItem the old — two writes, no transaction. If the
        delete fails after the put, get_run's ACTIVE-first order reads the right
        row until cleanup. Pass `prior_status` when the status transitioned.
        """
        current_sk_status = _sk_status(state.status)
        prior_sk_status = (
            _sk_status(prior_status) if prior_status else current_sk_status
        )

        new_key = user_run_key(state.user_id, current_sk_status, state.id)
        self._t.put_item(Item=_model_to_item(state, new_key["PK"], new_key["SK"]))

        if current_sk_status != prior_sk_status:
            self._t.delete_item(
                Key=user_run_key(state.user_id, prior_sk_status, state.id),
            )
        return True

    def delete_run(self, user_id: str, run_id: str) -> bool:
        """Delete a run from whichever status partition it lives in.

        Tries each status; returns True if any of them had the row.
        """
        for status in ("ACTIVE", "ENDED", "ABANDONED"):
            resp = self._t.delete_item(
                Key=user_run_key(user_id, status, run_id),  # type: ignore[arg-type]
                ReturnValues="ALL_OLD",
            )
            if resp.get("Attributes") is not None:
                return True
        return False

    def list_runs_for_user(self, user_id: str) -> list[GameState]:
        """All runs for a user, any status: one Query (SK begins_with RUN#)
        with a 1 MB pagination loop. If users ever accumulate thousands of runs,
        give the summary endpoint a ProjectionExpression that strips deck/history.
        """
        items: list[dict] = []
        kwargs = {
            "KeyConditionExpression":
                Key("PK").eq(user_pk(user_id))
                & Key("SK").begins_with(UserSk.RUN_PREFIX),
        }
        while True:
            resp = self._t.query(**kwargs)
            items.extend(resp.get("Items", []))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return [GameState.model_validate(_item_to_dict(i)) for i in items]
