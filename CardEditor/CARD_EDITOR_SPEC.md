# Card Editor — Project Spec

A standalone web app for creating and editing **FATCHAD** card JSON files.
Visualises cards as they will appear in-game and lets the author follow the
questline graph that `adds_to_deck` builds between cards.

This document is self-contained. The editor does **not** need to talk to the
FATCHAD backend — it reads and writes JSON files on disk (or in
browser-local storage / IndexedDB, depending on the architecture you pick).

---

## 1. Context (just enough)

FATCHAD is a Reigns-style swipe game written in German. The player works
through a deck of "cards" (events). Each card has 2 or 3 choices. Each choice
changes the player's stats, can set/clear flags, and can add other cards to
the deck — that last mechanic is how questlines / story arcs are built.

A "deck" or "pack" is just a folder of cards sharing a `deck_name` field.
There is no separate deck document — a deck exists if at least one card
declares it. Cards live in `events/*.json` files; each file is a JSON array
of card objects. Comments (`//` and `/* */`) are tolerated by the seeder
(JSONC), but the editor should produce **strict JSON** for safety.

---

## 2. The card schema

This is the contract. Every field below must match exactly — the game's
backend uses Pydantic and rejects anything else.

### Top-level card

| Field         | Type                  | Required | Default | Notes |
|---------------|-----------------------|----------|---------|-------|
| `_id`         | `string`              | yes      | —       | Globally unique. Convention: `evt_<snake_case>`. Immutable once published. |
| `title`       | `string`              | yes      | —       | German, sentence case. |
| `description` | `string`              | yes      | —       | German, 1–3 sentences. |
| `category`    | `string`              | yes      | —       | Must come from the categories list (§4). Drives refill pooling. |
| `deck_name`   | `string \| null`      | no       | `null`  | Human-readable pack name, e.g. `"Aufstieg I"`, `"Tutorial"`. |
| `weight`      | `integer ≥ 0`         | no       | `10`    | Refill draw weight. `0` = never drawn (questline-only). |
| `important`   | `boolean`             | no       | `false` | If `true`, an ineligible card is re-shuffled instead of dropped. Use for questline arcs. |
| `requires`    | `Requirements`        | no       | empty   | Eligibility gate (§2.1). |
| `choices`     | `array of Choice`     | yes      | —       | **Length 2 or 3.** |
| `image_url`   | `string \| null`      | no       | `null`  | Optional. Cards without an image use generated art. |

### 2.1 `Requirements`

| Field         | Type                          | Default |
|---------------|-------------------------------|---------|
| `flags_all`   | `string[]`                    | `[]`    |
| `flags_none`  | `string[]`                    | `[]`    |
| `flags_any`   | `string[]`                    | `[]`    |
| `stats`       | `{ [statName]: StatRange }`   | `{}`    |

`flags_all`: every flag must be set.
`flags_none`: none of these may be set.
`flags_any`: at least one must be set (when the list is non-empty).
`stats[stat] = { min?, max? }`: stat must be within range. Either bound optional.

Valid stat keys: `moneten`, `aura`, `respekt`, `rizz`, `chaos`.

### 2.2 `Choice`

| Field             | Type                     | Required | Default | Notes |
|-------------------|--------------------------|----------|---------|-------|
| `text`            | `string` (min length 1)  | yes      | —       | Button label. |
| `effects`         | `Effects`                | no       | all 0   | Stat deltas (§2.3). |
| `hints`           | `ChoiceHints`            | no       | empty   | UI display hints per stat (§2.4). |
| `sets_flags`      | `string[]`               | no       | `[]`    | Flags to add when this choice is taken. |
| `clears_flags`    | `string[]`               | no       | `[]`    | Flags to remove. |
| `adds_to_deck`    | `DeckAddition[]`         | no       | `[]`    | Inject cards into the deck (§2.5). |
| `triggers_ending` | `string \| null`         | no       | `null`  | Ending ID — marks the run as `won` with this ending. |

### 2.3 `Effects`

All five fields default to `0`. Only declare the ones the choice actually
touches.

