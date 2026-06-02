# FATCHAD Frontend — Current State & Design Brief

A self-contained description of the FATCHAD frontend as it exists today: the
game concept, every screen and feature, the admin authoring tool, client state,
and — most importantly — the full API surface and exactly where the frontend
wires into the backend. Written so it can be handed to a design tool to
generate new screens/components, or to plan the next phase of frontend work.

---

## 1. What FATCHAD is

A **Reigns-like swipe card game** with a **German UI**. The player is dealt one
card at a time and makes a binary (sometimes ternary) **swipe choice** — left,
right, or down. Each choice nudges five stats. The run continues until an
**ending** triggers or the player abandons it. All run state is persisted
server-side, so runs can be saved and resumed across sessions.

**Five stats** (0–100, except Chaos which is −100…+100):
- **Moneten** (money)
- **Aura** (reputation)
- **Respekt** (respect)
- **Rizz** (charm)
- **Chaos** (instability; hitting ±100 triggers a "win" ending)

**Core nouns:**
- **Card / Event** — a prompt with 2–3 choices. Belongs to a named **deck** and
  a **category**.
- **Choice** — text + stat effects + hints (up/down arrows shown pre-commit) +
  optional flag sets/clears, deck additions, and ending triggers.
- **Flags** — arbitrary run-state strings (`has_weapon`, `betrayed_ally`) set by
  choices and gating card eligibility.
- **Ending** — fires when a choice forces it, or when an active ending's
  stat/flag requirements are met. Has a priority; one can be the default.
- **Deck** — a named group of cards drawn during a run.
- **Achievement** — present in the catalog type and public bundle, **no UI yet**.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Build | Vite 5 + TypeScript 5 |
| UI | React 18 |
| Routing | React Router v6 (`createBrowserRouter`) |
| State | Zustand v5 |
| Animation | Framer Motion v11 |
| Admin graph | ReactFlow v11 (lazy-loaded) |
| Admin schema/validation | Zod v3 |
| Admin import/export | JSZip |
| Styling | CSS Modules + design tokens in `src/styles/tokens.css` |

Scripts: `npm run dev` (Vite @ :5173), `npm run build` (`tsc && vite build`),
`npm run typecheck`.

---

## 3. Route map (`src/routes.tsx`)

Player surface (eager-loaded), wrapped in `App.tsx`:

| Path | Screen | File |
|---|---|---|
| `/` | Title | `src/pages/Title.tsx` |
| `/runs` | Run list | `src/pages/RunList.tsx` |
| `/runs/new` | New run confirm | `src/pages/NewRun.tsx` |
| `/runs/:runId` | Game (main loop) | `src/pages/Game.tsx` |
| `/runs/:runId/end` | End screen | `src/pages/EndScreen.tsx` |
| `/about` | About | `src/pages/About.tsx` |

Admin surface — **lazy-loaded** (keeps reactflow/zod/jszip out of the gameplay
bundle), gated by `RequireAdmin`:

| Path | Screen |
|---|---|
| `/admin` | Decks index |
| `/admin/decks/:name` | Deck detail |
| `/admin/graph` | Graph view (WIP) |
| `/admin/cards/new`, `/admin/cards/:id` | Card editor |
| `/admin/endings`, `/admin/endings/new`, `/admin/endings/:id` | Endings index + editor |

---

## 4. Player-facing screens & features

### Title (`/`)
Entry point. Glitch-animated FATCHAD logo + tagline. Buttons: **Neue Runde** →
`/runs/new`; **Fortsetzen** → `/runs` (disabled if no runs); **Über FATCHAD** →
`/about`. Collapsed **admin toggle** with inline token entry. Offline status
pill when the server is unreachable.

### About (`/about`)
Static explainer: concept, stat meanings (Chaos ±100 = victory), credits, and a
live server/DB **health** indicator (dots fed by `GET /healthz`).

### New Run (`/runs/new`)
Pre-game confirm. **"Tutorial überspringen" toggle is disabled ("bald" / coming
soon).** "Los geht's" calls `createRun()` then routes to the Game screen.

### Game (`/runs/:runId`) — the core loop
- **Header**: turn counter, exit button, menu button.
- **Stat row**: 4 main stat bars (Moneten/Aura/Respekt/Rizz) + a **Chaos bar**
  (±100, center line, danger glow at |chaos| ≥ 85). Deltas animate on each turn.
