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
