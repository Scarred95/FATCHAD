# FATCHAD — API Reference

Base URL: `http://localhost:8000` (dev). All bodies are JSON.

Pydantic serialises with `by_alias=True`, so document IDs are wired as `_id`
on the way out (not `id`). The frontend should read `state._id`, `card.id`
(the API model uses `id`), etc. — see the per-endpoint shapes below.

---

## Conventions

- **Status codes**
  - `200 OK` — successful read/update
  - `201 Created` — successful resource creation
  - `204 No Content` — successful delete
  - `400 Bad Request` — invalid payload (e.g. unknown choice index)
  - `404 Not Found` — run / card not found
  - `409 Conflict` — state-machine violation (run already ended, stale turn, softlock, etc.)
  - `422 Unprocessable Entity` — Pydantic validation failure on the request body

- **Errors** — FastAPI returns `{"detail": "<message>"}` on every non-2xx.

- **Authentication** — none yet. `user_id` is passed explicitly. TODO: derive from a token.

---

## Meta

### `GET /healthz`

Liveness probe. Pings Mongo.

**Response 200:**
```json
{ "status": "ok",        "db": true  }
{ "status": "degraded",  "db": false }
```

---

## Run lifecycle

These endpoints create, list, load, abandon and delete the run record itself.
The active game loop lives under "Gameplay".

### `POST /runs` — start a new run

Creates a fresh game state and returns it with the first card pre-fetched
(saves the client a round-trip).

**Request:**
```json
{ "user_id": "user_abc123" }
```

**Response 201 — `TurnResponse`:**
```json
{
  "state": { /* full GameState */ },
  "next_card": { /* CardResponse */ }
}
```

`next_card` is `null` if the events collection is empty (run is created already
in `lost / softlock_no_cards` state). The starter deck is seeded from the
`tutorial` category, capped at 15.

---

### `GET /runs?user_id={user_id}` — list a user's runs

Lightweight summaries — no deck, history, or flags.

**Query params:** `user_id` (required)

**Response 200 — `list[RunSummary]`:**
```json
[
  {
    "_id":         "run_abc123",
    "status":      "active",
    "turn":        12,
    "stats":       { "moneten": 50, "aura": 50, "respekt": 50, "rizz": 50, "chaos": 0 },
    "ending":      null,
    "created_at":  "2026-05-08T10:00:00Z",
    "updated_at":  "2026-05-08T10:30:00Z"
  }
]
```

---

### `GET /runs/{run_id}` — load a full run

Used to resume after a page reload.

**Response 200 — full `GameState`:**
```json
{
  "_id":          "run_abc123",
  "user_id":      "user_abc",
  "deck":         ["evt_x", "evt_y"],
  "scheduled":    [{ "card_id": "evt_z", "play_on_turn": 14 }],
  "stats":        { "moneten": 50, "aura": 50, "respekt": 50, "rizz": 50, "chaos": 0 },
  "flags":        ["tutorial_done", "path_money"],
  "flag_timers":  { "armed": 3 },
  "history":      [{ "event_id": "evt_x", "choice": 0, "turn": 0 }],
  "turn":         12,
  "rng_seed":     1234567890,
  "status":       "active",
  "ending":       null,
  "created_at":   "2026-05-08T10:00:00Z",
  "updated_at":   "2026-05-08T10:30:00Z"
}
```

**Errors:** `404` if `run_id` doesn't exist.

---

### `POST /runs/{run_id}/abandon` — quit a run gracefully

Marks the run as `abandoned`, preserving history (use `DELETE` to wipe).

**Request:** none

**Response 200 — full `GameState` (status now `"abandoned"`).**

**Errors:**
- `404` if the run doesn't exist.
- `409` if the run is already ended (`won` / `lost` / `abandoned`).

---

### `DELETE /runs/{run_id}` — permanently delete a run

Active runs are protected by default — pass `?force=true` to delete anyway.
Prefer `POST /abandon` to quit cleanly while keeping history.

**Query params:** `force` (bool, default `false`)

**Response 204** — empty body on success.