- **Card arena**: central card with a 2-deep peek stack behind it; 2–3
  **option gutters** (left/right/down) showing each choice's text + stat hints,
  lighting up as you swipe toward them.
- **Swipe** via pointer drag (`useCardSwipe`): left = choice 0, right = choice 1,
  down = choice 2 when present; asymmetric resistance; gutter tap is an
  alternative to swiping. Framer Motion handles mount spring + flyoff.
- **Chaos ambient** (`useChaosAmbient`): at Chaos ≥ 50 a "this is fine" GIF
  fades in with a darkening gradient.
- **Modals**: exit confirm, menu (history / abandon / close), and **History**
  (timeline of past turns with deltas; admin-only flag/ending detail).
- On a run going non-active, an ending overlay appears and routes to End screen.

### Run List (`/runs`)
All runs newest-first, staggered in. Each: status dot (active/ended/abandoned),
title (`Lauf <last-4-of-id>`), turn count + dominant stat, History button,
Delete (with confirm). Empty state + fixed "Neue Runde" CTA.

### End Screen (`/runs/:runId/end`)
Animated ending banner (or "Aufgegeben"), flavor text, 5-stat final grid, turns
survived + cards played. Actions: Neue Runde, Verlauf, **Teilen** (copies a
formatted summary to clipboard), back to overview.

---

## 5. Admin authoring tool (`/admin/*`)

Token-gated, lazy-loaded. `AdminLayout` provides a header (Back to Game, nav
tabs Decks/Endings, Reload, Logout).

- **Decks index** (`/admin`): deck cards with counts, enabled/disabled split,
  3-choice/questline indicators, category distribution, health (errors/
  warnings), a recently-edited rail, import/export bar, deck bulk-toggle.
- **Deck detail** (`/admin/decks/:name`): cards in a deck with toggle, category,
  weight, important flag, per-card validation; duplicate/delete; deck
  import/export; add card pre-filled with the deck name.
- **Card editor** (`/admin/cards/:id|new`): metadata, **choices editor**
  (effects/hints/flag sets+clears/deck additions/ending triggers), requirements
  editor (flags_all/none/any + stat ranges), validation panel, flag inspector,
  referrers panel. Optimistic save with rollback; dirty-state nav guard.
- **Endings index + editor**: same shape as cards — metadata, priority,
  default/enabled, requirements, validation, reference count.
- **Graph view** (`/admin/graph`): ReactFlow node graph of card→card links via
  deck additions. **WIP**; node positions persist to localStorage.

Admin client behavior (`src/api/admin.ts`): reads the bearer token from
localStorage, attaches `Authorization: Bearer <token>`, and on any **401**
calls `useAdminStore.disable()` so the UI flips back to non-admin and re-prompts.

---

## 6. Client state (Zustand, `src/stores/`)

| Store | Holds | Key actions |
|---|---|---|
| `runStore` | `state` (GameState), `currentCard`, `lastDeltas`, loading/submitting/error | `loadRun`, `createRun`, `submitChoice`, `abandonRun`, `exitRun`, `clearDeltas` |
| `catalogStore` | public catalog bundle (decks/cards/endings/achievements), 5-min TTL + sessionStorage cache | `ensureLoaded(force)`, `invalidate` |
| `adminStore` | `isAdmin`, `validating`; token in localStorage (`fatchad_admin_token`) | `enable(token)`, `disable`, `validateOnBoot` |
| `userStore` | `userId` in localStorage | placeholder until real accounts |
| `toastStore` | toast queue | `push(msg, variant, ms)` |
| `admin/store.ts`, `admin/endingStore.ts` | server-synced card/ending catalogues with optimistic CRUD, import/export | — |

---

## 7. API surface & frontend↔backend wiring

### Base URL resolution
- **Gameplay** (`src/api/client.ts`): `BASE = VITE_API_BASE_URL ?? '/api'`.
  In dev, Vite proxies `/api/*` → `http://127.0.0.1:8000` and strips the `/api`
  prefix (`vite.config.ts`). In CI/prod, `VITE_API_BASE_URL` points at the
  deployed HTTP API.