| Field     | Type      | Stat range after apply |
|-----------|-----------|------------------------|
| `moneten` | `integer` | clamped 0..100         |
| `aura`    | `integer` | clamped 0..100         |
| `respekt` | `integer` | clamped 0..100         |
| `rizz`    | `integer` | clamped 0..100         |
| `chaos`   | `integer` | clamped -100..100      |

Recommended range per choice: **±5 to ±15** for normal cards, ±15 to ±30
for chaos / dramatic cards. The editor SHOULD cap inputs at ±50 to prevent
accidents.

### 2.4 `ChoiceHints`

Per-stat optional display hint. Lets authors lie to the player (show
"down" on a stat that the choice actually buffs) or hide a stat entirely.

| Field     | Type                                              |
|-----------|---------------------------------------------------|
| `moneten` | `"up" \| "down" \| "unknown" \| "hidden" \| null` |
| `aura`    | same                                              |
| `respekt` | same                                              |
| `rizz`    | same                                              |
| `chaos`   | same                                              |

Meaning:
- `"up"` — ↑ icon
- `"down"` — ↓ icon
- `"unknown"` — `?` icon ("something will change, magnitude hidden")
- `"hidden"` — explicitly omit this stat from the hint list
- `null` / omitted — if **all** hints are null, the game auto-derives from
  the sign of each non-zero effect. If any hint is set, only the
  set hints are shown (no auto-derive fallback).

### 2.5 `DeckAddition`

| Field      | Type                                  | Required | Default     |
|------------|---------------------------------------|----------|-------------|
| `card_id`  | `string`                              | yes      | —           |
| `position` | `"top" \| "bottom" \| "shuffle"`      | no       | `"shuffle"` |
| `in_turns` | `integer ≥ 0 \| null`                 | no       | `null`      |

If `in_turns` is set, the card goes into the player's `scheduled` list and
promotes to the **top** of the deck after that many turns; `position` is
ignored in that case.

`adds_to_deck` is the **primary questline mechanism**. To build an arc:
1. Entry card has normal weight + a `flags_none: ["ql_x_resolved"]` guard.
2. Its choice adds a follow-up card via `adds_to_deck` (often
   `position: "top"` for an immediate scripted beat, or `in_turns: 3` for a
   delayed consequence).
3. Follow-up cards have `weight: 0` and `important: true`.
4. The final card in the arc has a choice that sets `ql_x_resolved` (or
   uses `triggers_ending`).

---

## 3. JSON file format

Each file under `events/` is a JSON array of card objects. There is no
wrapping object, no metadata header.

```json
[
  { "_id": "evt_…", "title": "…", ... },
  { "_id": "evt_…", "title": "…", ... }
]
```

File-naming convention:

- `tutorial.json` — onboarding cards
- `refill_deck_<n>_<slug>.json` — packs that participate in refill
- `questline_<slug>.json` — story arcs (mostly `weight: 0` cards)

The editor SHOULD let the author group cards across multiple files but
treat `deck_name` (not filename) as the canonical pack identifier.

---

## 4. Categories

A card's `category` determines whether it participates in the random refill
pool. The current canonical list:

### Refill categories (drawn automatically to top up the deck)

`politik`, `social`, `economy`, `chaos`

### Non-refill categories (injected explicitly via `adds_to_deck`)

`tutorial`, `ending`, plus any questline-only categories you invent.
Cards in these categories should have `weight: 0`.

### Proposed (not yet wired)

Power & politics: `justiz`, `militaer`, `international`, `geheimdienst`
Money & crime: `kriminalitaet`, `unterwelt`, `finanzen`, `immobilien`
Media & culture: `medien`, `kultur`, `sport`, `religion`
Science & tech: `technologie`, `wissenschaft`, `energie`
Personal: `beziehungen`, `familie`, `gesundheit`, `bildung`
Society: `umwelt`, `bevoelkerung`, `natur`

The editor's category picker SHOULD allow free-text entry (to let authors
introduce new categories) but warn when a value isn't in the canonical
list.

---

## 5. Endings catalogue

`triggers_ending` accepts these IDs (and the engine has hardcoded
auto-trigger rules for the stat extremes — listed for completeness).

### Win endings

