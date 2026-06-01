"""Player-facing serialization shared by both card paths.

The publish path (publisher.py, admin Lambda) and the live gameplay path
(_schemas.CardResponse, gameplay Lambda) must emit the SAME client-safe card
shape. Defining it once here keeps them provably in sync — a field added for
one is added for both.
"""
from __future__ import annotations

from shared.game.hints import resolve_hints
from shared.schemas import Event


def public_card_dict(card: Event) -> dict:
    """Player-visible card fields only — strips every engine/anti-cheat field
    (effects, requires, weight, flags, deck-adds, ending links)."""
    return {
        "id":          card.id,
        "title":       card.title,
        "description": card.description,
        "category":    card.category,
        "deck_name":   card.deck_name,
        "image_url":   card.image_url,
        "choices":     [{"text": c.text, "hints": resolve_hints(c)} for c in card.choices],
    }
