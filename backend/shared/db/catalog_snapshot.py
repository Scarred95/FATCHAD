"""Module-global cached snapshot of the published catalog.

The gameplay Lambda calls `get_current_snapshot()` per request: one small DDB
GetItem on the pointer, plus an S3 GetObject + parse only when the version
bumped. Warm containers keep the snapshot in RAM, so a publish costs exactly
one S3 fetch per container — the design's "every tick hits a cache, not a row".

Exposes the read surface (get_card, get_cards, cards_by_decks,
default_deck_names, active_ending_ids_for_run, ...) the game engine consumes in place
of the old repos.
"""
from __future__ import annotations

import json

from shared.db.ddb import catalog_bucket, catalog_table, s3_client
from shared.db.keys import catalog_pointer_key
from shared.game.constants import TUTORIAL_DECK_NAME
from shared.schemas import Achievement, Deck, Ending, Event


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

    def __init__(
        self,
        version: str,
        cards: list[Event],
        endings: list[Ending],
        achievements: list[Achievement],
        decks: list[Deck] | None = None,
    ):
        self.version = version
        self._cards: dict[str, Event] = {c.id: c for c in cards}
        self._endings: dict[str, Ending] = {e.id: e for e in endings}
        self._achievements: dict[str, Achievement] = {a.id: a for a in achievements}
        self._decks: dict[str, Deck] = {d.name: d for d in (decks or [])}

    # --- Card access ----------------------------------------------------

    def get_card(self, card_id: str) -> Event | None:
        return self._cards.get(card_id)

    def get_cards(self, ids: list[str]) -> list[Event]:
        """Old EventRepo.get_many — preserves order, skips stale (deleted) ids."""
        return [c for cid in ids if (c := self._cards.get(cid))]

    def cards_by_decks(self, decks: list[str]) -> list[Event]:
        """Cards whose deck_name is in `decks`. Feeds build_run_deck."""
        if not decks:
            return []
        deck_set = set(decks)
        return [c for c in self._cards.values() if c.deck_name in deck_set]

    # --- Deck access ----------------------------------------------------

    def default_deck_names(self) -> list[str]:
        """Enabled, default-unlocked deck names — the run-creation catch when no
        decks are selected. `enabled` guard is defensive (bundle is enabled-only)."""
        return [
            d.name for d in self._decks.values()
            if d.enabled and d.unlock_rule.kind == "default"
        ]

    def available_decks(self, unlocked: set[str]) -> list[Deck]:
        """Decks a player may pick for a run: every enabled default-unlocked deck
        plus any in `unlocked` (achievement grants), minus the Tutorial deck
        (its own checkbox owns it). Feeds the deck-selector endpoint."""
        return [
            d for d in self._decks.values()
            if d.enabled
            and d.name != TUTORIAL_DECK_NAME
            and (d.unlock_rule.kind == "default" or d.name in unlocked)
        ]

    # --- Ending access --------------------------------------------------

    def get_ending(self, ending_id: str) -> Ending | None:
        return self._endings.get(ending_id)

    def get_endings(self, ids: list[str]) -> list[Ending]:
        """Old EndingRepo.get_many — preserves order, skips stale ids. The
        snapshot is already enabled-only (publish strips disabled endings), so a
        just-disabled ending drops out on the next publish + version bump — it
        simply isn't here to return, which is how toggles take effect mid-run."""
        return [e for eid in ids if (e := self._endings.get(eid))]

    def active_ending_ids_for_run(self, selected_decks: list[str]) -> list[str]:
        """Ending ids a fresh run starts with. Every global ending (deck_name
        None) is in by default; deck-scoped endings come in only if `default`
        and their deck was selected; then each selected deck's removes_endings
        is subtracted. Card-driven add/remove happens later, at play time.

        Global endings ignore the `default` flag on purpose — "not in a deck =
        default-in". A secret global ending would fire early, so secrets must
        live in a deck (default=False) or be reached only via triggers_ending.
        """
        deck_set = set(selected_decks)
        removed = {
            eid
            for name in deck_set
            if (d := self._decks.get(name)) is not None
            for eid in d.removes_endings
        }
        return [
            e.id for e in self._endings.values()
            if e.enabled
            and (e.deck_name is None or (e.default and e.deck_name in deck_set))
            and e.id not in removed
        ]

    # --- Achievement access --------------------------------------------

    def get_achievement(self, ach_id: str) -> Achievement | None:
        return self._achievements.get(ach_id)

    def get_achievements(self) -> list[Achievement]:
        """All published achievements (publisher strips disabled at publish).

        Order is insertion order from the bundle — predicates run finalize-time
        so admin priority isn't a concept here; the engine evaluates each in
        turn and the user ends up with whatever matches."""
        return list(self._achievements.values())

    # --- Achievement access ---------------------------------------------

    def get_achievement(self, ach_id: str) -> Achievement | None:
        return self._achievements.get(ach_id)

    def list_achievements(self) -> list[Achievement]:
        return list(self._achievements.values())

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

    cards        = [Event.model_validate(c)       for c in data.get("cards", [])]
    endings      = [Ending.model_validate(e)      for e in data.get("endings", [])]
    decks        = [Deck.model_validate(d)        for d in data.get("decks", [])]
    achievements = [Achievement.model_validate(a) for a in data.get("achievements", [])]

    _cached = CatalogSnapshot(
        version=version,
        cards=cards,
        endings=endings,
        decks=decks,
        achievements=achievements,
    )
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
