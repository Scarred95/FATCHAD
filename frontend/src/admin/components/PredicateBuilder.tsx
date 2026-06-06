/**
 * Typed achievement-predicate builder (PR-A4).
 *
 * Replaces the raw-JSON payload textarea in AchievementEditor with a
 * schema-driven, recursive form. Each predicate is `{ type, ...fields }`;
 * the `SPECS` registry below mirrors the backend dispatch table in
 * `shared/game/achievements.py` exactly — adding a predicate there means
 * adding one row here.
 *
 * Composition (`all_of` / `any_of` / `not_of`) nests recursively via
 * `PredicateNode`. The canonical state is the payload OBJECT (not a JSON
 * string) so the parent can round-trip it through the expert JSON toggle
 * without lossy re-parsing.
 *
 * Autocomplete data (flags, endings, cards, categories, decks) is rendered
 * as shared <datalist>s ONCE at the root and referenced by stable ids, so
 * deeply-nested inputs don't each duplicate a 1000-option list.
 */
import { STAT_KEYS, STAT_LABELS } from '../types';
import type { StatKey } from '../types';
import styles from './PredicateBuilder.module.css';

export type Payload = Record<string, unknown>;

export interface PredicateOptions {
  flags: string[];
  endings: { id: string; title: string }[];
  cards: { id: string; title: string }[];
  categories: string[];
  decks: string[];
}

type FieldKind =
  | 'stat' | 'number'
  | 'flag' | 'flags'
  | 'ending' | 'endings'
  | 'card' | 'category' | 'deck';

interface FieldSpec {
  key: string;
  kind: FieldKind;
  label: string;
}

interface PredicateSpec {
  type: string;
  label: string;
  group: string;
  fields: FieldSpec[];
  composite?: 'list' | 'single';
}