**Errors:**
- `404` if the run doesn't exist.
- `409` if the run is `active` and `force=true` was not provided.

---

## Gameplay

The core game loop. Called repeatedly while a run is `active`.

### `GET /runs/{run_id}/card` — peek at the current card

Returns the top eligible card without consuming it. Mainly used on resume —
during normal play the next card is bundled in the `TurnResponse` from
`POST /choice`.

**Response 200 — `CardResponse`:**
```json
{
  "id":          "evt_corrupt_minister",
  "title":       "Der korrupte Minister",
  "description": "Ein Minister bietet dir Insider-Infos…",
  "image_url":   null,
  "choices": [
    {
      "text":  "Bezahlen",
      "hints": { "moneten": "down", "aura": "up", "respekt": "up" }
    },
    {
      "text":  "Ihn bloßstellen",
      "hints": { "respekt": "up", "aura": "down", "chaos": "unknown" }
    }
  ]
}
```

`hints` values: `"up"`, `"down"`, `"unknown"` (?), or stat omitted (no hint).
Effects, requirements, weight, and the `important` flag are NOT exposed.

**Errors:**
- `404` if the run doesn't exist.
- `409` if the run is not `active`.
- `409` if no card in the deck is currently drawable — the run is auto-marked
  `lost / softlock_no_cards` before the error returns.

---

### `POST /runs/{run_id}/choice` — submit a choice

Applies the chosen choice to the run, advances the turn, and returns the
new state plus the next card.

**Request — `ChoiceRequest`:**
```json
{
  "choice_index":  0,
  "expected_turn": 12
}
```

- `choice_index` (required) — 0-based index into the current card's `choices`.
- `expected_turn` (optional) — the turn the client *thinks* the run is on.
  Used as an idempotency guard against double-tapping. If the run has already
  advanced past `expected_turn`, the request is rejected as stale.

**Response 200 — `TurnResponse`:**
```json
{
  "state":     { /* updated GameState */ },
  "next_card": { /* CardResponse */ } | null
}
```

`next_card` is `null` when the run has just ended (`status != "active"`).

**Server-side per-turn pipeline (in order):**

1. Consume the played card from the deck. Cards above it that were ineligible:
   - `important: true`  → re-shuffled to a random position deeper in the deck
   - `important: false` → dropped (their moment passed)
   - stale (deleted)    → dropped
2. Apply stat effects (each clamped to its valid range).
3. Apply flag mutations (`sets_flags`, `clears_flags`).
4. Tick down `flag_timers`; flags whose timer hits 0 are cleared.
5. Apply this choice's `adds_to_deck` (immediate or scheduled).
6. Append a `HistoryEntry`; increment `turn`.
7. Promote any scheduled cards whose `play_on_turn` is now ≤ current turn.
8. Refill the deck if it dropped below `DECK_REFILL_THRESHOLD` (5), capped at
   `DECK_TARGET_SIZE` (12), drawing from `GENERIC_CATEGORIES`.
9. Evaluate end conditions (priority order):
   - Choice's `triggers_ending` → `won`
   - Any main stat at 0 or 100 → `lost` with the matching `death_*` ending
   - Chaos at ±100 → `won` with `chaos_agent` / `grey_eminence`

**Errors:**
- `400` — `choice_index` out of range for the current card.
- `404` — run not found.
- `409` — run not `active`, stale `expected_turn`, or softlock.

---

### `GET /runs/{run_id}/summary` — end-of-run summary

Only callable once the run has ended.

**Response 200 — `EndSummary`:**
```json
{
  "ending":         "singularity",
  "status":         "won",
  "turns_survived": 47,
  "final_stats":    { "moneten": 30, "aura": 75, "respekt": 40, "rizz": 60, "chaos": 60 },
  "cards_played":   47
}
```

`ending` may be `null` for an `abandoned` run with no specific ending tag.

**Errors:**
- `404` — run not found.
- `409` — run is still `active`.

---

## Admin — card content (`/admin/cards`)

Card definitions stored in the `events` collection. Currently unauthenticated
(TODO).

### `GET /admin/cards` — list cards