- **Admin** (`src/api/admin.ts`): `BASE = VITE_ADMIN_API_BASE_URL ?? '/api/admin'`
  — kept separate so admin traffic can route through a different host.
- **WIP mode**: when `VITE_WIP_MODE === 'true'` (S3 preview deploys with no
  backend), every gameplay call short-circuits before the network and shows a
  throttled "Backend nicht verfügbar" toast.
- **Auth seam**: every single-run gameplay endpoint takes `user_id` explicitly
  as a query param. The backend does **not** derive identity from a session yet
  — this is the deliberate seam for the upcoming Cognito migration, after which
  `user_id` becomes "derive from token" inside `request()`.

### Gameplay endpoints (public, no auth)

| Frontend fn (`client.ts`) | Method + path | Used by |
|---|---|---|
| `getHealth()` | `GET /healthz` | About screen, offline pill |
| `getCurrentCatalog()` | `GET /catalog/current` | `catalogStore.ensureLoaded` |
| `createRun(user_id)` | `POST /runs` `{user_id}` | NewRun |
| `listRuns(user_id)` | `GET /runs?user_id=` | RunList |
| `getRun(runId, user_id)` | `GET /runs/:id?user_id=` | runStore.loadRun |
| `abandonRun(runId, user_id)` | `POST /runs/:id/abandon?user_id=` | Game menu |
| `deleteRun(runId, user_id, force?)` | `DELETE /runs/:id?user_id=[&force=true]` | RunList |
| `getCurrentCard(runId, user_id)` | `GET /runs/:id/card?user_id=` | runStore.loadRun |
| `submitChoice(runId, user_id, choice_index, expected_turn?)` | `POST /runs/:id/choice?user_id=` `{choice_index, expected_turn}` | Game swipe |
| `getEndSummary(runId, user_id)` | `GET /runs/:id/summary?user_id=` | EndScreen |
| `getHistory(runId, user_id)` | `GET /runs/:id/history?user_id=` | HistoryModal |

Notes: `POST /choice` returns `{state, next_card}` and sends `expected_turn` for
optimistic-locking (409 on stale turn). `GET /summary` is only valid once a run
is inactive. 204 responses (delete) resolve to `undefined`.

### Admin endpoints (bearer token: `Authorization: Bearer <ADMIN_TOKEN>`)

| Frontend fn (`admin.ts`) | Method + path |
|---|---|
| `adminPing()` | `GET /admin/auth/ping` |
| `listCards({category,limit,skip})` | `GET /admin/cards` |
| `getCard(id)` | `GET /admin/cards/:id` |
| `createCard(card)` | `POST /admin/cards` |
| `replaceCard(id, card)` | `PUT /admin/cards/:id` |
| `patchCard(id, payload)` | `PATCH /admin/cards/:id` |
| `deleteCard(id)` | `DELETE /admin/cards/:id` |
| `toggleDeck(deckName, enabled)` | `POST /admin/cards/decks/:name/toggle` (`__orphans__` targets deckless cards) |
| `listEndings({limit,skip})` | `GET /admin/endings` |
| `getEnding(id)` | `GET /admin/endings/:id` |
| `createEnding(e)` | `POST /admin/endings` |
| `replaceEnding(id, e)` | `PUT /admin/endings/:id` |
| `patchEnding(id, payload)` | `PATCH /admin/endings/:id` |
| `deleteEnding(id)` | `DELETE /admin/endings/:id` |

Backend also exposes `POST /admin/publish` and `GET /admin/publish/current`
(snapshot working catalog → versioned S3 bundle). **The frontend has no Publish
UI wired yet** — this is a gap (see §8).

### Key payload shapes (frontend mirrors backend Pydantic)

- **CardResponse** (player-facing, stripped of weight/requires): `{id, title,
  description, category, deck_name, choices:[{text, hints:{stat:up|down|unknown|
  hidden}}], image_url}`.
- **GameState**: `{id, user_id, deck:[cardId], scheduled, active_endings, stats,
  flags, history, turn, status:active|ended|abandoned, ending, ...}`.
- **AdminCard** / **AdminEnding** + their `Patch*Payload` types live in
  `src/api/admin.ts:29-138` and mirror the backend schemas verbatim.

---

## 8. Known gaps / what we'd need next