| Ending ID         | Auto trigger                |
|-------------------|-----------------------------|
| `chaos_agent`     | `stats.chaos == 100`        |
| `grey_eminence`   | `stats.chaos == -100`       |
| *(custom)*        | only via `triggers_ending`  |

### Loss endings (auto-trigger on stat boundary)

| Ending ID                | Trigger          |
|--------------------------|------------------|
| `death_bankrupt`         | `moneten == 0`   |
| `death_revolution`       | `moneten == 100` |
| `death_irrelevant`       | `aura == 0`      |
| `death_jumped_shark`     | `aura == 100`    |
| `death_couped`           | `respekt == 0`   |
| `death_conspiracy`       | `respekt == 100` |
| `death_frozen_out`       | `rizz == 0`      |
| `death_drowned_in_drama` | `rizz == 100`    |

A choice that sets `triggers_ending` to an arbitrary string ends the run as
`won` with that ending ID — useful for authored "good" outcomes that don't
match a stat extreme.

---

## 6. Flag conventions

Flags are free-text strings the game stores per-run. Conventions only —
nothing enforces them.

| Pattern         | Meaning                                  | Examples                                 |
|-----------------|------------------------------------------|------------------------------------------|
| `has_X` / `is_X`| Persistent state                         | `has_bodyguard`, `is_blacklisted`        |
| `did_X` / `met_X`| One-time event marker                   | `met_journalist`, `did_bribe_minister`   |
| `path_X`        | Branch the player committed to           | `path_money`, `path_charm`               |
| `X_resolved` / `X_dead` | Arc blocker / NPC death          | `journalist_resolved`, `minister_dead`   |
| `tutorial_*`    | Tutorial progression                     | `tutorial_started`, `tutorial_done`      |

Flags are binary; setting an already-set flag is a no-op. There are also
`flag_timers` (set in code, not by cards) for flags that auto-expire — the
card schema can't directly create a timer.

---

## 7. Real card examples

### 7.1 Minimal 2-choice card

```json
{
  "_id": "evt_rd1_buergermeister_kaffee",
  "title": "Kaffee mit dem Bürgermeister",
  "description": "Er will reden. Es geht angeblich nur um die Stadt.",
  "category": "politik",
  "deck_name": "Aufstieg I",
  "weight": 12,
  "choices": [
    { "text": "Hingehen.", "effects": { "respekt": 8, "moneten": -5 } },
    { "text": "Absagen.",  "effects": { "respekt": -6, "aura": 4 } }
  ]
}
```

### 7.2 3-choice card with explicit hints

```json
{
  "_id": "evt_rd2_dreifachfrage_party",
  "title": "Drei Einladungen, ein Abend",
  "description": "Dein Telefon glüht. Drei Partys, drei Welten, ein Du.",
  "category": "social",
  "deck_name": "Trilemma I",
  "weight": 10,
  "choices": [
    {
      "text": "Zur Galerie.",
      "effects": { "aura": 8, "moneten": -4 },
      "hints":   { "aura": "up", "moneten": "down" }
    },
    {
      "text": "Zum Politiker.",
      "effects": { "respekt": 9, "rizz": -3 },
      "hints":   { "respekt": "up", "rizz": "down" }
    },
    {
      "text": "Zum Hinterhof-Rave.",
      "effects": { "rizz": 10, "respekt": -5, "chaos": 6 },
      "hints":   { "rizz": "up", "chaos": "up" }
    }
  ]
}
```

### 7.3 Questline entry (chains via `adds_to_deck`)

```json
{
  "_id": "evt_tut_01_awakening",
  "title": "Du wachst auf.",
  "description": "Vor dir liegt die Welt. Sie ist kaputt, aber sie ist da. Jemand muss sie übernehmen — warum nicht du?",
  "category": "tutorial",
  "deck_name": "Tutorial",
  "weight": 0,
  "important": true,
  "requires": {
    "flags_none": ["tutorial_started", "tutorial_done"]
  },
  "choices": [
    {
      "text": "Aufstehen.",
      "effects": {},
      "sets_flags": ["tutorial_started"],
      "adds_to_deck": [
        { "card_id": "evt_tut_02_stats", "position": "top" }
      ]
    }
  ]
}
```