**Query params:**
- `category` (optional) — filter by exact category match.
- `limit` (default `100`)
- `skip`  (default `0`)

**Response 200 — `list[Event]`:** full card documents.

---

### `GET /admin/cards/{card_id}` — read one card

**Response 200 — `Event`:**
```json
{
  "_id":         "evt_corrupt_minister",
  "title":       "Der korrupte Minister",
  "description": "…",
  "category":    "politik",
  "weight":      10,
  "important":   false,
  "requires":    { "flags_all": [], "flags_none": [], "flags_any": [], "stats": {} },
  "choices":     [ /* Choice[] — 2 to 3 entries */ ],
  "image_url":   null
}
```

`Choice`:
```json
{
  "text":            "Ihn bloßstellen",
  "effects":         { "moneten": 0, "aura": -5, "respekt": 15, "rizz": 0, "chaos": 10 },
  "hints":           { "moneten": null, "aura": null, /* … */ },
  "sets_flags":      ["minister_dead"],
  "clears_flags":    [],
  "adds_to_deck":    [{ "card_id": "evt_x", "position": "shuffle", "in_turns": null }],
  "triggers_ending": null
}
```

**Errors:** `404` if not found.

---

### `POST /admin/cards` — create a card

**Request — full `Event`:** Pydantic validates the entire document on input.

**Response 201 — `Event`** (the stored document).

**Errors:**
- `409` if a card with the same `_id` already exists.
- `422` on validation failure.

---

### `PUT /admin/cards/{card_id}` — replace a card entirely

The `_id` in the body must match the URL.

**Response 200 — `Event`.**

**Errors:**
- `400` — `_id` mismatch.
- `404` — card doesn't exist.

---

### `PATCH /admin/cards/{card_id}` — partial update

Only fields present in the request body are changed; everything else is left
intact (uses `model_dump(exclude_unset=True)`).

**Allowed fields:** `title`, `description`, `category`, `weight`, `image_url`,
`requires`, `choices` (and `important`, once added to the patch schema).

**Response 200 — `Event`** (merged result).

**Errors:** `404` if not found, `422` on field validation failure.

---

### `DELETE /admin/cards/{card_id}` — remove a card

**Response 204.**

**Errors:** `404` if not found.

---

## Admin — debug deck tools (`/admin/runs/...`)

Manual deck manipulation for testing card sequences. Dev-only.

### `POST /admin/runs/{run_id}/deck` — inject a card into a run's deck

**Request — `InsertCardRequest`:**
```json
{
  "card_id":  "evt_singularity_finale",
  "position": "top"
}
```

`position` ∈ `"top"` (default) | `"bottom"` | `"shuffle"` (random index).
Note: `shuffle` here uses the global RNG (not the run's seeded one) since
reproducibility doesn't matter for dev tools.

**Response 204.**

**Errors:** `404` if the run doesn't exist.

---

### `DELETE /admin/runs/{run_id}/deck/{index}` — remove a card by deck index

Deletes the card at `state.deck[index]`.

**Response 204.**

**Errors:**
- `404` — run not found.
- `400` — index out of range.

---

## Data shapes — quick reference

### `Stats`
| Field      | Range       | Notes |
|------------|-------------|-------|
| `moneten`  | 0 – 100     | money / resources |
| `aura`     | 0 – 100     | public image |
| `respekt`  | 0 – 100     | political standing |
| `rizz`     | 0 – 100     | personal magnetism |
| `chaos`    | -100 – +100 | systemic instability (poles are wins, not deaths) |

### `GameStatus`
`"active"` | `"won"` | `"lost"` | `"abandoned"`

### Endings
- **Wins:** `chaos_agent`, `grey_eminence`, plus any custom string from a
  card's `triggers_ending`.
- **Deaths:** `death_bankrupt`, `death_revolution`, `death_irrelevant`,
  `death_jumped_shark`, `death_couped`, `death_conspiracy`, `death_frozen_out`,
  `death_drowned_in_drama`.
- **Softlock:** `softlock_no_cards` (no drawable card available).
