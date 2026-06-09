# FATCHAD Frontend — UI Overview

A Reigns-style swipe game with a separate content-management admin surface.

## Stack & Shell

- **Stack**: React 19 + TypeScript + Vite, `react-router-dom` 6, zustand stores, framer-motion v12. Auth is Cognito-backed.
- **Shell** (`src/App.tsx`): wraps everything in a `<CRTEffect>` (`vault66-crt-effect`) scanline/sweep/glow chrome whose sub-effects are driven by `settingsStore`; inside it renders a conditional `WipBanner`, the route `<Outlet />` (animated via `AnimatePresence` page transitions — fade + directional drift, opacity-only exit, reduced-motion aware), and a global `ToastViewport`.
- **Audio** (`src/audio/`): two dependency-free `HTMLAudioElement` singletons — `sfx.ts` (one-shot `click`/`swipe`/`error`/`gameOver`; `click` wired app-wide via a capture-phase delegated listener) and `music.ts` (looping soundtrack, starts on login + first-gesture fallback). Both read mute/volume live from `settingsStore`.
- **Routing** (`src/routes.tsx`): three tiers — public routes, auth-gated game routes (`RequireAuth`), and admin routes (`RequireAdmin`, lazy-loaded as a single chunk).

## Auth & Access Model

- **`RequireAuth`** (`src/components/RequireAuth.tsx`): waits out `initializing`, redirects to `/welcome` if no `userId`. Gates the whole game surface.
- **`RequireAdmin`** (`src/components/RequireAdmin.tsx`): redirects to `/login` if signed out, `/` if not admin. Gates `/admin/*`.
- **User tiers**:
  - *Guest* — throwaway Cognito account (`isGuest=true`); can play & save runs but has no email/display name.
  - *Registered* — email + display name.
  - *Admin* — Cognito `admin` group.
- **Upgrade path**: guests can register; `claimGuestData()` migrates their old runs into the new account.

## Routes

| Path | Page | Access |
| --- | --- | --- |
| `/welcome` | Welcome | public |
| `/about` | About | public |
| `/leaderboard` | Leaderboard | public |
| `/login` | Login | public |
| `/register` | Register | public |
| `/forgot-password` | ForgotPassword | public |
| `/` (index) | Title | auth |
| `/profile` | Profile | auth |
| `/settings` | *retired* — redirects to `/` | auth |
| `/achievements` | Achievements | auth |
| `/runs` | RunList | auth |
| `/runs/new` | NewRun | auth |
| `/runs/:runId` | Game | auth |
| `/runs/:runId/end` | EndScreen | auth |
| `/admin/*` | Admin surface | admin |

## Player-Facing Pages

### Entry / account
- **Welcome** — gate for signed-out users: Login / Register / Play-as-guest, plus links to Leaderboard & About.
- **Title** — main menu (the auth-gated landing). New Run, Continue (if runs exist), Leaderboard, plus Profile/Achievements; guest-upgrade banner, admin link, logout, server-health pill, and a floating **settings cog** (`SettingsRadial`) holding all client prefs (motion/glitch, mute + SFX/music volume, CRT sub-effects) — this replaced the old Settings page.
- **Login / Register / ForgotPassword** — Login is email+password; Register is a 3-step flow (credentials → email confirm → claim guest progress); ForgotPassword is 2-step (email → reset code + new password).

### Info / social
- **About** — game blurb, the 4-stat + chaos legend, credits, live backend/DB health.
- **Leaderboard** (public) — toggles between career "Erfolgs-Punkte" and "Beste Runs"; signed-in users get a "only mine" filter; top-3 highlighted.
- **Profile** — identity + aggregate counts (runs by status, achievements, points), plus the account-management sections that used to live on the Settings page: **change password** (non-guests) and a **danger zone** (delete all runs).
- **Settings** — *retired*. Display/audio prefs now live in the `SettingsRadial` cog on the Title screen; the `/settings` route redirects to `/`.
- **Achievements** — gallery merging catalog + unlocks; earned float to top, locked show hints.

### Game loop
- **RunList** — saved runs newest-first with status/turn/dominant-stat; resume, delete, or peek history.
- **NewRun** — deck picker (modal grid, min 2 decks) + "skip tutorial" toggle, then creates a run.
- **Game** — the core: turn counter, `StatRow` HUD (4 stats + chaos), swipeable `Card` with 2–3 choices, left/right/down `OptionGutter`s, `ScreenGlow` reacting to swipe intent + chaos. Loop: swipe → `submitChoice(index)` → stat deltas animate → next card prefetched → on non-active status, routes to the end screen after ~1.4s.
- **EndScreen** — ending banner, newly-unlocked achievements, final stats, actions (New Run, Publish to Leaderboard, View History, Share). If the 5-run leaderboard is full, a replace-picker modal prompts which run to drop.
- **RouteError** — 404/500 fallback with stat-flavored quips.

## Player Modals

1. **`Modal`** (generic confirm, `src/components/Modal/Modal.tsx`) — used for: Profile "delete all runs", Game "exit run" + "menu", RunList "delete run", EndScreen "replace run on leaderboard". Backdrop/Escape close, spring animation.
2. **`HistoryModal`** — accordion timeline of past turns (card, choice, stat deltas; admin-only flag/ending detail). Opened from Game, RunList, and EndScreen.
3. **NewRun deck picker** — inline modal grid of toggleable deck tiles.

