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

- **Authentication** — Cognito JWT. Every gameplay call carries
  `Authorization: Bearer <accessToken>`; the backend derives `user_id` from the
  token's `sub` claim via `get_current_user_id` (`backend/shared/auth.py`). **No
  endpoint takes `user_id` in body or query.** Admin routes are additionally
  gated by `require_admin` (Cognito `admin` group; falls back to `ADMIN_TOKEN`
  only in local dev where `COGNITO_USER_POOL_ID` is unset).

---

## Meta

### `GET /healthz`

Liveness probe. Reads the DynamoDB catalog pointer to confirm DB + published
catalog are reachable.

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
(saves the client a round-trip). `user_id` comes from the JWT, not the body.

**Request — `CreateRunRequest` (all optional):**
```json
{ "tutorial": true, "deck_ids": ["Tutorial", "..."] }
```
`tutorial` (default `true`) seeds the scripted tutorial opener; `deck_ids`
selects which decks build the run's redraw pool (omitted → server default decks).

**Response 201 — `TurnResponse`:**
```json
{
  "state": { /* full GameState */ },
  "next_card": { /* CardResponse */ }
}
```

`next_card` is `null` if no drawable card exists — the run is then born already
`ended` with `ending = "softlock_no_cards"`. The redraw pool is built from the
selected decks (`build_run_deck`); the tutorial opener is seeded separately.

---

### `GET /runs` — list the caller's runs

Lightweight summaries — no deck, history, or flags. The user is taken from the
JWT; there is no `user_id` parameter.

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
- `409` if the run is no longer `active` (already `ended` or `abandoned`).

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

## Guest sessions & account claim

