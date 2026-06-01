"""Working-copy CRUD on fatchad_catalog — admin Lambda only.

Gameplay never touches this; it reads the published S3 snapshot via
catalog_snapshot.py (that split is the "cache, not a DB row" property). Sync,
since boto3 is sync and Lambda is single-threaded per container.
"""
from __future__ import annotations

import json
import random
import time
from decimal import Decimal

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from shared.db.ddb import catalog_table
from shared.db.keys import (
    CatalogPk,
    catalog_achievement_key,
    catalog_card_key,
    catalog_deck_key,
    catalog_ending_key,
    catalog_pointer_key,
)
from shared.schemas import (
    Achievement,
    CatalogPointer,
    Deck,
    Ending,
    Event,
)

# Sentinel deck name for the bulk toggle: targets cards with no deck_name.
# Matches how the admin UI labels its orphan bucket; single source of truth so
# the route and the repo can't drift on the magic string.
ORPHAN_DECK_SENTINEL = "__orphans__"


# =============================================================================
# (de)serialization helpers
# =============================================================================

def _normalize_decimals(obj):
    """DDB Numbers come back as Decimal; catalog stores only ints, so a flat
    int cast is correct. Branch on `obj % 1` here if floats are ever stored."""
    if isinstance(obj, list):
        return [_normalize_decimals(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _normalize_decimals(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj)
    return obj


def _model_to_item(model, pk: str, sk: str) -> dict:
    """Serialize a model to a DDB item (+ PK/SK). JSON round-trip turns
    datetimes into ISO strings (boto3 rejects raw datetimes); no by_alias, so
    the natural field name is stored (`id`, not `_id`)."""
    data = json.loads(model.model_dump_json())
    data["PK"] = pk
    data["SK"] = sk
    return data


def _item_to_dict(item: dict | None) -> dict | None:
    """Strip PK/SK and normalize Decimals. Returns None if item is None."""
    if item is None:
        return None
    cleaned = {k: v for k, v in item.items() if k not in ("PK", "SK")}
    return _normalize_decimals(cleaned)


class CatalogConflict(Exception):
    """Raised when trying to insert an item that already exists.

    Routes catch this and turn it into HTTP 409. Kept as a domain exception
    so the repo doesn't import FastAPI.
    """


# =============================================================================
# The repo
# =============================================================================

class CatalogRepo:
    """All catalog-table operations.

    One class for all entity types because they all live in one table — and
    splitting them into per-type repos would just multiply the boilerplate
    (de)serializers without adding any structure.
    """

    def __init__(self):
        self._t = catalog_table()

    # -------------------------------------------------------------------------
    # Cards (PK=EVENT)
    # -------------------------------------------------------------------------

    def get_card(self, card_id: str) -> Event | None:
        item = self._t.get_item(Key=catalog_card_key(card_id)).get("Item")
        return Event.model_validate(_item_to_dict(item)) if item else None

    def get_cards(self, ids: list[str]) -> list[Event]:
        """Batched read. Returns items in arbitrary order; callers index by id."""
        if not ids:
            return []
        # BatchGetItem caps at 100 keys per request; loop in chunks.
        out: list[Event] = []
        for chunk in _chunks(ids, 100):
            # BatchGetItem is best-effort: throttling / the 16 MB cap return a
            # partial result + leftovers in UnprocessedKeys. Re-drain those with
            # backoff, else cards silently vanish (looks like "id not found").
            request = {self._t.name: {"Keys": [catalog_card_key(i) for i in chunk]}}
            attempt = 0
            while request:
                resp = self._t.meta.client.batch_get_item(RequestItems=request)
                for item in resp.get("Responses", {}).get(self._t.name, []):
                    out.append(Event.model_validate(_item_to_dict(item)))
                request = resp.get("UnprocessedKeys") or {}
                if request:
                    attempt += 1
                    time.sleep(min(0.05 * 2 ** attempt, 1.0) + random.random() * 0.05)
        return out

    def list_cards(self, category: str | None = None) -> list[Event]:
        """Full EVENT partition, optionally filtered by category.

        Category filter is client-side — at catalog scale (<10K cards) the
        cost difference vs a server-side FilterExpression is invisible and
        avoids index complexity. Switch to a GSI once card count justifies it.
        """
        items = self._query_all(CatalogPk.CARD)
        cards = [Event.model_validate(_item_to_dict(i)) for i in items]
        if category is not None:
            cards = [c for c in cards if c.category == category]
        return cards

    def put_card(self, card: Event) -> None:
        """Upsert. Use `insert_card` if you want a 409 on duplicate id."""
        self._t.put_item(Item=_model_to_item(card, CatalogPk.CARD, card.id))

    def insert_card(self, card: Event) -> None:
        """Put with attribute_not_exists guard. Raises CatalogConflict if the
        id is already taken (so routes can return a clean 409)."""
        try:
            self._t.put_item(
                Item=_model_to_item(card, CatalogPk.CARD, card.id),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise CatalogConflict(f"Card {card.id} already exists") from e
            raise

    def delete_card(self, card_id: str) -> bool:
        """Returns True if the card existed and was deleted."""
        resp = self._t.delete_item(
            Key=catalog_card_key(card_id),
            ReturnValues="ALL_OLD",
        )
        return resp.get("Attributes") is not None

    def set_enabled_for_deck(self, deck_name: str, enabled: bool) -> tuple[int, int]:
        """Bulk-set `enabled` for every card in a deck (deck_name="__orphans__"
        targets deck-less cards). Returns (matched, modified) — one PutItem per
        changed card, already-correct cards skipped."""
        cards = self.list_cards()
        if deck_name == ORPHAN_DECK_SENTINEL:
            targets = [c for c in cards if not c.deck_name]
        else:
            targets = [c for c in cards if c.deck_name == deck_name]
        modified = 0
        for card in targets:
            if card.enabled == enabled:
                continue
            card.enabled = enabled
            self.put_card(card)
            modified += 1
        return len(targets), modified

    # -------------------------------------------------------------------------
    # Endings (PK=ENDING)
    # -------------------------------------------------------------------------

    def get_ending(self, ending_id: str) -> Ending | None:
        item = self._t.get_item(Key=catalog_ending_key(ending_id)).get("Item")
        return Ending.model_validate(_item_to_dict(item)) if item else None

    def list_endings(self) -> list[Ending]:
        items = self._query_all(CatalogPk.ENDING)
        return [Ending.model_validate(_item_to_dict(i)) for i in items]

    def list_default_ending_ids(self) -> list[str]:
        """Default + enabled endings — what new runs snapshot into active_endings.

        Disabled defaults are excluded so admins can soft-disable a default
        without it leaking into new runs.
        """
        return [
            e.id for e in self.list_endings() if e.default and e.enabled
        ]

    def put_ending(self, ending: Ending) -> None:
        self._t.put_item(Item=_model_to_item(ending, CatalogPk.ENDING, ending.id))

    def insert_ending(self, ending: Ending) -> None:
        try:
            self._t.put_item(
                Item=_model_to_item(ending, CatalogPk.ENDING, ending.id),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise CatalogConflict(f"Ending {ending.id} already exists") from e
            raise

    def delete_ending(self, ending_id: str) -> bool:
        resp = self._t.delete_item(
            Key=catalog_ending_key(ending_id),
            ReturnValues="ALL_OLD",
        )
        return resp.get("Attributes") is not None

    # -------------------------------------------------------------------------
    # Decks (PK=DECK)
    # -------------------------------------------------------------------------

    def get_deck(self, deck_name: str) -> Deck | None:
        item = self._t.get_item(Key=catalog_deck_key(deck_name)).get("Item")
        return Deck.model_validate(_item_to_dict(item)) if item else None

    def list_decks(self) -> list[Deck]:
        items = self._query_all(CatalogPk.DECK)
        return [Deck.model_validate(_item_to_dict(i)) for i in items]

    def put_deck(self, deck: Deck) -> None:
        self._t.put_item(Item=_model_to_item(deck, CatalogPk.DECK, deck.name))

    def insert_deck(self, deck: Deck) -> None:
        try:
            self._t.put_item(
                Item=_model_to_item(deck, CatalogPk.DECK, deck.name),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise CatalogConflict(f"Deck {deck.name} already exists") from e
            raise

    def delete_deck(self, deck_name: str) -> bool:
        resp = self._t.delete_item(
            Key=catalog_deck_key(deck_name),
            ReturnValues="ALL_OLD",
        )
        return resp.get("Attributes") is not None

    # -------------------------------------------------------------------------
    # Achievements (PK=ACH)
    # -------------------------------------------------------------------------

    def get_achievement(self, ach_id: str) -> Achievement | None:
        item = self._t.get_item(Key=catalog_achievement_key(ach_id)).get("Item")
        return Achievement.model_validate(_item_to_dict(item)) if item else None

    def list_achievements(self) -> list[Achievement]:
        items = self._query_all(CatalogPk.ACH)
        return [Achievement.model_validate(_item_to_dict(i)) for i in items]

    def put_achievement(self, ach: Achievement) -> None:
        self._t.put_item(Item=_model_to_item(ach, CatalogPk.ACH, ach.id))

    def insert_achievement(self, ach: Achievement) -> None:
        try:
            self._t.put_item(
                Item=_model_to_item(ach, CatalogPk.ACH, ach.id),
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise CatalogConflict(f"Achievement {ach.id} already exists") from e
            raise

    def delete_achievement(self, ach_id: str) -> bool:
        resp = self._t.delete_item(
            Key=catalog_achievement_key(ach_id),
            ReturnValues="ALL_OLD",
        )
        return resp.get("Attributes") is not None

    # -------------------------------------------------------------------------
    # Pointer (PK=META, SK=current)
    # -------------------------------------------------------------------------

    def get_pointer(self) -> CatalogPointer | None:
        item = self._t.get_item(Key=catalog_pointer_key()).get("Item")
        return CatalogPointer.model_validate(_item_to_dict(item)) if item else None

    def set_pointer(self, pointer: CatalogPointer) -> None:
        """Overwrites unconditionally. Publish flow owns the version-bump.

        No CAS guard: with multiple admins a concurrent-publish race exists but
        is low-likelihood and ACCEPTED for now. Add a ConditionExpression (and
        return 409) if simultaneous publishes ever become a real problem.
        """
        data = json.loads(pointer.model_dump_json())
        data.update(catalog_pointer_key())
        self._t.put_item(Item=data)

    # -------------------------------------------------------------------------
    # Internals
    # -------------------------------------------------------------------------

    def _query_all(self, pk: str) -> list[dict]:
        """Drain a whole partition, looping over DDB's 1 MB pages. Fine for
        catalog-sized data; don't reach for this on the user table at scale."""
        items: list[dict] = []
        kwargs = {"KeyConditionExpression": Key("PK").eq(pk)}
        while True:
            resp = self._t.query(**kwargs)
            items.extend(resp.get("Items", []))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        return items


def _chunks(seq, size):
    """Yield successive `size`-sized slices of seq. Used to batch BatchGetItem
    requests, which DDB caps at 100 keys per call."""
    for i in range(0, len(seq), size):
        yield seq[i:i + size]
