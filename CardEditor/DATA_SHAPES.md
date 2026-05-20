# FATCHAD — Data Shapes

This document describes every persistent and transient data shape the backend
operates on. Authoritative source: [`app/schemas.py`](app/schemas.py) (DB shapes)
and [`app/routes/_schemas.py`](app/routes/_schemas.py) (API shapes).

---

## MongoDB collections

The app uses a single database (env `MONGO_DB`, default `fatchad`) with two
collections.

| Collection     | Document type | Indexes        | Notes                                            |
|----------------|---------------|----------------|--------------------------------------------------|
| `events`       | `Event`       | `category`     | Card content. Read-heavy. Seeded by the seeder.  |
| `game_states`  | `GameState`   | `user_id`      | Per-run save data. Read & written every turn.    |

Both indexes are created by `ensure_indexes()` at app startup.

Pydantic models use `id: str = Field(alias="_id")` and serialise with
`by_alias=True`, so on the wire the field is **`_id`** (Mongo's primary key).

---

## DB shapes (`app/schemas.py`)

These are the documents stored in Mongo.

### `Event` — card definition (collection `events`)

Immutable at runtime. Authored as JSON, loaded by the seeder.

| Field         | Type                  | Notes                                                          |
|---------------|-----------------------|----------------------------------------------------------------|
| `_id`         | `str`                 | Conventionally prefixed `evt_…`                                |
| `title`       | `str`                 |                                                                |
| `description` | `str`                 |                                                                |
| `category`    | `str`                 | Free-form. See [_categories.md](events/_categories.md).        |
| `weight`      | `int ≥ 0`             | `0` = never drawn by refill (questline / ending only)          |
| `important`   | `bool`                | If `true`, ineligible card is re-shuffled instead of dropped   |
| `requires`    | `Requirements`        | Eligibility constraints (see below)                            |
| `choices`     | `list[Choice]`        | Length 2 or 3                                                  |
| `image_url`   | `str \| null`         |                                                                |

#### `Requirements` — eligibility gate

| Field        | Type                       | Meaning                                            |
|--------------|----------------------------|----------------------------------------------------|
| `flags_all`  | `list[str]`                | Player must have ALL of these flags                |
| `flags_none` | `list[str]`                | Player must have NONE of these flags               |
| `flags_any`  | `list[str]`                | Player must have AT LEAST ONE (if list non-empty)  |
| `stats`      | `dict[str, StatRange]`     | Each stat must be inside its range                 |

#### `StatRange`

| Field | Type           |
|-------|----------------|
| `min` | `int \| null`  |
| `max` | `int \| null`  |

#### `Choice` — one option on a card

| Field             | Type                     | Notes                                            |
|-------------------|--------------------------|--------------------------------------------------|
| `text`            | `str` (min length 1)     | Button text shown to the player                  |
| `effects`         | `Effects`                | Stat deltas, all default 0                       |
| `hints`           | `ChoiceHints`            | UI display hints. Auto-derived if all null.      |
| `sets_flags`      | `list[str]`              | Flags to add (idempotent)                        |
| `clears_flags`    | `list[str]`              | Flags to remove (also clears their timer)        |
| `adds_to_deck`    | `list[DeckAddition]`     | Cards to inject into deck or scheduled list      |
| `triggers_ending` | `str \| null`            | If set, run ends as `won` with this ending ID    |

#### `Effects` — stat deltas

| Field     | Type   | Default | Range when applied |
|-----------|--------|---------|--------------------|
| `moneten` | `int`  | 0       | clamped 0..100     |
| `aura`    | `int`  | 0       | clamped 0..100     |
| `respekt` | `int`  | 0       | clamped 0..100     |
| `rizz`    | `int`  | 0       | clamped 0..100     |
| `chaos`   | `int`  | 0       | clamped -100..100  |

#### `ChoiceHints` — UI hints (per stat, optional)

Each field is `Optional[StatHint]`. Values:

| Value       | UI rendering                              |
|-------------|-------------------------------------------|
| `"up"`      | ↑ icon                                    |
| `"down"`    | ↓ icon                                    |
| `"unknown"` | `?` icon (will change, magnitude unknown) |
| `"hidden"`  | omit this stat from the hint dict         |
| `null`      | falls back to auto-derive from `effects`  |

If all of `ChoiceHints` is null, the API falls back to `derive_hints_from_effects(choice)`
(`up`/`down` based on the sign of each non-zero delta).

#### `DeckAddition` — card injection from a choice

| Field      | Type                                    | Meaning                                                |
|------------|-----------------------------------------|--------------------------------------------------------|
| `card_id`  | `str`                                   | The card to add                                        |
| `position` | `"top"` \| `"bottom"` \| `"shuffle"`    | Where in the deck to insert (default `"shuffle"`)      |
| `in_turns` | `int ≥ 0` \| `null`                     | If set, goes to `scheduled` and fires after N turns    |

If `in_turns` is set, `position` is ignored. Scheduled cards always insert at
the **top** of the deck when their turn arrives.

---

### `GameState` — per-run save (collection `game_states`)

Mutable. Replaced on every turn via `replace_one(upsert=True)`.

| Field          | Type                       | Notes                                                  |
|----------------|----------------------------|--------------------------------------------------------|
| `_id`          | `str`                      | Conventionally `run_<12 hex>`                          |
| `user_id`      | `str`                      | Indexed for per-user lookups                           |
| `deck`         | `list[str]`                | Top of deck = index 0. Card IDs only.                  |
| `scheduled`    | `list[ScheduledCard]`      | Cards waiting for a future turn                        |
| `stats`        | `Stats`                    | Player stats                                           |
| `flags`        | `list[str]`                | Sorted set of active flags                             |
| `flag_timers`  | `dict[str, int]`           | Flag → turns remaining; 0 = clear flag                 |
| `history`      | `list[HistoryEntry]`       | Append-only log of choices                             |
| `turn`         | `int ≥ 0`                  | Increments after every applied choice                  |
| `rng_seed`     | `int`                      | Seed for per-turn RNG (`Random(seed + turn)`)          |
| `status`       | `GameStatus`               | `active` / `won` / `lost` / `abandoned`                |
| `ending`       | `str \| null`              | Ending ID once run is non-active                       |
| `created_at`   | `datetime`                 | UTC                                                    |
| `updated_at`   | `datetime`                 | UTC, refreshed on every save                           |

#### `Stats`

| Field     | Range       |
|-----------|-------------|
| `moneten` | 0 .. 100    |
| `aura`    | 0 .. 100    |
| `respekt` | 0 .. 100    |
| `rizz`    | 0 .. 100    |
| `chaos`   | -100 .. 100 |

Validation enforces range on construction. Effect application clamps before
storage.

#### `ScheduledCard`

| Field          | Type        | Notes                                  |
|----------------|-------------|----------------------------------------|
| `card_id`      | `str`       |                                        |
| `play_on_turn` | `int ≥ 0`   | Card promotes when `state.turn ≥ this` |

#### `HistoryEntry`

| Field       | Type        | Notes                              |
|-------------|-------------|------------------------------------|
| `event_id`  | `str`       | The card that was played           |
| `choice`    | `int ≥ 0`   | Index into the card's choices list |
| `turn`      | `int ≥ 0`   | Turn the choice was committed on   |

---

## API shapes (`app/routes/_schemas.py`)

These are the request/response shapes the HTTP layer speaks. Distinct from
the DB models so internal-only fields (weight, requires, raw effects) never
leak to the client.

### Requests

#### `CreateRunRequest`

| Field     | Type   | Notes                                  |
|-----------|--------|----------------------------------------|
| `user_id` | `str`  | TODO: derive from auth once added      |

#### `ChoiceRequest`

| Field           | Type           | Notes                                                   |
|-----------------|----------------|---------------------------------------------------------|
| `choice_index`  | `int`          | Required. 0-based index into the card's choices.        |
| `expected_turn` | `int \| null`  | Optional idempotency guard against client double-tap.   |

### Responses

#### `CardResponse` — sanitised card for the client

| Field         | Type                   |
|---------------|------------------------|
| `id`          | `str`                  |
| `title`       | `str`                  |
| `description` | `str`                  |
| `choices`     | `list[ChoicePreview]`  |
| `image_url`   | `str \| null`          |

Built via `CardResponse.from_event(event)`. Backend-only fields (`weight`,
`important`, `requires`, raw `effects`, etc.) are stripped.

#### `ChoicePreview`

| Field   | Type                       | Notes                                          |
|---------|----------------------------|------------------------------------------------|
| `text`  | `str`                      |                                                |
| `hints` | `dict[str, StatHint]`      | Stats with no hint are simply absent from dict |

#### `TurnResponse` — returned by `POST /runs` and `POST /runs/{id}/choice`

| Field       | Type                  | Notes                                    |
|-------------|-----------------------|------------------------------------------|
| `state`     | `GameState`           | Full updated state                       |
| `next_card` | `CardResponse \| null`| `null` when run just ended (no next card)|

#### `RunSummary` — lightweight list-view entry

Backed by a projected Mongo query (`_id, status, turn, stats, ending,
created_at, updated_at`). Omits deck, history, flags, timers, rng_seed.

| Field         | Type            |
|---------------|-----------------|
| `_id`         | `str`           |
| `status`      | `GameStatus`    |
| `turn`        | `int`           |
| `stats`       | `Stats`         |
| `ending`      | `str \| null`   |
| `created_at`  | `datetime`      |
| `updated_at`  | `datetime`      |

#### `EndSummary` — end-of-run screen

| Field            | Type           |
|------------------|----------------|
| `ending`         | `str \| null`  |
| `status`         | `GameStatus`   |
| `turns_survived` | `int`          |
| `final_stats`    | `Stats`        |
| `cards_played`   | `int`          |

---

## Endings catalogue

### Win endings

| Ending ID         | Trigger                                        |
|-------------------|------------------------------------------------|
| `chaos_agent`     | `stats.chaos == 100`                           |
| `grey_eminence`   | `stats.chaos == -100`                          |
| *(custom)*        | A choice's `triggers_ending` field             |

### Loss endings

| Ending ID                | Trigger              |
|--------------------------|----------------------|
| `death_bankrupt`         | `moneten == 0`       |
| `death_revolution`       | `moneten == 100`     |
| `death_irrelevant`       | `aura == 0`          |
| `death_jumped_shark`     | `aura == 100`        |
| `death_couped`           | `respekt == 0`       |
| `death_conspiracy`       | `respekt == 100`     |
| `death_frozen_out`       | `rizz == 0`          |
| `death_drowned_in_drama` | `rizz == 100`        |

### Softlock

| Ending ID            | Trigger                                                      |
|----------------------|--------------------------------------------------------------|
| `softlock_no_cards`  | Deck has no drawable card and refill couldn't supply one     |

---

## Type aliases

### `GameStatus`
```
"active" | "won" | "lost" | "abandoned"
```

### `StatHint`
```
"up" | "down" | "unknown" | "hidden"
```