**Stubbed or disabled in the current UI:**
- **Tutorial** skip toggle (disabled, "bald").
- **Graph view** — drafted, incomplete.
- **Categories index** and **Suggestions index** — stub pages, no functionality.
- **Achievements** — present in catalog types and the public bundle, but **no
  player or admin UI** exists.

**Wired in backend but missing in frontend:**
- **Publish flow** — `POST /admin/publish` / `GET /admin/publish/current` have
  no admin UI; catalog versioning can't be driven from the app yet.

**Architectural seams awaiting work (from CLOUD_DESIGN.md migration plan):**
- **Real user accounts / auth** — `userStore` is a localStorage placeholder;
  `user_id` is passed as a plain query param on every call. Cognito JWT is the
  planned replacement; admin bearer token → Cognito `admins` group.
- **Leaderboards** and **user profile page** — designed in the cloud doc, no
  frontend.
- **Run version pinning** (FEATURE_IDEAS.md) — runs resolve against the *live*
  catalog; mid-run publishes can change content. A frontend-visible concern if
  surfaced.

**Player-experience features not yet present** (candidates for design):
- Pre-game deck/difficulty picker (all active decks merge at runtime today).
- Onboarding/tutorial.
- Achievements surface (unlock toasts, profile grid).
- Account/profile, "claim my anonymous runs."

---

## 9. To add — new Admin views

Planned admin surfaces that don't exist yet. Each mirrors the existing
Decks/Endings pattern (index grid + editor, optimistic CRUD, validation panel,
import/export bar) so they slot into `AdminLayout`'s nav and reuse
`src/api/admin.ts` + an admin store.

### Achievements admin
- **Index** (`/admin/achievements`): grid of achievement cards — name,
  description, points, `unlocks_deck`, image, enabled toggle, and a reference/
  trigger count. Filters for unlocked-deck vs cosmetic.
- **Editor** (`/admin/achievements/:id|new`): metadata (id, name, description,
  points, image_url), **unlock criteria** (the same requirements shape as
  cards/endings — flags + stat ranges, and/or run-outcome conditions), and a
  validation panel.
- **Backend status**: achievements already exist in the catalog type and the
  public bundle, but there are **no admin CRUD endpoints yet** — these need to
  be added backend-side (`/admin/achievements`, mirroring cards/endings) before
  this UI can be wired. Flag as a backend dependency.

### Categories admin
- **Index** (`/admin/categories`): replaces today's stub. Lists every category
  with card count, deck spread, and health (errors/warnings). Inline rename +
  merge (re-tag all cards from category A → B), create/delete.
- **Editor / metadata**: optional per-category metadata (display label, color,
  icon, description) if we promote categories from bare strings to first-class
  records. Decide whether categories stay derived-from-cards or become their own
  catalog entity — that choice drives whether this needs new backend endpoints.

### Users / User-Runs admin
- **Users index** (`/admin/users`): list/search players by `user_id` (later:
  display name once Cognito lands) — run counts, last-active, total turns,
  achievement points. Read-only first.
- **User detail / runs** (`/admin/users/:userId`): that user's runs reusing the
  player `RunSummary` shape — status, turn, stats, ending, timestamps. Drill
  into a run to view its full `GameState` + history (the admin-gated flag/ending
  detail already shown in `HistoryModal`). Admin actions: force-abandon, delete,
  inspect flags/active_endings.
- **Backend status**: gameplay run endpoints exist but are **per-`user_id`,
  unauthenticated, and have no "list all users / list any user's runs" admin
  route**. Needs new admin endpoints + ties into the Cognito auth migration
  (identity, `admins` group gating). Largest backend dependency of the three.

> Ordering note: Categories is mostly frontend (data is derivable from cards
> today). Achievements needs backend CRUD. Users/User-Runs needs both new admin
> endpoints and the auth migration — schedule it after Cognito.

---

## 10. Colour & design scheme — "memey · internety · glitchy"

The existing tokens (`src/styles/tokens.css`) already lean this way: near-black
background, hot-pink neon accent, Anton display type, scanline + glitch-shake
keyframes. This section codifies and pushes that direction so new screens
(including the admin views above) stay on-brand.

