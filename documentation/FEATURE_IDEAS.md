# Feature Ideas

Parking lot for work that is feature-shaped (more than a quick clean-up) and
deferred on purpose. Each entry: what, why, rough scope, and where it touches.

---

## Run version pinning (freeze a run to its starting catalog)

**What:** Stamp each run with the catalog `version` it began on, and have
gameplay resolve cards/endings against *that* published bundle for the run's
whole lifetime — not against whatever is currently live.

**Why:** Today a run stores only card ids (`GameState.deck`) and resolves them
against the live snapshot. If an admin edits/deletes a card or ending mid-run,
in-flight runs silently lose content or hit unsafe id lookups
(`deck.py`, `endings.py`). Freezing a run to its start-version makes a run fully
reproducible and immune to mid-run publishes — the right behaviour for a
roguelike.

**Scope (why it's a feature, not a clean-up):**
- `GameState.catalog_version: str`, set in `new_run`.
- `catalog_snapshot.py`: today caches exactly ONE version (single `_cached`
  slot). Pinning means gameplay may need an *older* bundle, so the cache must
  hold several versions — add a version-addressed `get_snapshot(version)` plus a
  small LRU (cap ~3-5) instead of the single slot.
- Wire the gameplay read path to pass the run's pinned version.

**Decision recorded:** store the `version` string, NOT the S3 URL — the URL is
derivable (`v{version}/catalog_full.json`) and the bucket name can change.

---

## Save-format migrations (`migrate()` for persisted models)

**What:** A real migration step that upgrades old persisted records
(`GameState`, `Profile`, ...) to the current `schema_version` on read.

**Why:** We are adding `schema_version` now (stamped, defaults to current) so the
hook exists. The actual `migrate(raw, from_version) -> raw` logic is deferred
until the first real format change — building it before we have a v1→v2 delta
would be speculative.

**Scope:** a `migrate` function (registry keyed by from-version) invoked in the
repo deserialize path before `model_validate`. No-op passthrough until the first
breaking schema change lands.

---

## Client-safe game state (stop leaking the full GameState)

**What:** Return a trimmed, player-facing view of a run instead of the raw
`GameState`. Strip the anti-cheat-sensitive fields before they reach the wire.

**Why:** `TurnResponse.state`, `GET /runs/{id}`, and every `POST /choice`
response currently ship the entire `GameState` — including `rng_seed`, the full
`deck` order, `scheduled`, `active_endings`, and `flags`. Every engine RNG is
`random.Random(rng_seed + turn)` (`deck.py`, `effects.py`), so a leaked seed
lets a client **predict every future draw, shuffle, and refill**; `deck` and
`active_endings` are direct spoilers. This silently undoes all the field
stripping done in `CardResponse`/`ChoicePreview`.

**Scope (why it's a feature, not a clean-up):**
- A `PublicGameState` projection (stats, turn, status, ending, maybe a flag
  allow-list) + a mapper from `GameState`.
- Swap `response_model` on the run/turn endpoints; decide per-field what the
  client legitimately needs (the SPA currently reads the full object, so this is
  a frontend contract change, not just a backend edit).
- Keep the raw `GameState` server-side only.

**Decision recorded:** deferred but flagged as the highest-priority correctness
item — do this before any public/competitive launch.

---

## ~~Authn/authz on the gameplay surface~~ — DONE

Implemented. `user_id` is derived from the verified Cognito JWT `sub` claim via
`get_current_user_id` (`backend/shared/auth.py`); the `get_owned_run` dependency
(`backend/gameplay_lambda/routes/runs.py`) enforces run ownership; no gameplay
route takes a client-supplied `user_id`. Kept here only as a record that the
once-parked item shipped.

---

## Player redraw-pool / unlocked-deck registry

**What:** A reliable answer to "which decks are in this player's redraw pool?",
plus an optional materialized `Profile.unlocked_decks: list[str]` cache for the
gameplay hot path.

**Why:** The source of truth already exists as per-user items —
`DeckUnlock` (`PK=USER#<uid>`, `SK=UNLOCK#DECK#<name>`, carrying `unlocked_at`
and `via_achievement`), written at profile creation for default decks and when
an `Achievement.unlocks_deck` fires for earned ones. So the pool is already
answerable with one `begins_with(SK, "UNLOCK#DECK#")` query on the user
partition; what's missing is only a single convenient field if run-start can't
afford that extra query.

**Scope (why it's a feature, not a clean-up):**
- Do NOT make a deck-id list the source of truth — a bare `[names]` array drops
  the `unlocked_at` / `via_achievement` provenance and drifts the moment an
  achievement→deck mapping changes in the catalog.
- If (and only if) run-start needs the pool without a second query, add a
  derived `Profile.unlocked_decks: list[str]` cache, written by the same Lambda
  that writes the `UNLOCK#DECK#` items — the exact pattern already used for
  `ProfileTotals` and `current_points`. It **must be rebuildable** from the
  `UNLOCK#DECK#` items so the cache can never become the only copy.
- Keep the three deck tiers in their correct homes:
  - *Always-enabled* decks → global catalog config, never per-player.
  - *Starter-deck* choice → per-run state, not the profile.
  - *Achievement-unlocked* decks → the per-user registry above (the only tier
    this entry touches).

**Decision recorded:** the registry concept is endorsed (it's effectively
already there); a materialized profile list is a *cache* justified only by a hot
path, and must stay rebuildable from the unlock items.
