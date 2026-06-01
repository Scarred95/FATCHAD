# shared/game/constants.py
"""Tunable constants for the game engine.

Centralised so deck sizes and card pools live in one place rather than being
duplicated across modules. Stat bounds are not engine constants anymore —
they live in the `endings` collection as the threshold values on the default
ending docs.
"""

# ----- Deck sizing -----
DECK_TARGET_SIZE      = 12
DECK_REFILL_THRESHOLD = 5
# How many top-of-deck cards to fetch in one batch when looking for an eligible card.
# Bigger value = fewer round-trips at the cost of fetching cards we may not use.
DECK_DRAW_BATCH       = 5

# ----- Card pools -----
# Categories considered "filler" — used to top up the deck when running low.
GENERIC_CATEGORIES = ["politik", "social", "economy", "chaos"]

# Tutorial cards share this ID prefix (evt_tut_01_*..evt_tut_10_*). While any
# tutorial card is still sitting in the deck, refill is held off so the
# scripted intro plays out without generic cards bleeding in between beats.
TUTORIAL_ID_PREFIX = "evt_tut_"
