# FATCHAD — Frontend ↔ Backend API Contract

A wiring map: **what the frontend fetches, from where, and in what shape.** Use it
when changing the backend so you know which frontend layer to update (and vice
versa). Line numbers are approximate — treat the file as the source of truth.

---

## 0. How a change flows through the stack

A single endpoint touches up to four layers. To change one safely, edit them in
this order:

| Layer | Player app | Admin app |
|-------|-----------|-----------|
| Backend handler | `backend/gameplay_lambda/routes/*.py` | `backend/admin_lambda/routes/*.py` |
| Backend request/response model | `backend/gameplay_lambda/routes/_schemas.py` + `backend/shared/schemas.py` | `backend/shared/schemas.py` (+ per-route `Patch*` models) |
| Frontend caller | `frontend/src/api/client.ts` | `frontend/src/api/admin.ts` |

If you add/rename a field on a shared entity (Card, Deck, Ending, Achievement,
GameState), you must update **both** the Pydantic model in `shared/schemas.py`
**and** the matching TS interface, or the field silently drops on the wire.

---

## 1. Base URLs, auth, transport

Defined in `frontend/src/api/config.ts`:

- **Gameplay base** `API_BASE = VITE_API_BASE_URL ?? '/api'` — Vite dev proxy
  rewrites `/api` → `http://127.0.0.1:8000` (see `vite.config.ts`); CI injects the
  deployed HTTP API host.
- **Admin base** `ADMIN_API_BASE = VITE_ADMIN_API_BASE_URL ?? '/api/admin'` — kept
  separate so admin can route through a different (e.g. VPN-only) host.

**Auth:** every call goes through a `request()`/`http()` wrapper
(`client.ts:54`, `admin.ts`) that attaches `Authorization: Bearer <accessToken>`
from `authStore` (Cognito JWT). The backend derives `user_id` from the token's
`sub` claim — **no endpoint takes a `user_id` in body or path** (except admin
inspection endpoints, which take the *target* user id). Admin routes are
additionally gated by Cognito `admin`-group membership (`require_admin`).

**WIP mode:** if `VITE_WIP_MODE === 'true'` (S3 preview builds), every gameplay
call short-circuits before the network and raises `ApiError(0, …)`.

**ID aliasing:** backend models use `id: str = Field(alias="_id")` and serialize
by alias, so most entities arrive at the frontend with **`_id`** (GameState,
RunSummary, Card, Ending, Achievement). The exception is `CardResponse`, which
uses a plain `id` field on both sides.

---

## 2. Player-facing API (gameplay Lambda)

Routers mounted in `backend/gameplay_lambda/app.py`. Frontend callers in
`frontend/src/api/client.ts`; types in `frontend/src/api/types.ts`.

| Frontend fn | Method · Path | Request | Response (BE model → FE type) | Backend handler |
|---|---|---|---|---|
| `getHealth()` | GET `/healthz` | — | `HealthResponse` | `shared/routes/health.py` |
| `createGuestSession()` | POST `/guest` | — | `GuestSessionResponse` `{email,password}` | `routes/guest.py` |
| `claimGuestAccount(t)` | POST `/account/claim` | `{guest_access_token}` | `ClaimGuestResponse` `{migrated_runs}` | `routes/account.py` |
| `getCurrentCatalog()` | GET `/catalog/current` | — | `PublicCatalog` | `routes/catalog.py` |
| `listDecks()` | GET `/decks` | — | `DeckOption[]` | `routes/decks.py` |
| `listAchievements()` | GET `/achievements` | — | `AchievementView[]` | `routes/achievements.py:25` |
| `listUnlockedAchievements()` | GET `/achievements/unlocked` | — | `UnlockedAchievementView[]` | `routes/achievements.py:38` |
| `createRun(opts?)` | POST `/runs` | `CreateRunRequest` `{tutorial?, deck_ids?}` | `TurnResponse` | `routes/runs.py:47` |
| `listRuns()` | GET `/runs` | — | `RunSummary[]` | `routes/runs.py:129` |
| `getRun(id)` | GET `/runs/{id}` | — | `GameState` | `routes/runs.py:150` |
| `abandonRun(id)` | POST `/runs/{id}/abandon` | — | `GameState` | `routes/runs.py:202` |
| `deleteRun(id, force?)` | DELETE `/runs/{id}[?force=true]` | — | `204 No Content` | `routes/runs.py:216` |
| `getCurrentCard(id)` | GET `/runs/{id}/card` | — | `CardResponse \| null` | `routes/gameplay.py:37` |
| `submitChoice(id, idx, turn?)` | POST `/runs/{id}/choice` | `ChoiceRequest` `{choice_index, expected_turn}` | `TurnResponse` | `routes/gameplay.py:50` |
| `getEndSummary(id)` | GET `/runs/{id}/summary` | — | `EndSummary` | `routes/gameplay.py:111` |
| `getHistory(id)` | GET `/runs/{id}/history` | — | `HistoryDetailEntry[]` | `routes/runs.py:156` |

