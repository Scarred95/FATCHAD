"""Catalog publish — turn the DDB working-copy into S3 versioned bundles.

The admin Lambda calls `publish_catalog()` when an editor hits "Publish".
The gameplay Lambda never imports this module.

Output:
  s3://<catalog_bucket>/v<version>/catalog_full.json   — engine bundle
  s3://<catalog_bucket>/v<version>/catalog_public.json — frontend bundle
  DDB META#current pointer rewritten to point at the new version

`catalog_full.json` is what `catalog_snapshot.py` reads on the gameplay
side. `catalog_public.json` is fetched directly by the SPA from CloudFront
and intentionally hides spoiler/anti-cheat fields (effects, requires,
weights, ending thresholds, achievement criteria).

Effective-enabled cascading: when a card or ending has a `deck_name`, its
parent deck's `enabled` flag overrides its own. Disabling a deck removes
all its content from both bundles in one click.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from shared.db.catalog_repo import CatalogRepo
from shared.db.catalog_snapshot import invalidate_cache
from shared.db.ddb import catalog_bucket, s3_client
from shared.game.hints import derive_hints_from_effects
from shared.schemas import (
    Achievement,
    CatalogPointer,
    Choice,
    Deck,
    Ending,
    Event,
)


# =============================================================================
# Public API
# =============================================================================

def publish_catalog(version: str | None = None) -> CatalogPointer:
    """Snapshot the working copy, upload both bundles, bump the pointer.

    `version` is normally None → a UTC timestamp is minted. Callers can pass
    an explicit string (e.g. a git tag like `database-v7`) when publishing
    is driven by CI rather than the admin button.

    Returns the new pointer that was written.

    Cache invalidation: the in-process CatalogSnapshot cache is reset so the
    *same* Lambda container picks up the new version on its next gameplay
    call. Other warm containers will catch up via the pointer-version check.
    """
    catalog = CatalogRepo()
    decks       = catalog.list_decks()
    cards       = catalog.list_cards()
    endings_    = catalog.list_endings()
    achievements = catalog.list_achievements()

    # Effective-enabled cascade: parent deck disabled → child items dropped.
    deck_enabled: dict[str, bool] = {d.name: d.enabled for d in decks}

    pub_cards    = [c for c in cards    if _card_enabled(c, deck_enabled)]
    pub_endings  = [e for e in endings_ if _ending_enabled(e, deck_enabled)]
    pub_achs     = [a for a in achievements if a.enabled]
    pub_decks    = [d for d in decks    if d.enabled]

    if version is None:
        version = _mint_version()

    # ---- Build & upload bundles -----------------------------------------
    full_payload = {
        "version": version,
        "decks":    [_dump(d) for d in pub_decks],
        "cards":    [_dump(c) for c in pub_cards],
        "endings":  [_dump(e) for e in pub_endings],
        "achievements": [_dump(a) for a in pub_achs],
    }
    public_payload = {
        "version": version,
        "decks":    [_dump_deck_public(d) for d in pub_decks],
        "cards":    [_dump_card_public(c) for c in pub_cards],
        "endings":  [_dump_ending_public(e) for e in pub_endings],
        "achievements": [_dump_ach_public(a) for a in pub_achs],
    }

    bucket = catalog_bucket()
    full_key   = f"v{version}/catalog_full.json"
    public_key = f"v{version}/catalog_public.json"

    s3 = s3_client()
    # no gzip/CacheControl yet. Bundles are immutable per version
    # and CloudFront can compress on the fly; revisit object-level gzip only if
    # bundle size starts hurting cold-start fetch time.
    s3.put_object(
        Bucket=bucket,
        Key=full_key,
        Body=json.dumps(full_payload).encode("utf-8"),
        ContentType="application/json",
    )
    s3.put_object(
        Bucket=bucket,
        Key=public_key,
        Body=json.dumps(public_payload).encode("utf-8"),
        ContentType="application/json",
    )

    # ---- Bump the pointer ------------------------------------------------
    # Only the version is stored; bundle keys are derived from it on read.
    pointer = CatalogPointer(
        version=version,
        published_at=datetime.now(timezone.utc),
    )
    catalog.set_pointer(pointer)

    # Drop our in-process cache so the next gameplay tick in *this* container
    # picks up the new version without waiting for the pointer-version check
    # to fire after a cold dict-equal lookup.
    invalidate_cache()

    return pointer


# =============================================================================
# Filter helpers
# =============================================================================

def _card_enabled(card: Event, deck_enabled: dict[str, bool]) -> bool:
    if not card.enabled:
        return False
    if card.deck_name is None:
        return True
    # Deck-less cards skip the cascade. Cards whose deck is missing from the
    # table are treated as orphans — published as-is rather than dropped
    # (admin might be mid-rename).
    return deck_enabled.get(card.deck_name, True)


def _ending_enabled(ending: Ending, deck_enabled: dict[str, bool]) -> bool:
    if not ending.enabled:
        return False
    if ending.deck_name is None:
        return True
    return deck_enabled.get(ending.deck_name, True)


# =============================================================================
# Bundle serialization
# =============================================================================

def _dump(model) -> dict:
    """Full dump — `mode=json` so datetimes become ISO strings rather than
    requiring a second serializer pass."""
    return model.model_dump(mode="json")


def _dump_card_public(card: Event) -> dict:
    """Player-visible card fields only. Strips: effects, requires, weight,
    important, sets/clears flags, adds_to_deck, triggers_ending,
    unlocks/removes_endings. Hints are derived from effects when not
    explicitly authored, so players still see arrows."""
    return {
        "id":          card.id,
        "title":       card.title,
        "description": card.description,
        "category":    card.category,
        "deck_name":   card.deck_name,
        "image_url":   card.image_url,
        "choices":     [_dump_choice_public(c) for c in card.choices],
    }


def _dump_choice_public(choice: Choice) -> dict:
    """Choice with text + hints only — no effects, flags, or ending links."""
    explicit = choice.hints.model_dump(exclude_none=True)
    hints = explicit or derive_hints_from_effects(choice).model_dump(exclude_none=True)
    return {"text": choice.text, "hints": hints}


def _dump_ending_public(ending: Ending) -> dict:
    """Ending blurb only — strips requires, priority, default-flag."""
    return {
        "id":          ending.id,
        "title":       ending.title,
        "description": ending.description,
        "deck_name":   ending.deck_name,
        "image_url":   ending.image_url,
    }


def _dump_ach_public(ach: Achievement) -> dict:
    """Achievement label only — criteria stay server-side so players can't
    reverse-engineer unlock conditions."""
    return {
        "id":          ach.id,
        "name":        ach.name,
        "description": ach.description,
        "points":      ach.points,
        "unlocks_deck": ach.unlocks_deck,
        "image_url":   ach.image_url,
    }


def _dump_deck_public(deck: Deck) -> dict:
    """Deck blurb without unlock_rule details — players see what's available,
    not the exact achievement gate."""
    return {
        "name":        deck.name,
        "description": deck.description,
    }


# =============================================================================
# Versioning
# =============================================================================

def _mint_version() -> str:
    """UTC timestamp version, e.g. `20260531T143022Z`.

    Sortable by string compare and unique per second. The 1-second collision
    window (two publishes in the same second reuse the key) is ACCEPTED: publish
    is admin-only and single-operator. Revisit (sub-second suffix) only if
    publishing is ever automated. CI publishes pass an explicit version instead.
    """
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