// Mirror of the backend dispatch table. Order drives the dropdown optgroups.
const SPECS: PredicateSpec[] = [
  // ── Endzustand (group A) ──────────────────────────────────────────
  { type: 'won', group: 'Endzustand', label: 'Gewonnen (Nicht-Standard-Ende)', fields: [] },
  { type: 'ending_fired', group: 'Endzustand', label: 'Bestimmtes Ende erreicht', fields: [
    { key: 'ending_id', kind: 'ending', label: 'Ende' },
  ] },
  { type: 'ending_in', group: 'Endzustand', label: 'Eines mehrerer Enden', fields: [
    { key: 'ending_ids', kind: 'endings', label: 'Enden' },
  ] },
  { type: 'min_stat', group: 'Endzustand', label: 'Stat ≥ Wert', fields: [
    { key: 'stat', kind: 'stat', label: 'Stat' },
    { key: 'value', kind: 'number', label: 'Mindestwert' },
  ] },
  { type: 'max_stat', group: 'Endzustand', label: 'Stat ≤ Wert', fields: [
    { key: 'stat', kind: 'stat', label: 'Stat' },
    { key: 'value', kind: 'number', label: 'Höchstwert' },
  ] },
  { type: 'all_stats_min', group: 'Endzustand', label: 'Alle Stats ≥ Wert', fields: [
    { key: 'value', kind: 'number', label: 'Mindestwert' },
  ] },
  { type: 'has_flag', group: 'Endzustand', label: 'Flag gesetzt', fields: [
    { key: 'flag', kind: 'flag', label: 'Flag' },
  ] },
  { type: 'has_all_flags', group: 'Endzustand', label: 'Alle Flags gesetzt', fields: [
    { key: 'flags', kind: 'flags', label: 'Flags' },
  ] },
  { type: 'lacks_flag', group: 'Endzustand', label: 'Flag NICHT gesetzt', fields: [
    { key: 'flag', kind: 'flag', label: 'Flag' },
  ] },
  { type: 'max_turns', group: 'Endzustand', label: 'Höchstens N Züge', fields: [
    { key: 'value', kind: 'number', label: 'Max. Züge' },
  ] },
  { type: 'min_turns', group: 'Endzustand', label: 'Mindestens N Züge', fields: [
    { key: 'value', kind: 'number', label: 'Min. Züge' },
  ] },
  // ── Verlauf (group B) ─────────────────────────────────────────────
  { type: 'played_card', group: 'Verlauf', label: 'Bestimmte Karte gespielt', fields: [
    { key: 'card_id', kind: 'card', label: 'Karte' },
    { key: 'count', kind: 'number', label: 'Anzahl (min.)' },
  ] },
  { type: 'played_category_count', group: 'Verlauf', label: 'Karten einer Kategorie gespielt', fields: [
    { key: 'category', kind: 'category', label: 'Kategorie' },
    { key: 'count', kind: 'number', label: 'Anzahl (min.)' },
  ] },
  { type: 'played_deck_count', group: 'Verlauf', label: 'Karten eines Decks gespielt', fields: [
    { key: 'deck_name', kind: 'deck', label: 'Deck' },
    { key: 'count', kind: 'number', label: 'Anzahl (min.)' },
  ] },
  // ── Verlauf-Trail (group C) ───────────────────────────────────────
  { type: 'peak_stat', group: 'Verlauf (Trail)', label: 'Höchststand eines Stats ≥', fields: [
    { key: 'stat', kind: 'stat', label: 'Stat' },
    { key: 'value', kind: 'number', label: 'Wert' },
  ] },
  { type: 'trough_stat', group: 'Verlauf (Trail)', label: 'Tiefststand eines Stats ≤', fields: [
    { key: 'stat', kind: 'stat', label: 'Stat' },
    { key: 'value', kind: 'number', label: 'Wert' },
  ] },
  { type: 'swing', group: 'Verlauf (Trail)', label: 'Spanne (Hoch − Tief) ≥', fields: [
    { key: 'stat', kind: 'stat', label: 'Stat' },
    { key: 'value', kind: 'number', label: 'Spanne' },
  ] },
  { type: 'stay_above', group: 'Verlauf (Trail)', label: 'Stat ≥ Wert für N Züge in Folge', fields: [
    { key: 'stat', kind: 'stat', label: 'Stat' },
    { key: 'value', kind: 'number', label: 'Schwelle' },
    { key: 'turns', kind: 'number', label: 'Züge in Folge' },
  ] },
  { type: 'stay_below', group: 'Verlauf (Trail)', label: 'Stat ≤ Wert für N Züge in Folge', fields: [
    { key: 'stat', kind: 'stat', label: 'Stat' },
    { key: 'value', kind: 'number', label: 'Schwelle' },
    { key: 'turns', kind: 'number', label: 'Züge in Folge' },
  ] },
  // ── Verknüpfung (group E) ─────────────────────────────────────────
  { type: 'all_of', group: 'Verknüpfung', label: 'UND — alle erfüllt', fields: [], composite: 'list' },
  { type: 'any_of', group: 'Verknüpfung', label: 'ODER — mindestens eine', fields: [], composite: 'list' },
  { type: 'not_of', group: 'Verknüpfung', label: 'NICHT — Bedingung negieren', fields: [], composite: 'single' },
];

const SPEC_BY_TYPE: Record<string, PredicateSpec> = Object.fromEntries(
  SPECS.map((s) => [s.type, s]),
);

const GROUP_ORDER = ['Endzustand', 'Verlauf', 'Verlauf (Trail)', 'Verknüpfung'];

// Shared datalist ids — rendered once at the root.
const DL_FLAG = 'pb-dl-flag';
const DL_ENDING = 'pb-dl-ending';
const DL_CARD = 'pb-dl-card';
const DL_CATEGORY = 'pb-dl-category';
const DL_DECK = 'pb-dl-deck';

// ─── value coercion helpers ─────────────────────────────────────────