### Core game loop

```
createRun() ─► TurnResponse{ state, next_card }
                     │
   render next_card  ▼
submitChoice(id, choiceIndex, state.turn) ─► TurnResponse{ state, next_card|null }
                     │  (repeat while state.status === 'active' && next_card)
   state.status !== 'active'  ▼
getEndSummary(id) ─► EndSummary{ ending_title, final_stats, newly_unlocked, … }
getHistory(id)    ─► HistoryDetailEntry[]   (run recap / verlauf)
```

`submitChoice` sends `expected_turn = state.turn`; the backend 409s on a mismatch
(stale/duplicate submit). On an ending, `next_card` is `null` and
`state.newly_unlocked` carries freshly-granted achievement ids (expanded into
`EndSummary.newly_unlocked`).

---

## 3. Admin API (admin Lambda)

All routes prefixed `/admin` and gated by `require_admin`. Frontend callers in
`frontend/src/api/admin.ts`; types in `frontend/src/admin/types.ts`. Routers
mounted in `backend/admin_lambda/routes/__init__.py`.

**Cards** (`/admin/cards`, BE model `Event`, FE type `Card`):
`listCards` GET · `getCard` GET `/{id}` · `createCard` POST · `replaceCard` PUT
`/{id}` · `patchCard` PATCH `/{id}` (`PatchCardRequest`) · `deleteCard` DELETE
`/{id}` · `toggleDeck` POST `/decks/{name}/toggle` `{enabled}` → `DeckToggleResult`.

**Decks** (`/admin/decks`, BE+FE `Deck`):
`listDecks` GET · `getDeck` GET `/{name}` · `createDeck` POST (`CreateDeckRequest`)
· `replaceDeck` PUT `/{name}` (`ReplaceDeckRequest`) · `patchDeck` PATCH `/{name}`
(`PatchDeckRequest`) · `deleteDeck` DELETE `/{name}`.

**Endings** (`/admin/endings`, BE+FE `Ending`):
`listEndings` · `getEnding` · `createEnding` · `replaceEnding` · `patchEnding`
(`PatchEndingRequest`) · `deleteEnding` — standard REST on `/{id}`.

**Achievements** (`/admin/achievements`, BE+FE `Achievement`):
`listAchievements` · `getAchievement` · `createAchievement` · `replaceAchievement`
· `patchAchievement` (`PatchAchievementRequest`) · `deleteAchievement` — REST on
`/{id}`.

**Inspection (read-only):**
`listPlayers()` GET `/admin/users` → `PlayerSummary[]` ·
`getUserDetail(uid)` GET `/admin/users/{uid}` → `UserDetail` ·
`listUserRuns(uid)` GET `/admin/runs/{uid}` → `RunSummaryRow[]` ·
`getRunHistory(uid, runId)` GET `/admin/runs/{uid}/{runId}/history` → backend
returns a `GameState`; FE types it as `AdminRunView`, a read-only subset mirror
(see §5).

**Publish:** `getCurrentPointer()` GET `/admin/publish/current` → `CatalogPointer |
null` · `publishCatalog(version?)` POST `/admin/publish` → `CatalogPointer`.
Publishing snapshots the catalog to S3 (`catalog_full.json` + `catalog_public.json`)
and bumps the pointer version. The publisher **strips disabled items and cascades
deck-disable to its cards/endings** (`backend/shared/db/publisher.py`), so
gameplay only ever reads enabled, deck-enabled content.

**Auth:** `adminPing()` GET `/admin/auth/ping` → `{ok}`.

---

## 4. Core data shapes

Field-level shapes for the entities that cross the wire. Backend definitions in
`backend/shared/schemas.py` (shared) and
`backend/gameplay_lambda/routes/_schemas.py` (gameplay DTOs). FE in
`api/types.ts` (player) and `admin/types.ts` (admin).

### Stats / Effects / hints

```
Stats     { moneten, aura, respekt, rizz, chaos : int }       # absolute values
Effects   same five keys, default 0                            # per-choice deltas
StatHint  "up" | "down" | "unknown" | "hidden"                 # what the UI reveals
```

The five stat axes are the single source of truth in
`backend/shared/game/constants.py:STAT_NAMES`.

### GameState (`shared/schemas.py` ↔ `api/types.ts`)

