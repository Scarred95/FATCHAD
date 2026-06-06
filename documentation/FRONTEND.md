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
- **Achievement** — unlocked by meeting criteria during/after a run. Has a player
  surface (`/achievements`, end-screen unlock banners) and a full admin CRUD
  surface (`/admin/achievements`).

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

All routes nest under `App.tsx`. **Public** routes need no login; the
**authenticated** group is wrapped in `<RequireAuth>` (redirects to `/welcome`
when signed out — so the gate, not the Title, is the true first screen).

Public (eager-loaded):

| Path | Screen | File |
|---|---|---|
| `/welcome` | Auth gate / landing | `src/pages/Welcome.tsx` |
| `/about` | About | `src/pages/About.tsx` |
| `/login` | Sign in | `src/pages/Login.tsx` |
| `/register` | Sign up | `src/pages/Register.tsx` |
| `/forgot-password` | Password reset | `src/pages/ForgotPassword.tsx` |

Authenticated (`<RequireAuth>`):

| Path | Screen | File |
|---|---|---|
| `/` | Title | `src/pages/Title.tsx` |
| `/profile` | Profile | `src/pages/Profile.tsx` |
| `/settings` | Settings | `src/pages/Settings.tsx` |
| `/achievements` | Achievements grid | `src/pages/Achievements.tsx` |
| `/runs` | Run list | `src/pages/RunList.tsx` |
| `/runs/new` | New run setup | `src/pages/NewRun.tsx` |
| `/runs/:runId` | Game (main loop) | `src/pages/Game.tsx` |
| `/runs/:runId/end` | End screen | `src/pages/EndScreen.tsx` |

Admin surface — **lazy-loaded** (keeps reactflow/zod/jszip out of the gameplay
bundle), gated by `<RequireAdmin>` (Cognito `admin` group):

| Path | Screen |
|---|---|
| `/admin` | Decks index |
| `/admin/decks/:name` | Deck detail |
| `/admin/decks-edit/new`, `/admin/decks-edit/:name` | Deck editor |
| `/admin/cards`, `/admin/cards/new`, `/admin/cards/:id` | Cards index + editor |
| `/admin/achievements`, `/admin/achievements/new`, `/admin/achievements/:id` | Achievements index + editor |
| `/admin/endings`, `/admin/endings/new`, `/admin/endings/:id` | Endings index + editor |
| `/admin/runs`, `/admin/runs/:userId/:runId` | Run inspector |
| `/admin/users`, `/admin/users/:userId` | Users index + detail |
| `/admin/graph` | Graph view (WIP) |

Two routes still resolve to stub pages: `CategoriesIndex` and `SuggestionsIndex`
exist in `src/admin/pages/` but are not wired into the router nav.

---

## 4. Player-facing screens & features

### Title (`/`)
First screen *after* the auth gate. Glitch-animated FATCHAD logo + tagline.
Buttons: **Neue Runde** → `/runs/new`; **Fortsetzen** → `/runs` (disabled if no
runs); **Über FATCHAD** → `/about`. Admin users get an entry into `/admin`.
Offline status pill when the server is unreachable.

### About (`/about`)
Static explainer: concept, stat meanings (Chaos ±100 = victory), credits, and a
live server/DB **health** indicator (dots fed by `GET /healthz`).

### New Run (`/runs/new`)
Pre-game setup. A working **"Tutorial überspringen" toggle** (sends
`tutorial: !skipTutorial`) and a **"Decks wählen" picker** (fed by `listDecks()`,
sends `deck_ids`; empty selection → backend default decks). "Los geht's" calls
`createRun({ tutorial, deck_ids })` then routes to the Game screen.

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

Cognito-`admin`-gated, lazy-loaded. `AdminLayout` + `AdminSidebar` provide nav
across Decks/Cards/Achievements/Endings/Runs/Users plus a `PublishPanel`.

- **Decks index** (`/admin`): deck cards with counts, enabled/disabled split,
  3-choice/questline indicators, category distribution, health (errors/
  warnings), a recently-edited rail, import/export bar, deck bulk-toggle.
- **Deck detail** (`/admin/decks/:name`): cards in a deck with toggle, category,
  weight, important flag, per-card validation; duplicate/delete; deck
  import/export; add card pre-filled with the deck name.