### Mood
Late-night terminal energy crossed with shitpost/meme aesthetics. Dark, loud,
slightly broken-on-purpose. Neon-on-black, chromatic-aberration glitches, CRT
scanlines, oversized condensed caps, deadpan German microcopy. Chaos is a first-
class visual driver — the whole page warms/cools and starts to *break up* as
Chaos climbs.

### Palette (from real tokens — reuse these vars, don't hardcode)
| Role | Token | Hex |
|---|---|---|
| Base bg | `--color-bg-base` | `#0a0a0f` |
| Elevated / overlay | `--color-bg-elevated` / `--color-bg-overlay` | `#16161e` / `#1f1f2a` |
| Text / dim / faint | `--color-text` / `-dim` / `-faint` | `#f5f5fa` / `#8888a0` / `#4a4a5a` |
| **Accent (hot pink)** | `--color-accent` (+ `-glow`, `-soft`) | `#ff3e7f` |
| Danger / warning / success | `--color-danger` / `-warning` / `-success` | `#ff4444` / `#f0b020` / `#4ade80` |
| Stat Moneten | `--color-stat-moneten` | `#f0c040` (gold) |
| Stat Aura | `--color-stat-aura` | `#c060f0` (purple) |
| Stat Respekt | `--color-stat-respekt` | `#f06060` (red) |
| Stat Rizz | `--color-stat-rizz` | `#60d0f0` (cyan) |
| Stat Chaos hi/lo | `--color-stat-chaos` / `-chaos-low` | `#ff6020` / `#6080ff` |

The five stat colours double as the **secondary palette** — use them for
category chips, charts, and accents so the admin views feel native. Hot pink
stays the single "interactive/primary" accent; don't dilute it.

### Type
- **Display**: `--font-display` = **Anton** (single-weight condensed caps),
  uppercase, tight `--lh-display: 0.95`, `--tracking-display`. Big and shouty —
  headers, ending banners, the logo.
- **Body / UI**: `--font-body` = **Inter**.
- **Add a mono** for the internety/terminal flavor (admin tables, ids, flags,
  JSON import/export, `user_id`s): JetBrains Mono / IBM Plex Mono. New token
  suggestion: `--font-mono`.

### Glitch / meme texture (already partly built)
- `glitch-shake` keyframe + `body.chaosExtreme` **scanline** overlay exist in
  `globals.css`. Lean in: add a **chromatic-aberration** variant (offset
  pink/cyan text shadows) for hover/active and chaos-extreme states.
- Chaos ambient: `--chaos` (0..1) and `--chaos-signed` (−1..1) are live CSS
  vars driving the body hue (`useChaosAmbient`). Reuse them for any new
  chaos-reactive visuals.
- Meme layer: the "this is fine" GIF at Chaos ≥ 50 sets the tone — reaction
  imagery, deep-fried/emoji accents, and intentionally janky transitions are
  on-brand. Keep it tasteful enough to stay readable.

### Surfaces & motion
- Cards/panels: elevated dark fills, `--radius-lg/xl`, `--shadow-card` +
  `--shadow-glow` (pink) on focus/hover.
- Borders: thin neon hairlines (`--border-accent`) for active/selected.
- Motion: snappy `--ease-snap` for interactions, `--ease-out` for entrances;
  staggered list entrances (already used in RunList/EndScreen).

### Admin-view styling guidance
Admin should feel like the **"backstage terminal"** of the same world — same
dark base + pink accent, but more **mono type, denser grids, data-table
rows, monospace ids/flags, and JSON-ish import/export panels**. Glitch effects
dialed *down* vs gameplay (it's a tool), but the scanline/CRT texture and the
stat-colour chips keep it unmistakably FATCHAD.

---

## 11. Environment variables

| Var | Purpose | Dev default |
|---|---|---|
| `VITE_API_BASE_URL` | gameplay API base | unset → `/api` (proxied to :8000) |
| `VITE_ADMIN_API_BASE_URL` | admin API base | unset → `/api/admin` |
| `VITE_WIP_MODE` | short-circuit API for backend-less preview | unset/false |

(Note: `frontend/.env` currently only contains `VITE_API_URL=http://localhost:8000`,
which is **not** read by the client — the client uses `VITE_API_BASE_URL` and
falls back to the Vite proxy. Worth reconciling.)