function isPayload(v: unknown): v is Payload {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function asNumberStr(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function asPayloadArray(v: unknown): Payload[] {
  return Array.isArray(v) ? v.filter(isPayload) : [];
}

function defaultPayload(type: string): Payload {
  const spec = SPEC_BY_TYPE[type];
  if (!spec) return { type };
  if (spec.composite === 'list') return { type, of: [] };
  if (spec.composite === 'single') return { type, of: {} };
  return { type };
}

/** Recursively prune empty strings / blank array entries before save. */
export function cleanPayload(p: Payload): Payload {
  const out: Payload = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'of') {
      if (Array.isArray(v)) out.of = v.filter(isPayload).map(cleanPayload);
      else if (isPayload(v)) out.of = cleanPayload(v);
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = v
        .map((x) => (typeof x === 'string' ? x.trim() : x))
        .filter((x) => (typeof x === 'string' ? x !== '' : true));
      continue;
    }
    if (typeof v === 'string') {
      if (v.trim() !== '') out[k] = v.trim();
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** Non-blocking warnings — incomplete predicates just won't fire server-side. */
export function predicateIssues(p: Payload): string[] {
  const type = asString(p.type);
  if (!type) return ['Kein Bedingungstyp gewählt'];
  const spec = SPEC_BY_TYPE[type];
  if (!spec) return [`Unbekannter Typ: ${type}`];

  const out: string[] = [];
  for (const f of spec.fields) {
    const v = p[f.key];
    if (f.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        out.push(`${spec.label}: „${f.label}“ fehlt`);
      }
    } else if (f.kind === 'flags' || f.kind === 'endings') {
      if (asStringArray(v).filter((x) => x.trim()).length === 0) {
        out.push(`${spec.label}: „${f.label}“ leer`);
      }
    } else if (!asString(v).trim()) {
      out.push(`${spec.label}: „${f.label}“ fehlt`);
    }
  }
  if (spec.composite === 'list') {
    const subs = asPayloadArray(p.of);
    if (subs.length === 0) out.push(`${spec.label}: keine Unterbedingungen`);
    subs.forEach((s) => out.push(...predicateIssues(s)));
  } else if (spec.composite === 'single') {
    if (!isPayload(p.of) || !asString((p.of as Payload).type)) {
      out.push(`${spec.label}: keine Unterbedingung`);
    } else {
      out.push(...predicateIssues(p.of as Payload));
    }
  }
  return out;
}

// ─── field-level inputs ─────────────────────────────────────────────

function AutocompleteInput({
  value, listId, placeholder, onChange,
}: {
  value: string;
  listId: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className={styles.input}
      type="text"
      list={listId}
      value={value}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function MultiInput({
  values, listId, placeholder, onChange,
}: {
  values: string[];
  listId: string;
  placeholder?: string;
  onChange: (v: string[]) => void;
}) {
  // Always show one trailing blank row so adding is one click away.
  const rows = values.length === 0 ? [''] : values;
  function setAt(i: number, v: string) {
    const next = [...rows];
    next[i] = v;
    onChange(next);
  }
  function removeAt(i: number) {
    const next = rows.filter((_, j) => j !== i);
    onChange(next);
  }
  return (
    <div className={styles.multi}>
      {rows.map((v, i) => (
        <div key={i} className={styles.multiRow}>
          <AutocompleteInput
            value={v}
            listId={listId}
            placeholder={placeholder}
            onChange={(nv) => setAt(i, nv)}
          />
          <button
            type="button"
            className={styles.iconBtn}
            title="Entfernen"
            onClick={() => removeAt(i)}
          >×</button>
        </div>
      ))}
      <button
        type="button"
        className={styles.addRow}
        onClick={() => onChange([...rows, ''])}
      >+ hinzufügen</button>
    </div>
  );
}

function Field({
  field, value, onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  let control: JSX.Element;
  switch (field.kind) {
    case 'stat':
      control = (
        <select
          className={styles.input}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— wählen —</option>
          {STAT_KEYS.map((s: StatKey) => (
            <option key={s} value={s}>{STAT_LABELS[s]}</option>
          ))}
        </select>
      );
      break;
    case 'number':
      control = (
        <input
          className={styles.input}
          type="number"
          value={asNumberStr(value)}
          onChange={(e) => {
            const raw = e.target.value;
            const n = Number(raw);
            onChange(raw.trim() === '' || !Number.isFinite(n) ? undefined : n);
          }}
        />
      );
      break;
    case 'flag':
      control = <AutocompleteInput value={asString(value)} listId={DL_FLAG} onChange={onChange} />;
      break;
    case 'flags':
      control = <MultiInput values={asStringArray(value)} listId={DL_FLAG} onChange={onChange} />;
      break;
    case 'ending':
      control = <AutocompleteInput value={asString(value)} listId={DL_ENDING} onChange={onChange} />;
      break;
    case 'endings':
      control = <MultiInput values={asStringArray(value)} listId={DL_ENDING} onChange={onChange} />;
      break;
    case 'card':
      control = <AutocompleteInput value={asString(value)} listId={DL_CARD} onChange={onChange} />;
      break;
    case 'category':
      control = <AutocompleteInput value={asString(value)} listId={DL_CATEGORY} onChange={onChange} />;
      break;
    case 'deck':
      control = <AutocompleteInput value={asString(value)} listId={DL_DECK} onChange={onChange} />;
      break;
  }
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{field.label}</span>
      {control}
    </label>
  );
}

// ─── recursive node ─────────────────────────────────────────────────

const MAX_DEPTH = 5;

function PredicateNode({
  value, onChange, depth,
}: {
  value: Payload;
  onChange: (v: Payload) => void;
  depth: number;
}) {
  const type = asString(value.type);
  const spec = type ? SPEC_BY_TYPE[type] : undefined;

  function setField(key: string, v: unknown) {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  }

  const subs = asPayloadArray(value.of);

  return (
    <div className={styles.node} data-depth={depth}>
      <select
        className={styles.typeSelect}
        value={type}
        onChange={(e) => onChange(defaultPayload(e.target.value))}
      >
        <option value="">— Bedingung wählen —</option>
        {GROUP_ORDER.map((g) => (
          <optgroup key={g} label={g}>
            {SPECS.filter((s) => s.group === g).map((s) => (
              <option key={s.type} value={s.type}>{s.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {spec && spec.fields.length > 0 && (
        <div className={styles.fields}>
          {spec.fields.map((f) => (
            <Field
              key={f.key}
              field={f}
              value={value[f.key]}
              onChange={(v) => setField(f.key, v)}
            />
          ))}
        </div>
      )}

      {/* Composition: list of children (all_of / any_of) */}
      {spec?.composite === 'list' && (
        <div className={styles.children}>
          {subs.map((child, i) => (
            <div key={i} className={styles.childRow}>
              <div className={styles.childBody}>
                {depth >= MAX_DEPTH ? (
                  <div className={styles.maxDepth}>Maximale Verschachtelung erreicht.</div>
                ) : (
                  <PredicateNode
                    value={child}
                    depth={depth + 1}
                    onChange={(nv) => {
                      const next = [...subs];
                      next[i] = nv;
                      setField('of', next);
                    }}
                  />
                )}
              </div>
              <button
                type="button"
                className={styles.iconBtn}
                title="Unterbedingung entfernen"
                onClick={() => setField('of', subs.filter((_, j) => j !== i))}
              >×</button>
            </div>
          ))}
          {depth < MAX_DEPTH && (
            <button
              type="button"
              className={styles.addNested}
              onClick={() => setField('of', [...subs, {}])}
            >+ Verschachteln</button>
          )}
        </div>
      )}

      {/* Composition: single child (not_of) */}
      {spec?.composite === 'single' && (
        <div className={styles.children}>
          {depth >= MAX_DEPTH ? (
            <div className={styles.maxDepth}>Maximale Verschachtelung erreicht.</div>
          ) : (
            <PredicateNode
              value={isPayload(value.of) ? (value.of as Payload) : {}}
              depth={depth + 1}
              onChange={(nv) => setField('of', nv)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── public component ───────────────────────────────────────────────

export function PredicateBuilder({
  value, onChange, options,
}: {
  value: Payload;
  onChange: (v: Payload) => void;
  options: PredicateOptions;
}) {
  return (
    <div className={styles.builder}>
      <PredicateNode value={value} onChange={onChange} depth={0} />

      {/* Shared autocomplete sources — rendered once, referenced everywhere. */}
      <datalist id={DL_FLAG}>
        {options.flags.map((f) => <option key={f} value={f} />)}
      </datalist>
      <datalist id={DL_ENDING}>
        {options.endings.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
      </datalist>
      <datalist id={DL_CARD}>
        {options.cards.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </datalist>
      <datalist id={DL_CATEGORY}>
        {options.categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <datalist id={DL_DECK}>
        {options.decks.map((d) => <option key={d} value={d} />)}
      </datalist>
    </div>
  );
}