(Yes — tutorial cards sometimes have only one *meaningful* choice; they
still need a 2nd entry in `choices` because the schema requires length ≥ 2.
The current pattern is to duplicate the choice.)

### 7.4 Card with eligibility gate

```json
{
  "_id": "evt_example_requirements",
  "title": "Die Einladung",
  "description": "Ein exklusiver Kreis öffnet die Türen.",
  "category": "social",
  "weight": 8,
  "requires": {
    "flags_all":  ["tutorial_done"],
    "flags_none": ["already_invited", "blacklisted"],
    "flags_any":  ["path_money", "path_charm"],
    "stats": {
      "moneten": { "min": 30 },
      "aura":    { "min": 20, "max": 80 }
    }
  },
  "choices": [
    { "text": "Annehmen.",  "effects": { "aura": 10, "rizz": 5 },
      "sets_flags": ["already_invited"] },
    { "text": "Ablehnen.",  "effects": { "respekt": 4 } }
  ]
}
```

### 7.5 Delayed consequence + custom ending

```json
{
  "_id": "evt_questline_final",
  "title": "Die letzte Wahl.",
  "description": "Du kannst jetzt aufhören oder weitergehen. Beides hat einen Preis.",
  "category": "questline_x",
  "deck_name": "Schattenpakt",
  "weight": 0,
  "important": true,
  "requires": { "flags_all": ["ql_x_ready"] },
  "choices": [
    {
      "text": "Aussteigen.",
      "effects": { "respekt": -20 },
      "sets_flags": ["ql_x_resolved"]
    },
    {
      "text": "Den Schatten kaufen.",
      "effects": { "moneten": -40, "chaos": 25 },
      "sets_flags": ["ql_x_resolved"],
      "triggers_ending": "schattenpakt_won"
    },
    {
      "text": "Aufschieben.",
      "effects": { "chaos": 3 },
      "adds_to_deck": [
        { "card_id": "evt_questline_final", "in_turns": 3 }
      ]
    }
  ]
}
```

---

## 8. Editor requirements

### 8.1 Pages

| Route | Purpose |
|---|---|
| `/` (decks index) | All decks as tiles. Each tile: deck_name, card count, category breakdown, "has questline" badge, "has 3-choice" badge. An "Orphans" tile groups cards with `deck_name == null`. |
| `/decks/:name` | Cards in one deck. Sortable table. "+ New card" button. "Export deck.json" / "Import deck.json" actions. |
| `/cards/:id` | Full editor for one card. |
| `/cards/new?deck=…` | Create card (deck pre-filled). |
| `/graph` *(optional)* | Force-directed graph of all cards as nodes and `adds_to_deck` references as edges. Color nodes by deck or by category. |

### 8.2 Card editor — three panes

**Left — Identity & requirements**
- `_id` (locked once saved, with copy-to-clipboard button)
- title, description (multiline)
- category (combo: pick from canonical list §4 or type new)
- deck_name (combo: existing deck names from currently-loaded files, or new)
- weight (slider 0..100)
- important (toggle)
- image_url (optional string)
- Requirements panel (collapsible):
  - `flags_all` / `flags_none` / `flags_any` — tag inputs with autocomplete
    from the union of all flags referenced anywhere in the current dataset
  - 5 stat range sliders (min/max each, both optional)

**Middle — Choices (tabs for choice 1 / 2 / [+ 3])**
- text (max 60 chars recommended)
- Effects: 5 number inputs (-50..+50, step 1)
- Hints: 5 dropdowns (auto / up / down / unknown / hidden)
- `sets_flags` / `clears_flags` — tag inputs with autocomplete
- `adds_to_deck` — repeatable rows of `{ card_id picker · position · in_turns }`
  - card_id picker should fuzzy-search across all loaded cards and show
    `title — deck_name` per result
  - "Jump to target" arrow next to each row → opens that card in editor
- `triggers_ending` — combobox of the endings catalogue §5 plus free text

**Right — Live preview**
- A WYSIWYG render of how the card looks in-game: dark rounded rectangle,
  gradient art block on top (deterministic from `_id` — see §9), category
  top-left of the art block in faded text, deck_name as a pill top-right,
  title + description in the body, foot hint at the bottom.