Let a player start playing instantly without signing up, then keep their
progress if they later register. The auth-flow rationale lives in
[cognito.md](cognito.md#guest-sessions); this section is the wire contract.

### `POST /guest` — mint a throwaway account

**Unauthenticated.** Creates a confirmed Cognito user in the `guest` group with
a random email + password and writes its profile row, then returns the
credentials so the browser can sign in via the normal SRP flow. From then on a
guest is just a user whose JWT carries the `guest` group.

**Request:** none.

**Response 201 — `GuestSessionResponse`:**
```json
{ "email": "guest-3f2a…@guest.fatchad.local", "password": "<disposable secret>" }
```

**Errors:**
- `503` if auth isn't configured (`COGNITO_USER_POOL_ID` unset — local dev).

### `POST /account/claim` — absorb a guest's progress

Called by a freshly-registered **real** account (authenticated via the
`Authorization` header) to migrate a guest's runs + profile totals onto itself.
The guest is proven by passing its own still-valid access token in the body, so
only the holder of the guest session can claim it. Runs are merged (no data
loss) and the guest's Cognito account is deleted.

**Request — `ClaimGuestRequest`:**
```json
{ "guest_access_token": "<the guest's JWT>" }
```

**Response 200 — `ClaimGuestResponse`:**
```json
{ "migrated_runs": 3 }
```

**Errors:**
- `400` if the guest token has no `sub`, or the guest is the caller's own account.
- `403` if the supplied token isn't a guest (no `guest` group) — real accounts can't be claimed.
- `401` if the guest token is invalid/expired.

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
  `ended` with `ending = "softlock_no_cards"` before the error returns.

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

**Server-side per-turn pipeline (in order)** — see `apply_choice` in
`backend/shared/game/effects.py` and `check_endings` in
`backend/shared/game/endings.py`:

1. Consume the played card from the deck. Cards above it that were ineligible:
   - `important: true`  → re-shuffled to a random position deeper in the deck
   - `important: false` → dropped (their moment passed)
   - stale (deleted)    → dropped
2. Apply stat effects (each clamped to its valid range).
3. Apply flag mutations (`sets_flags`, `clears_flags`).
4. Apply this choice's `adds_to_deck` (immediate or scheduled).
5. Mutate the run's active ending set (`unlocks_endings` / `removes_endings`).
6. Append a `HistoryEntry`; increment `turn`.
7. Promote any scheduled cards whose `play_on_turn` is now ≤ current turn.
8. Strip leftover tutorial cards once `tutorial_done` is set.
9. Refill the live deck from the run's `redraw_deck` if it dropped below
   `DECK_REFILL_THRESHOLD` (5), capped at `DECK_TARGET_SIZE` (12).
10. Evaluate endings against the run's **active ending set** (data-driven, not
    hardcoded). The status becomes `ended` and `ending` is set when either:
    - the choice's `triggers_ending` is in the active set, or
    - an enabled active ending's `requires` (flags + stat ranges) is satisfied —
      lowest `priority` wins on a tie.

    Threshold endings (e.g. a stat hitting 0/100, chaos at ±100) are expressed as
    ordinary `Ending` records with the appropriate `requires`/`priority`, not as
    engine constants.

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
  "ending":             "singularity",
  "ending_title":       "Die Singularität",
  "ending_description": "Du bist mit dem System verschmolzen…",
  "status":             "ended",
  "turns_survived":     47,
  "final_stats":        { "moneten": 30, "aura": 75, "respekt": 40, "rizz": 60, "chaos": 60 },
  "cards_played":       47,
  "newly_unlocked":     [ /* UnlockedAchievement[] — achievements earned this run */ ]
}
```

`status` is `"ended"` (an ending fired) or `"abandoned"`. `ending`,
`ending_title`, and `ending_description` are `null` for an `abandoned` run with
no specific ending tag (title/description are denormalised from the `Ending` doc
so the recap renders from one fetch).

**Errors:**
- `404` — run not found.
- `409` — run is still `active`.

---

## Admin — card content (`/admin/cards`)

Card definitions stored as items in the DynamoDB catalog table (`CatalogRepo`).
Every `/admin/*` route is gated by `require_admin` at the parent admin router.
For the `category` taxonomy, flag-naming and weight conventions, and questline
patterns, see the [card-authoring guide](categories.md).

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
  "deck_name":   "Politik",
  "weight":      10,
  "important":   false,
  "enabled":     true,
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
  "triggers_ending": null,
  "unlocks_endings": [],
  "removes_endings": []
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
`requires`, `choices`, `enabled`, `important`, `deck_name`.

**Response 200 — `Event`** (merged result).

**Errors:** `404` if not found, `422` on field validation failure.

---

### `DELETE /admin/cards/{card_id}` — remove a card

**Response 204.**

**Errors:** `404` if not found.

---

### `POST /admin/cards/decks/{deck_name}/toggle` — bulk enable/disable a deck

Sets the `enabled` flag on every card belonging to `deck_name` in one call. Pass
`__orphans__` to target cards with no `deck_name`.

**Request — `DeckToggleRequest`:** `{ "enabled": false }`

**Response 200 — `DeckToggleResponse`:** `{ "matched": 12, "modified": 9 }`

---

## Admin — run inspection (`/admin/runs/...`)

Read-only inspection of player runs (the "why didn't this achievement fire?"
debugging surface). There is **no** deck-mutation endpoint — runs are never
edited through the admin API. A run row lives under `USER#<uid>` with no run_id
GSI, so these routes take the owning `user_id` alongside the `run_id`.

### `GET /admin/runs/{user_id}` — list a user's runs

**Response 200 — `list[RunSummaryRow]`:** lightweight rows (`run_id`, `status`,
`turn`, `ending`, timestamps), newest first.

---

### `GET /admin/runs/{user_id}/{run_id}/history` — full run state

Returns the complete `GameState`, including the per-turn `history[].stats`
snapshot the player-facing history endpoint omits, plus the `newly_unlocked`
ids stamped at finalize.

**Response 200 — `GameState`.**

**Errors:** `404` if the run is absent from all status partitions for the user.

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
`"active"` | `"ended"` | `"abandoned"`

`ended` is a single terminal state — there is no separate won/lost flag. *Which*
ending fired lives in the run's `ending` field (a string id), not in the status.

### Endings
Endings are **data-driven** `Ending` records in the catalog, not engine
constants. A run carries an `active_endings` set (globals + its selected decks'
defaults, snapshotted at run start); `check_endings` fires one when a choice's
`triggers_ending` is in that set, or when an active ending's `requires` (flags +
stat ranges) is met — lowest `priority` wins ties. Threshold conditions (a stat
hitting 0/100, chaos at ±100) are expressed as ordinary `Ending` records with
the appropriate `requires`/`priority`. The `ending` id may be any string defined
in the catalog; `softlock_no_cards` is the one engine sentinel (set when no
drawable card exists), not an `Ending` doc.
