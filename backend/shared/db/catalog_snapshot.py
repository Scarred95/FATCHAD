"""Module-global cached snapshot of the published catalog.

The gameplay Lambda calls `get_current_snapshot()` at the start of every
request. The cost per call is:
  - one small DDB GetItem on the pointer
  - if the version has bumped since last call, one S3 GetObject + JSON parse
  - otherwise: dict lookup, microseconds

This is the design's "every gameplay tick hits a cache, not a DB row"
property. Lambda containers stay warm 15–45 minutes, so a publish triggers
exactly one S3 fetch per warm container — every other invocation is RAM.

The snapshot exposes a method surface (`get_card`, `get_cards`,
`cards_by_categories`, `default_ending_ids`, ...) that Phase 2 will pass
into the game engine in place of the old Mongo `EventRepo` / `EndingRepo`.
"""
from __future__ import annotations

import json

from shared.db.ddb import catalog_bucket, catalog_table, s3_client
from shared.db.keys import catalog_pointer_key
from shared.schemas import Ending, Event


# Module-global cache. Reset on container cold start; refreshed on pointer bump.
_cached_version: str | None = None
_cached: "CatalogSnapshot | None" = None


class CatalogSnapshot:
    """Frozen view of the published catalog.

    Built from the `catalog_full.json` bundle for the current version —
    "full" because effects, requires, triggers_ending, weight, etc. are
    needed server-side to run the engine. The `_public` bundle is for the
    frontend's direct CloudFront fetch and never reaches this Lambda.

    Method names are intentionally distinct from the old Mongo repos
    (`get_card` vs `get_by_id`) — one snapshot exposes both cards and
    endings, so the unqualified `get_by_id` would be ambiguous.
    """

    def __init__(self, version: str, cards: list[Event], endings: list[Ending]):
        self.version = version
        self._cards: dict[str, Event] = {c.id: c for c in cards}
        self._endings: dict[str, Ending] = {e.id: e for e in endings}
        # Pre-compute the default-ending list once at construction so the
        # hot path (new run creation) doesn't refilter the dict every call.
        self._default_ending_ids: list[str] = [
            e.id for e in endings if e.default and e.enabled
        ]

    # --- Card access ----------------------------------------------------

    def get_card(self, card_id: str) -> Event | None:
        return self._cards.get(card_id)

    def get_cards(self, ids: list[str]) -> list[Event]:
        """Drop-in for the old EventRepo.get_many — preserves order, skips
        stale ids (deleted cards)."""
        return [c for cid in ids if (c := self._cards.get(cid))]

    def cards_by_categories(self, categories: list[str]) -> list[Event]:
        """Drop-in for the old EventRepo.get_by_categories."""
        if not categories:
            return []
        cats = set(categories)
        return [c for c in self._cards.values() if c.category in cats]

    def ids_by_category(self, category: str) -> list[str]:
        """Drop-in for the old EventRepo.list_ids_by_category."""
        return [c.id for c in self._cards.values() if c.category == category]

    # --- Ending access --------------------------------------------------

    def get_ending(self, ending_id: str) -> Ending | None:
        return self._endings.get(ending_id)

    def get_endings(self, ids: list[str]) -> list[Ending]:
        """Drop-in for the old EndingRepo.get_many — preserves order,
        skips stale ids. Disabled endings ARE returned (the engine filters
        on `enabled` so admin toggles take effect mid-run)."""
        return [e for eid in ids if (e := self._endings.get(eid))]

    def default_ending_ids(self) -> list[str]:
        """Drop-in for the old EndingRepo.list_default_ids — already
        filtered to enabled at snapshot-build time."""
        return list(self._default_ending_ids)


# =============================================================================
# Read-through cache
# =============================================================================

def get_current_snapshot() -> CatalogSnapshot:
    """Return the in-memory snapshot, refreshing it if the catalog has been
    re-published since last call.

    Cost per invocation:
      - 1 small DDB GetItem (pointer): always
      - 1 S3 GetObject + JSON parse: only when the pointer version changed
    """
    global _cached_version, _cached

    pointer_item = catalog_table().get_item(Key=catalog_pointer_key()).get("Item")
    if pointer_item is None:
        raise RuntimeError(
            "Catalog pointer missing — no catalog has been published yet."
        )
    version = pointer_item["version"]

    if _cached is not None and _cached_version == version:
        return _cached

    bundle_key = f"v{version}/catalog_full.json"
    obj = s3_client().get_object(Bucket=catalog_bucket(), Key=bundle_key)
    data = json.loads(obj["Body"].read())

    cards = [Event.model_validate(c) for c in data.get("cards", [])]
    endings = [Ending.model_validate(e) for e in data.get("endings", [])]

    _cached = CatalogSnapshot(version=version, cards=cards, endings=endings)
    _cached_version = version
    return _cached


def invalidate_cache() -> None:
    """Drop the in-memory cache, forcing the next call to refetch from S3.

    Tests and the publish endpoint use this; production reads rely on the
    pointer-version check to invalidate transparently.
    """
    global _cached_version, _cached
    _cached_version = None
    _cached = None