## Shared Components (`src/components/`)

- **Header** — 3-slot layout (left/center/right) + `IconButton`, `BackArrow`, `MenuDots`. Used across most pages.
- **Toast/ToastViewport** — global notification queue, reads `toastStore`.
- **OptionGutter** — left/right/down choice button (arrow + text + `HintList`); highlights on matching swipe intent.
- **ScreenGlow** — fullscreen X-pattern glow driven by chaos + swipe intent.
- **StatRow / StatBar / ChaosBar / StatIcon** — game HUD: 4 main stats (0–100) + symmetric chaos bar (−100…+100).
- **Card / CardArt** — swipeable card (motion-value transforms) with deterministic gradient art + optional image overlay.
- **HintIcon / HintList** — per-stat hint glyphs for a choice.
- **Modal / HistoryModal** — see Player Modals above.
- **WipBanner** — frontend-only WIP banner (shown when `VITE_WIP_MODE=true`).
- **SettingsRadial** — floating cog on the Title screen opening a radial menu of client prefs (motion/glitch, mute + SFX/music sliders, CRT sub-effects); writes `settingsStore`.
- **RequireAuth / RequireAdmin** — route guards.

## Stores (`src/stores/`)

- **authStore** — Cognito session (userId, token, isAdmin, isGuest, displayName, email) + all auth actions; restored from localStorage on boot.
- **runStore** — active game state, current/next card, recent stat deltas; `submitChoice`, `abandonRun`, `exitRun`.
- **toastStore** — global notification queue (info/warning/error, auto-dismiss).
- **settingsStore** — client prefs persisted to localStorage: `reducedMotion` / `disableGlitch` (applied as `<html>` attributes that CSS keys off, e.g. the `data-no-glitch` gate), audio `muted` / `volume` (SFX) / `musicVolume`, and the CRT sub-effect toggles (`crtScanlines`, `crtScanlineOpacity`, `crtSweep`, `crtGlow`). Edited via the `SettingsRadial` cog; consumed by `App.tsx` (CRT) and `src/audio/`.

## Admin Surface (`/admin/*`, lazy-loaded)

**Shell** (`src/admin/AdminLayout.tsx` + `AdminSidebar`): loads all catalogs on mount; sidebar groups **Katalog** (Decks, Cards, Endings, Achievements, Graph — each with counts) and **Debug** (Users, Run-Inspektor); `PublishPanel` pinned at the bottom.

### Content management (Index + Editor per entity)
- **Decks** — DecksIndex (surfaces "shadow decks" referenced but unrecorded), DeckDetail (cards in deck, bulk enable, quick-add), DeckEditor (unlock rule, starting card, removes-endings).
- **Cards** — CardsIndex (filter by category/deck, validation status), CardEditor (full card: requirements, `ChoicesEditor` for 2–3 choices, image, references scan).
- **Endings** — EndingsIndex, EndingEditor (priority, flag + stat-range requirements, default/quest).
- **Achievements** — AchievementsIndex, AchievementEditor (points, `PredicateBuilder` for criteria, unlocks-deck, hidden/hint, image_url).
- **CategoriesIndex / SuggestionsIndex** — read-only stubs for future CRUD / moderation.

### Tools
- **GraphView** — `@xyflow/react` (v12) visualization of card flow grouped into per-deck swimlanes; nodes show flag requirements/mutations/triggered endings; flag overlay, neighbor highlighting, drag-persisted positions; `FlagInspector` modal.
- **RunInspector / UsersIndex / UserDetail** — read-only debugging: find a player → inspect a run's full turn-by-turn stat trail.
- **PublishPanel** — snapshots the current catalog state to a new live version (no draft layer — edits are live in the store; publish takes the as-is snapshot).
- **ValidationPanel** — per-entity errors (block save) / warnings, with field paths.
- **ImportExportBar / EndingsImportExportBar** — JSON import/export with conflict resolution (replace/keep/skip).

### Admin modals/dialogs
- **`QuickAddDialog`** — rapid card create within a deck.
- **`FlagInspector`** — flag reference browser (which cards require/set/clear a flag).
- Import-conflict and publish-confirm dialogs.
- `CardPicker` and `TagInput` are inline autocompletes, **not** modals.

## Domain Model

- **Card** → belongs to a **Deck** (`deck_name`); has 2–3 **Choices**.
- **Choice** → stat effects (moneten/aura/respekt/rizz/chaos), hints, flag set/clear, deck additions, and ending triggers/unlocks/removes.
- **Deck** → unlock rule (default or achievement-gated), optional starting card, can remove endings.
- **Ending** → flag + stat-range requirements, priority, default vs. quest.
- **Achievement** → predicate criteria, optional points, can unlock a deck.
- **Flags** → free-string run state (no catalog table), validated against what cards set/clear/require.
- **Stats** → moneten, aura, respekt, rizz (0–100) + chaos (−100…+100, ±100 ends the run).

## How It Connects

Welcome → (auth) → **Title** is the hub. From Title: NewRun → Game → EndScreen → back to NewRun/RunList, with Leaderboard/Profile/Achievements as side branches (and the `SettingsRadial` cog for prefs). Admins jump from Title into the `/admin` catalog tools, which author the Cards/Decks/Endings/Achievements that the game loop then serves. The `runStore` drives gameplay, `authStore` gates everything, and `settingsStore` controls the glitch/motion aesthetic globally.
