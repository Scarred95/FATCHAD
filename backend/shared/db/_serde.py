# shared/db/_serde.py
"""DynamoDB (de)serialization shared by the table repos.

boto3's resource layer hands numbers back as `Decimal` and wants JSON-safe
primitives going in. These three helpers bridge Pydantic models <-> DDB items.
Lifted out of user_repo once a third repo (leaderboard) needed the same
pattern — keep them dependency-free so any repo can import them.
"""
from __future__ import annotations

import json
from decimal import Decimal


def normalize_decimals(obj):
    """Recursively turn DDB `Decimal`s back into ints. Every numeric this app
    stores (stats, turn, rng_seed, points, score) is an integer."""
    if isinstance(obj, list):
        return [normalize_decimals(v) for v in obj]
    if isinstance(obj, dict):
        return {k: normalize_decimals(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj)
    return obj


def model_to_item(model, pk: str, sk: str) -> dict:
    """Pydantic model -> DDB item body. Round-trips through model_dump_json so
    datetimes become ISO strings and nested models flatten to plain dicts."""
    data = json.loads(model.model_dump_json())
    data["PK"] = pk
    data["SK"] = sk
    return data


def item_to_dict(item: dict | None) -> dict | None:
    """DDB item -> dict ready for Model.model_validate (PK/SK stripped,
    Decimals normalised)."""
    if item is None:
        return None
    cleaned = {k: v for k, v in item.items() if k not in ("PK", "SK")}
    return normalize_decimals(cleaned)