```
_id, user_id            : str
deck                    : str[]              # live deck (card ids, top-first)
scheduled               : ScheduledCard[]    # {card_id, play_on_turn}
redraw_deck             : str[]              # run's draw pool (refill source)
deck_ids                : str[]              # decks this run was built from
active_endings          : str[]              # ending ids currently eligible to fire
stats                   : Stats
flags                   : str[]
history                 : HistoryEntry[]     # {event_id, choice, turn, stats?}
turn                    : int
rng_seed                : int
status                  : "active"|"ended"|"abandoned"
ending                  : str | null         # fired ending id
newly_unlocked          : str[]              # achievement ids granted this end
created_at, updated_at  : ISO datetime
```

### Card / Event + Choice (`Event` ↔ `Card`)

```
Card        _id, title, description, category : str
            deck_name : str|null,  weight : int(≥0, def 10),
            important : bool,  enabled : bool(def true),
            requires : Requirements,  image_url : str|null,
            choices : Choice[2..3]

Choice      text : str
            effects : Effects,  hints : per-stat StatHint
            sets_flags, clears_flags : str[]
            adds_to_deck : DeckAddition[] { card_id, position:top|bottom|shuffle, in_turns?:int }
            triggers_ending : str|null      # fire this ending now (if in active set)
            unlocks_endings : str[]         # ADD ending ids to the run's active set
            removes_endings : str[]         # REMOVE ending ids from the active set

Requirements  flags_all, flags_none, flags_any : str[]
              stats : { <stat>: {min?, max?} }
```

`CardResponse` (what the player sees) is the **safe projection** of a Card: `id,
title, description, category, deck_name, image_url`, and `choices` reduced to
`ChoicePreview { text, hints }` — effects/requires/flags never reach the player.

### Deck (`Deck`, shared ↔ admin)

```
name           : str (primary key, immutable)
description    : str
enabled        : bool
unlock_rule    : { kind: "default"|"achievement", achievement_id?:str }
removes_endings: str[]      # ending ids this deck strips from a run when selected
starting_card_id : str|null # story opener shuffled into the start deck
created_at, updated_at : ISO datetime
```

### Ending (`Ending`)

```
_id, title, description : str
deck_name : str|null     # null = global, else deck-bound
default   : bool         # see ending-assignment rule below
enabled   : bool
priority  : int (def 100; lower wins on threshold match)
requires  : EndingRequirements { flags_all/none/any, stats }
image_url : str|null
```

**Run ending-assignment rule** (`shared/db/catalog_snapshot.py:active_ending_ids_for_run`):
a fresh run's `active_endings` =
`(every default ending) ∪ (endings bound to a selected deck)` − `(selected decks'
removes_endings)`. So `default=true` ⇒ always in (global or deck-bound);
`default=false` + deck-bound ⇒ in only when its deck is picked; `default=false` +
global ⇒ never auto-assigned (reachable only after a card's `unlocks_endings`
adds it, then via `triggers_ending` or a threshold match). Card-driven
add/remove happens at play time in `shared/game/endings.py`.

### Achievement (`Achievement`)

```
_id, name : str
description, hint : str
criteria : { description: str, payload: dict }   # payload is opaque v1 (evaluator-owned)
points : int
unlocks_deck : str|null
enabled, hidden : bool
image_url : str|null
```

Earning evaluation: `backend/shared/game/achievements.py` reads `criteria.payload`.

### Gameplay DTOs (`_schemas.py`)

```
CreateRunRequest   { tutorial: bool = true, deck_ids: str[]|null }
ChoiceRequest      { choice_index: int≥0, expected_turn: int≥0 }
TurnResponse       { state: GameState, next_card: CardResponse|null }
RunSummary         { _id, status, turn, stats, ending, created_at, updated_at }
EndSummary         { ending, ending_title, ending_description, status,
                     turns_survived, final_stats: Stats, cards_played,
                     newly_unlocked: UnlockedAchievement[] }
HistoryDetailEntry { turn, event_id, title, description?, category?, deck_name?,
                     choice_index, choice_text, effects: Effects,
                     sets_flags[], clears_flags[], triggered_ending? }
DeckOption         { name, description }
AchievementView    { id, name, description, hint, points, unlocks_deck, image_url }
UnlockedAchievementView = AchievementView + { unlocked_at }
```

---

## 5. Notes on FE/BE shape alignment

**Admin `getRunHistory` types `AdminRunView`, not `GameState`** — this is
intentional, not a bug. The backend returns a full `GameState`; `AdminRunView`
is a deliberate read-only **subset mirror** the run-inspector consumes
(`RunInspector.tsx` reads only `_id, user_id, status, turn, ending,
created_at, updated_at, stats, flags, newly_unlocked, history[]`). Every field
it reads is present on `GameState`, so the narrower type is sound. Keep them in
sync if the inspector starts reading more fields.

*(Resolved in earlier passes: the dead `getEarnedAchievements()` client fn +
its `EarnedAchievement` type were deleted; `Deck.starting_card_id` is now in
the FE `Deck` type, admin payloads, deck store, and the `DeckEditor` UI via a
`CardPicker`.)*