- Below the card preview: a "choice gutter" mockup for each choice showing
  the arrow, choice text, and the hint icons (↑ ↓ ? for each non-hidden
  stat).
- A small validation panel listing schema errors / warnings (see §10).

### 8.3 Quick-add dialog (from deck page)

Minimal fields only: `_id`, `title`, `description`, `category`, `weight`,
choice 1 text, choice 2 text. `[Save & open editor]` writes the card and
navigates to its full editor page. `[Save & stub another]` keeps the
dialog open with a cleared form.

### 8.4 Questline tracing

Two cheap UX touches give you 80% of the value of a full graph view:

1. **"Adds:"** row on the card editor — chips for each `card_id` in any
   choice's `adds_to_deck`, with the target card's title. Click → navigate.
2. **"Added by:"** row — chips for each card that lists *this* card in its
   `adds_to_deck`. Computed by scanning all loaded cards for matching
   references.

For the deluxe version: a separate `/graph` page rendering the full
directed graph. Suggested libraries: `reactflow`, `cytoscape.js`, or
`d3-force` if you want to roll it yourself. Group nodes by `deck_name` or
`category`. Highlight: orphans (no incoming `adds_to_deck` edges and not
in `weight > 0`), cycles, dead-ends (`triggers_ending` is set, no further
adds).

### 8.5 File operations

- **Import** — drag-and-drop a `*.json` file (or a folder). Parse as JSON.
  Tolerate JSONC if you can be bothered. Merge into the working dataset.
  Conflict policy on duplicate `_id`: prompt "replace / keep existing /
  skip" per card.
- **Export deck** — produces a single file `<deck-slug>.json` containing all
  cards with that `deck_name`. Strict JSON, 2-space indent, key order:
  `_id, title, description, category, deck_name, weight, important,
  requires, choices, image_url` (matches existing source style; tools like
  `jq` will reorder anyway, but humans appreciate the consistency).
- **Export all** — zip of one file per `deck_name`.
- **Persistence** — auto-save the working dataset to `localStorage` /
  IndexedDB on every change so a refresh doesn't lose work.

### 8.6 Validation rules (run on every save and surface in the preview pane)

Errors (block save):

- `_id` matches `^evt_[a-z0-9_]+$`
- `_id` unique across the working dataset
- title, description non-empty
- category non-empty
- choices length is 2 or 3
- each choice has non-empty `text`
- every `card_id` referenced in `adds_to_deck` exists in the working dataset
- `weight >= 0`, `in_turns >= 0` when set
- stat ranges: `min <= max` when both set, both within stat domain
  (`-100..100` for chaos, `0..100` otherwise)
- effect values within stat domain after a single application

