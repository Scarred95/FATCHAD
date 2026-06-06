# Working conventions — FATCHAD

How this codebase is written, so changes land consistently. These are
**descriptive** (pulled from the existing code), not aspirational — match what's
already here. When in doubt, open a neighbouring module and copy its shape.

---

## Golden rules

1. **Comments explain *why*, never *what*.** The code says what. A comment earns
   its place by capturing a reason, a trade-off, an edge case, or a "don't
   refactor this away" warning. If it just restates the line below it, delete it.
2. **One concern per module.** `shared/game/` is the model: `deck.py` draws,
   `effects.py` orchestrates a turn, `endings.py` decides endings,
   `eligibility.py` / `requirements.py` evaluate predicates. A new concern is a
   new file, not a new branch in an existing one.
3. **One source of truth.** Shared logic lives in exactly one place
   (`requirements.py` is used by *both* card eligibility and ending checks).
   Constants live in `constants.py`. Don't duplicate a rule across two callers.
4. **Mirror backend ↔ frontend or it breaks silently.** Every shared entity is a
   Pydantic model in `backend/shared/schemas.py` **and** a TS type in
   `frontend/src/api/types.ts` / `src/admin/types.ts`. Change both sides.
5. **Scope your change.** Fix the bug; don't tidy the surrounding code, add
   speculative config, or "improve" untouched lines. Minimal, focused diffs.

---

## Python (backend)

### Module layout
- First line is a path comment, then a module docstring stating the module's
  job **and** a design note (why it's shaped this way / what it deliberately
  doesn't do). Example: `"""Turn orchestrator — the single mutation entry point…`
- Group code with section dividers:
  ```python
  # =============================================================================
  # Main entry point
  # =============================================================================
  ```
  Short constant groups use `# ----- Deck sizing -----`.

### Naming
- `snake_case` for functions and variables; `PascalCase` for Pydantic models and
  classes (`GameState`, `UserRepo`, `CatalogSnapshot`).
- **Leading underscore = module-private helper** (`_apply_effects`, `_clone`,
  `_scan_deck`, `_fire`, `_by_id`). Public surface stays unprefixed.
- `UPPER_SNAKE` constants live in `constants.py`, aligned on `=` when grouped
  (`DECK_TARGET_SIZE = 12`). Stat axes come from the single `STAT_NAMES` tuple —
  never hardcode the five stat names in a loop.
- Repos are `<Thing>Repo` (`UserRepo`, `CatalogRepo`); HTTP request/response
  models are descriptive nouns (`CreateRunRequest`, `TurnResponse`, `EndSummary`).

### Functions
- Docstring states intent, then any non-obvious contract or edge case
  ("Raises ValueError if … — a programmer-error contract", "Returns state
  UNCHANGED so it can recover").
- **Purity & isolation:** turn logic deep-copies state (`model_copy(deep=True)`
  via `_clone`) so a failure leaves the original untouched. Mutating helpers
  return the new state rather than mutating an argument in place.
- **Numbered pipeline comments** for ordered steps — match the existing style in
  `apply_choice`: `# 1. Remove the played card …`, `# 2. Stats … 3. Flags.`
- Prefer small composable helpers over long functions; `apply_choice` reads as a
  sequence of named sub-steps, each delegating to `deck.py` / `endings.py`.

### Backend architecture invariants
- **Split Lambdas + `shared/`:** `gameplay_lambda`, `admin_lambda`,
  `cognito_lambda`, `cleanup_lambda` each ship only their handler + `shared/`.
  The IAM boundary is mirrored by an import boundary — gameplay literally cannot
  `import admin_lambda`. Don't reach across surfaces.
- **Dependency injection** via FastAPI `Depends` (`get_catalog`, `get_owned_run`,
  `get_user_repo`, `require_active`, `require_admin`). Routes stay thin; logic
  lives in `shared/`.
- **Identity from the JWT only** — `user_id` comes from `get_current_user_id`
  (`sub` claim), never from the body or query. New routes follow this.
- **Determinism:** randomness is a per-turn seeded `Random(rng_seed + turn)`
  (`turn_rng`), threaded as one stream through every sub-step. Don't introduce
  unseeded `random.*` in gameplay paths.

---

## TypeScript (frontend)

### Module layout
- File-level block comment explaining the module's role and any cross-cutting
  detail (base-URL resolution, auth seam). See `src/api/client.ts`.
- Section dividers: `/* ─── Run lifecycle ─────────────── */`.
- `/** JSDoc */` on exported functions/types; inline `//` for rationale.

### Naming
- `camelCase` for functions/variables; `PascalCase` for types, interfaces, React
  components.
- **Stores are `<thing>Store`** (`authStore`, `runStore`, `catalogStore`,
  `settingsStore`); one Zustand store per concern, in `src/stores/` (player) or
  `src/admin/` (admin).
- **API helpers are `verb + noun`** (`createRun`, `listRuns`, `getRun`,
  `submitChoice`, `abandonRun`). They return typed promises and never call raw
  `fetch` — everything goes through the `request()`/`http()` wrapper.
- TS types mirror the backend names (`CardResponse`, `GameState`, `RunSummary`).

### Patterns
- All gameplay calls go through `client.ts`; all admin calls through `admin.ts`.
  Components/stores call those helpers, not `fetch`.
- Auth token is attached centrally in `request()`; don't thread tokens by hand.
- Admin domain types live in `src/admin/types.ts` (the single source the whole
  admin surface imports); HTTP-only request/response shapes live in `api/admin.ts`.

---

## Language & docs

- **Code, comments, identifiers: English. Player-facing UI strings: German.**
  (Card content and user-visible copy are German; the codebase is English.)
- Docs follow the rules in [README.md](README.md): request/response shapes have
  one home (`backend_documentation/API.md`); other docs link to it rather than
  restating. When you change behaviour, update the doc that owns that fact — and
  prefer fixing the canonical doc over duplicating into a second one.
- Keep docs **accurate over aspirational**: label unbuilt things as planned
  (see the Observability section of DEPLOYMENT.md), and move superseded design
  docs to `history/` rather than leaving stale "current" claims.

---

## Before you finish a change
- Backend: `python3 -m py_compile <files>` (note: `python` isn't on PATH here —
  use `python3`). Frontend: `npx tsc --noEmit`.
- Did you touch a shared entity? Update both the Pydantic model and the TS type.
- Did you add an endpoint? Update `API.md` (shapes) and, if the wiring changed,
  the helper in `client.ts`/`admin.ts`.
- Re-read your diff: every new comment explains a *why*; no unrelated cleanup
  rode along.