- **Deck editor** (`/admin/decks-edit/:name|new`): deck metadata — description,
  enabled, unlock rule, `removes_endings`, and `starting_card_id` (autocomplete
  card picker that scripts the deck's opener).
- **Cards index** (`/admin/cards`): catalog-wide card grid with filtering.
- **Card editor** (`/admin/cards/:id|new`): metadata, **choices editor**
  (effects/hints/flag sets+clears/deck additions/ending triggers +
  unlocks/removes_endings), requirements editor (flags_all/none/any + stat
  ranges), validation panel, flag inspector, referrers panel. Optimistic save
  with rollback; dirty-state nav guard.
- **Achievements index + editor** (`/admin/achievements`): grid of achievement
  tiles + a full editor (name, description, points, `unlocks_deck`, image, hint,
  hidden, and a criteria/predicate builder). Backed by the `/admin/achievements`
  CRUD endpoints.
- **Endings index + editor**: same shape as cards — metadata, priority,
  default/enabled, requirements, validation, reference count.
- **Run inspector** (`/admin/runs`, `/admin/runs/:userId/:runId`): read-only
  view of any run's full `GameState` + per-turn stat trail + `newly_unlocked`,
  with a player/run picker. Read-only — no run mutation.
- **Users index + detail** (`/admin/users`, `/admin/users/:userId`): player
  directory (from the `USERS#all` partition, guests excluded) and an aggregate
  user view — profile totals, current points, every run, earned achievements.
- **Publish panel** (`PublishPanel`): shows the live `CatalogPointer` and
  snapshots the working catalog to a new versioned S3 bundle via
  `POST /admin/publish`.
- **Graph view** (`/admin/graph`): ReactFlow node graph of card→card links via
  deck additions. **WIP**; node positions persist to localStorage.

Admin client behavior (`src/api/admin.ts`): attaches the Cognito access token as
`Authorization: Bearer <jwt>` on every call; on a **401** (token missing/expired)
it calls `useAuthStore.logout()` so the guard bounces the user to `/login`. A
**403** means a valid token whose user isn't in the `admin` group.

---

## 6. Client state (Zustand, `src/stores/`)

| Store | Holds | Key actions |
|---|---|---|
| `authStore` | Cognito session — `userId` (`sub`), `accessToken`, `isAdmin` (`admin` group) | `login`, `register`, `logout`, `initFromSession`, `getAccessToken` |
| `runStore` | `state` (GameState), `currentCard`, `lastDeltas`, loading/submitting/error | `loadRun`, `createRun`, `submitChoice`, `abandonRun`, `exitRun`, `clearDeltas` |
| `catalogStore` | public catalog bundle (decks/cards/endings/achievements), TTL + sessionStorage cache | `ensureLoaded(force)`, `invalidate` |
| `settingsStore` | client UI prefs | — |
| `toastStore` | toast queue | `push(msg, variant, ms)` |
| `admin/store.ts`, `admin/endingStore.ts`, `admin/deckStore.ts`, `admin/achievementStore.ts` | server-synced card/ending/deck/achievement catalogues with optimistic CRUD, import/export | — |

`authStore` replaces the old `userStore` (random localStorage id) and
`adminStore` (hardcoded token) — identity now comes from Cognito.

---

## 7. API surface & frontend↔backend wiring

This section maps **frontend helper → endpoint**. For request/response **shapes**
and status codes, see [backend_documentation/API.md](backend_documentation/API.md)
(the canonical contract). For *which layers to edit* when changing an endpoint,
see [API_CONTRACT.md](API_CONTRACT.md).

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
- **Auth**: identity travels in the **Cognito JWT**, never the URL. `request()`
  attaches `Authorization: Bearer <accessToken>` (from `authStore`) on every
  call, and the backend derives `user_id` from the token's `sub` claim. **No
  gameplay endpoint takes `user_id`.**

### Gameplay endpoints (Cognito JWT)

| Frontend fn (`client.ts`) | Method + path | Used by |
|---|---|---|
| `getHealth()` | `GET /healthz` | About screen, offline pill |
| `getCurrentCatalog()` | `GET /catalog/current` | `catalogStore.ensureLoaded` |
| `createGuestSession()` | `POST /guest` | guest entry |
| `claimGuestAccount(token)` | `POST /account/claim` | claim-progress flow |
| `listDecks()` | `GET /decks` | NewRun deck picker |
| `listAchievements()` | `GET /achievements` | Achievements page |
| `listUnlockedAchievements()` | `GET /achievements/unlocked` | Achievements page |
| `createRun({tutorial, deck_ids})` | `POST /runs` | NewRun |
| `listRuns()` | `GET /runs` | RunList |
| `getRun(runId)` | `GET /runs/:id` | runStore.loadRun |
| `abandonRun(runId)` | `POST /runs/:id/abandon` | Game menu |
| `deleteRun(runId, force?)` | `DELETE /runs/:id[?force=true]` | RunList |
| `getCurrentCard(runId)` | `GET /runs/:id/card` | runStore.loadRun |
| `submitChoice(runId, choice_index, expected_turn?)` | `POST /runs/:id/choice` `{choice_index, expected_turn}` | Game swipe |
| `getEndSummary(runId)` | `GET /runs/:id/summary` | EndScreen |
| `getHistory(runId)` | `GET /runs/:id/history` | HistoryModal |

Frontend-specific notes: `submitChoice` sends `expected_turn` for
optimistic-locking; 204 responses (delete) resolve to `undefined` in `http()`.
For the full per-endpoint semantics (status codes, 409 cases) see API.md.

### Admin endpoints (Cognito `admin` group; `Authorization: Bearer <jwt>`)

| Frontend fn (`admin.ts`) | Method + path |
|---|---|
| `adminPing()` | `GET /admin/auth/ping` |
| `listCards` / `getCard` / `createCard` / `replaceCard` / `patchCard` / `deleteCard` | `GET/POST/PUT/PATCH/DELETE /admin/cards[/:id]` |
| `toggleDeck(deckName, enabled)` | `POST /admin/cards/decks/:name/toggle` (`__orphans__` targets deckless cards) |
| `listDecks` / `getDeck` / `createDeck` / `replaceDeck` / `patchDeck` / `deleteDeck` | `GET/POST/PUT/PATCH/DELETE /admin/decks[/:name]` |
| `listEndings` / `getEnding` / `createEnding` / `replaceEnding` / `patchEnding` / `deleteEnding` | `GET/POST/PUT/PATCH/DELETE /admin/endings[/:id]` |
| `listAchievements` / `getAchievement` / `createAchievement` / `replaceAchievement` / `patchAchievement` / `deleteAchievement` | `GET/POST/PUT/PATCH/DELETE /admin/achievements[/:id]` |
| `listPlayers()` | `GET /admin/users` |
| `getUserDetail(userId)` | `GET /admin/users/:userId` |
| `listUserRuns(userId)` | `GET /admin/runs/:userId` |
| `getRunHistory(userId, runId)` | `GET /admin/runs/:userId/:runId/history` |
| `getCurrentPointer()` | `GET /admin/publish/current` |
| `publishCatalog(version?)` | `POST /admin/publish` |

The publish flow **is** wired — `PublishPanel` drives `getCurrentPointer()` /
`publishCatalog()`.

### Where the TypeScript types live

Payload shapes are **not** restated here — see [API.md](backend_documentation/API.md)
for the wire shapes. On the frontend they live in:
- Player/gameplay types (`CardResponse`, `GameState`, `RunSummary`, …) →
  `src/api/types.ts`.
- Admin domain types (`Card`, `Ending`, `Deck`, `Achievement`) →
  `src/admin/types.ts`; HTTP-layer request/response + `Patch*Payload` (incl.
  `AdminRunView`, `UserDetail`, `CatalogPointer`) → `src/api/admin.ts`.

These mirror the backend Pydantic models in `backend/shared/schemas.py` — change
both sides or the field silently drops on the wire.

---

## 8. Known gaps / what we'd need next

**Built since this doc's first draft** (no longer gaps): Cognito auth + login/
register/forgot-password screens, guest sessions + "claim my runs", the New Run
tutorial toggle + deck picker, the player Achievements surface, the admin
Achievements / Users / Run-inspector views, and the Publish panel.

**Stubbed or incomplete in the current UI:**
- **Graph view** (`/admin/graph`) — drafted, incomplete.
- **Categories index** and **Suggestions index** — stub pages
  (`src/admin/pages/CategoriesIndex.tsx`, `SuggestionsIndex.tsx`), not wired into
  the router nav.

**Architectural seams still open (from [history/CLOUD_DESIGN.md](history/CLOUD_DESIGN.md)):**
- **Leaderboards** — designed in the cloud doc, no frontend yet.
- **Run version pinning** (FEATURE_IDEAS.md) — runs resolve against the *live*
  catalog; mid-run publishes can change content. A frontend-visible concern if
  surfaced.

---

## 9. Admin views — status

The three admin surfaces this section once planned are now **built**:

- **Achievements admin** (`/admin/achievements` + editor) — backed by the
  `/admin/achievements` CRUD endpoints and `achievementStore`.
- **Users / User-Runs admin** (`/admin/users`, `/admin/users/:userId`,
  `/admin/runs/...`) — player directory + aggregate user view + read-only run
  inspector, backed by `/admin/users` and `/admin/runs` endpoints.

Still outstanding:

- **Categories admin** — `CategoriesIndex` is still a stub. Categories remain a
  bare-string taxonomy derived from cards (`src/admin/types.ts`); promoting them
  to first-class records with metadata + a rename/merge tool would need new
  backend endpoints. Lowest priority of the set.

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
| `VITE_COGNITO_USER_POOL_ID` | Cognito user pool (auth) | unset → auth disabled |
| `VITE_COGNITO_APP_CLIENT_ID` | Cognito app client (auth) | unset → auth disabled |
| `VITE_WIP_MODE` | short-circuit API for backend-less preview | unset/false |

The two Cognito vars are read by `authStore`; when either is missing
(`authConfigured === false`) the auth methods reject with a clear error instead
of white-screening the app.

(Note: `frontend/.env` currently only contains `VITE_API_URL=http://localhost:8000`,
which is **not** read by the client — the client uses `VITE_API_BASE_URL` and
falls back to the Vite proxy. Worth reconciling.)