Warnings (don't block):

- category not in canonical list (§4)
- weight is 0 but no `important: true` (likely unreachable card)
- weight > 0 but only reachable via `adds_to_deck` from another card with
  `weight: 0` (suspicious)
- choice has effects but no hints AND no other choice on this card has
  hints — fine, but show "auto-hints will be derived" hint
- a choice that auto-derives hints but at least one *other* choice has
  hints set (hint mode is per-choice, so this is legal but easy to mistake)
- ending ID not in §5 catalogue when `triggers_ending` is set
- `_id` very long (>60 chars) — author convenience
- choice text > 60 chars (will wrap awkwardly in the gutter)
- card referenced by `adds_to_deck` from this card has incompatible
  `requires` that this card's flags / state can never satisfy — best-effort
  static analysis, fine to skip in v1

### 8.7 Author conveniences

- Duplicate card button (copies all fields, prompts for new `_id`)
- Find & replace across all cards (flags, ending IDs, category names)
- "Find references" on a flag — list cards that set / clear / require it
- "Find references" on a card_id — list cards that add it
- A "dataset stats" sidebar: total cards · count per deck · count per
  category · flag inventory · ending ID inventory

---

## 9. Card visual rendering (for the live preview)

The in-game card visual is a flexbox column inside a dark rounded
rectangle (≈ `border-radius: 24px`):

1. **Art block** — top ~38% of the card height. Deterministic gradient
   derived from `_id`:
   ```js
   const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
   const hue1 = (hash * 37) % 360;
   const hue2 = (hue1 + 35) % 360;
   const gradAngle = (hash * 11) % 180;
   const stripeAngle = (hash * 17) % 180;
   const bg = `linear-gradient(${gradAngle}deg,
     oklch(28% 0.06 ${hue1}) 0%, oklch(20% 0.08 ${hue2}) 100%)`;
   const stripe = `repeating-linear-gradient(${stripeAngle}deg,
     rgba(255,255,255,.04) 0 2px, transparent 2px 11px)`;
   ```
   Overlay the stripe pattern with a soft inset shadow at the bottom edge
   to blend into the card body.

2. **Corner labels** (absolute, inside the art block):
   - **Top-left**: category, uppercase, faded `rgba(245,245,250,0.5)`,
     small caps style.
   - **Top-right**: deck_name in a pill — translucent black background,
     1px white border, light text, blur backdrop.

3. **Body** — title (display font, ~22px, no shadow), then description
   (italic, dimmer color, body font ~14px).

4. **Foot hint** — uppercase ~10px text "Wische links oder rechts"
   (2-choice) or "Wische in eine Richtung. Auch nach unten." (3-choice),
   flanked by larger arrow glyphs `←` … `→` or `←` … `↓`.

5. **Choice gutters** (rendered outside the card, beside it):
   - Each gutter shows: arrow glyph (←, →, or ↓), the choice text,
     and a stack of hint icons. One stat icon per non-hidden hint.
   - Hint icon mapping: ↑ = "up", ↓ = "down", `?` = "unknown".

Stat colors (CSS custom-property style, define as you like — these are the
canonical values):

| Stat     | Color       |
|----------|-------------|
| moneten  | `#facc15` (yellow) |
| aura     | `#a855f7` (purple) |
| respekt  | `#ef4444` (red)    |
| rizz     | `#38bdf8` (sky)    |
| chaos    | `#f97316` (orange) |

---

## 10. Tech recommendations (not requirements)

- **Stack**: Vite + React + TypeScript. Tailwind or CSS Modules either way.
- **State**: Zustand or a single React context — small enough that Redux
  is overkill.
- **Forms**: react-hook-form + zod (zod schema matching §2 makes
  validation trivial and gives you TS types for free).
- **Graph view (if you build it)**: `reactflow` is the path of least
  resistance; `cytoscape.js` if you want richer layout algorithms.
- **File I/O**: File System Access API for browsers that support it,
  fallback to `<input type="file">` / download blobs.
- **No backend needed.** Everything lives in the user's browser. If you
  later want to round-trip directly with the FATCHAD backend, the relevant
  endpoints are `GET/POST/PATCH/DELETE /admin/cards` and the Pydantic
  shape there matches §2 exactly.

---

## 11. Definition of done (v1)

- [ ] Import one or more `*.json` files from disk; dataset persists across reloads.
- [ ] Decks index page lists every `deck_name` with card counts.
- [ ] Deck detail page lists cards in a sortable table.
- [ ] Card editor: all schema fields editable; live in-game preview updates as you type.
- [ ] Quick-add dialog for stub cards.
- [ ] "Adds:" / "Added by:" link rows on every card editor — clickable navigation.
- [ ] Validation surface: errors block save, warnings don't.
- [ ] Export single deck as JSON file.
- [ ] Export entire dataset as a zip.

Stretch (v1.5):

- [ ] `/graph` view of the full questline graph.
- [ ] Find & replace across all cards.
- [ ] Flag inventory page (every flag, every card that touches it).
- [ ] Direct push to a running FATCHAD backend via `/admin/cards`.

---

## 12. Out of scope

- Player save / `GameState` editing — that's the game's runtime data, not card
  authoring.
- Ending definitions — endings are hard-coded in the game engine. The editor
  only consumes their IDs.
- Localisation — content is German-only for now; no i18n layer needed.
- Image generation — `image_url` is just a string field for v1.
- Auth — single-author tool running locally.

---

**Reference style note:** this spec uses `_id`, `deck_name`, `flags_all`
etc. because that's exactly what the game backend reads. Do not rename
fields for "nicer" JavaScript style — `_id` stays `_id`, snake_case stays
snake_case, or the seeder rejects the file.
