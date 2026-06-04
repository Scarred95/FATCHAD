"""Module-global cached snapshot of the published catalog.

The gameplay Lambda calls `get_current_snapshot()` per request: one small DDB
GetItem on the pointer, plus an S3 GetObject + parse only when the version
bumped. Warm containers keep the snapshot in RAM, so a publish costs exactly
one S3 fetch per container — the design's "every tick hits a cache, not a row".

Exposes the read surface (get_card, get_cards, cards_by_categories,
default_ending_ids, ...) the game engine consumes in place of the old repos.
"""
from __future__ import annotations

import json

from shared.db.ddb import catalog_bucket, catalog_table, s3_client
from shared.db.keys import catalog_pointer_key
from shared.schemas import Deck, Ending, Event


# Module-global cache. Reset on cold start; refreshed on pointer bump.
_cached_version: str | None = None
_cached: "CatalogSnapshot | None" = None


class CatalogSnapshot:
    """Frozen view of the published catalog, built from `catalog_full.json`.

    "Full" because effects/requires/weight/triggers_ending are needed
    server-side to run the engine; the `_public` bundle is the SPA's and never
    reaches this Lambda. Method names differ from the old Mongo repos
    (`get_card` not `get_by_id`) since one snapshot holds both cards and endings.
    """

    def __init__(self, version: str, cards: list[Event], endings: list[Ending], decks: list[Deck] | None = None):
        self.version = version
        self._cards: dict[str, Event] = {c.id: c for c in cards}
        self._endings: dict[str, Ending] = {e.id: e for e in endings}
        self._decks: dict[str, Deck] = {d.name: d for d in (decks or [])}
        # Pre-compute defaults once so new-run creation doesn't refilter.
        self._default_ending_ids: list[str] = [
            e.id for e in endings if e.default and e.enabled
        ]

    # --- Card access ----------------------------------------------------

    def get_card(self, card_id: str) -> Event | None:
        return self._cards.get(card_id)

    def get_cards(self, ids: list[str]) -> list[Event]:
        """Old EventRepo.get_many — preserves order, skips stale (deleted) ids."""
        return [c for cid in ids if (c := self._cards.get(cid))]

    def cards_by_categories(self, categories: list[str]) -> list[Event]:
        """Old EventRepo.get_by_categories."""
        if not categories:
            return []
        cats = set(categories)
        return [c for c in self._cards.values() if c.category in cats]

    def ids_by_category(self, category: str) -> list[str]:
        """Old EventRepo.list_ids_by_category."""
        return [c.id for c in self._cards.values() if c.category == category]

    # --- Ending access --------------------------------------------------

    def get_ending(self, ending_id: str) -> Ending | None:
        return self._endings.get(ending_id)

    def get_endings(self, ids: list[str]) -> list[Ending]:
        """Old EndingRepo.get_many — preserves order, skips stale ids. The
        snapshot is already enabled-only (publish strips disabled endings), so a
        just-disabled ending drops out on the next publish + version bump — it
        simply isn't here to return, which is how toggles take effect mid-run."""
        return [e for eid in ids if (e := self._endings.get(eid))]

    def default_ending_ids(self) -> list[str]:
        """Old EndingRepo.list_default_ids — pre-filtered to enabled."""
        return list(self._default_ending_ids)

    # --- Deck access ----------------------------------------------------

    def get_deck(self, name: str) -> Deck | None:
        return self._decks.get(name)

    def list_decks(self) -> list[Deck]:
        return list(self._decks.values())

    def cards_by_deck_names(self, deck_names: list[str]) -> list[Event]:
        """All cards whose deck_name is in the given set."""
        if not deck_names:
            return []
        names = set(deck_names)
        return [c for c in self._cards.values() if c.deck_name in names]


# =============================================================================
# Read-through cache
# =============================================================================

def get_current_snapshot() -> CatalogSnapshot:
    """Return the in-memory snapshot, refreshing only if the pointer version
    changed (1 DDB GetItem always; 1 S3 GetObject + parse only on a bump)."""
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

    cards   = [Event.model_validate(c) for c in data.get("cards", [])]
    endings = [Ending.model_validate(e) for e in data.get("endings", [])]
    decks   = [Deck.model_validate(d)  for d in data.get("decks", [])]

    _cached = CatalogSnapshot(version=version, cards=cards, endings=endings, decks=decks)
    _cached_version = version
    return _cached


def invalidate_cache() -> None:
    """Drop the in-memory cache, forcing a refetch from S3 on the next call.

    Used by tests and the publish endpoint; production reads invalidate
    transparently via the pointer-version check.
    """
    global _cached_version, _cached
    _cached_version = None
    _cached = None
