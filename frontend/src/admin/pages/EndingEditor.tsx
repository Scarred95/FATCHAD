/**
 * Ending editor — painted to match the section pattern (PR-F8).
 *
 * Header: display title + mono crumb ("← Endings · <id>") + dirty pulse +
 * action buttons (delete / save). Body: two-column grid of local .section
 * panels (Stammdaten · Bedingungen · Probleme · Referenzen).
 *
 * Behaviour is unchanged: same auto-slug, same lock-on-saved id, same
 * dirty tracker, same validation gating, same referrer scan, same delete
 * confirm modal.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAdminEndingStore, referencesToEnding } from '../endingStore';
import { useAdminCardStore, flagInventoryOf } from '../store';
import { useAdminDeckStore } from '../deckStore';
import { EndingRequirementsEditor } from '../components/EndingRequirementsEditor';
import Modal from '../../components/Modal/Modal';
import type { Ending, EndingRequirements } from '../types';
import { slugify } from '../utils/slug';
import admin from '../admin.module.css';
import styles from './EndingEditor.module.css';

interface Props { mode: 'edit' | 'new'; }

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

function emptyEnding(): Ending {
  return {
    _id: '',
    title: '',
    description: '',
    priority: 100,
    requires: {},
    default: false,
    enabled: true,
    deck_name: null,
    image_url: null,
  };
}

export function EndingEditorPage({ mode }: Props) {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const endings = useAdminEndingStore((s) => s.endings);
  const saved = useAdminEndingStore((s) => s.saved);
  const upsertEnding = useAdminEndingStore((s) => s.upsertEnding);
  const removeEnding = useAdminEndingStore((s) => s.removeEnding);
  const cards = useAdminCardStore((s) => s.cards);
  const decks = useAdminDeckStore((s) => s.decks);

  const initial = useMemo<Ending>(() => {
    if (mode === 'new') return emptyEnding();
    const existing = endings.find((e) => e._id === id);
    return existing ? structuredClone(existing) : { ...emptyEnding(), _id: id ?? '' };
  }, [mode, id, endings]);

  const [ending, setEnding] = useState<Ending>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [idTouched, setIdTouched] = useState(false);
  useEffect(() => { setEnding(initial); setIdTouched(false); }, [initial]);

  // Auto-slug id from title in `new` mode until the user types in the id field.
  useEffect(() => {
    if (mode !== 'new' || idTouched) return;
    setEnding((e) => ({ ...e, _id: slugify(e.title) }));
  }, [ending.title, mode, idTouched]);

  const flagSuggestions = useMemo(() => flagInventoryOf(cards), [cards]);
  // Deck names to offer. Include the ending's current deck_name even when no
  // deck record exists for it (shadow deck) so the selection isn't lost.
  const deckOptions = useMemo(() => {
    const names = decks.map((d) => d.name);
    if (ending.deck_name && !names.includes(ending.deck_name)) {
      names.push(ending.deck_name);
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [decks, ending.deck_name]);
  const isLocked = mode === 'edit' && !!saved[ending._id];

  const refs = useMemo(() => referencesToEnding(ending._id, cards), [ending._id, cards]);
  const referrers = useMemo(() => {
    if (!ending._id) return [];
    type Ref = { cardId: string; cardTitle: string; kind: 'triggers' | 'unlocks' | 'removes' };
    const out: Ref[] = [];
    for (const c of cards) {
      for (const ch of c.choices ?? []) {
        if (ch.triggers_ending === ending._id) out.push({ cardId: c._id, cardTitle: c.title, kind: 'triggers' });
        if (ch.unlocks_endings?.includes(ending._id)) out.push({ cardId: c._id, cardTitle: c.title, kind: 'unlocks' });
        if (ch.removes_endings?.includes(ending._id)) out.push({ cardId: c._id, cardTitle: c.title, kind: 'removes' });
      }
    }
    return out;
  }, [cards, ending._id]);

  const errors = useMemo(() => validateEnding(ending, endings, mode), [ending, endings, mode]);
  const blockSave = errors.length > 0 || busy;

  const dirty = useMemo(
    () => JSON.stringify(ending) !== JSON.stringify(initial),
    [ending, initial],
  );

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  async function onSave() {
    if (blockSave) return;
    setBusy(true);
    const ok = await upsertEnding(ending);
    setBusy(false);
    if (ok && mode === 'new') {
      nav(`/admin/endings/${encodeURIComponent(ending._id)}`, { replace: true });
    }
  }

  async function onDelete() {
    setConfirmDelete(false);
    setBusy(true);
    const ok = await removeEnding(ending._id);
    setBusy(false);
    if (ok) nav('/admin/endings');
  }

  function patch<K extends keyof Ending>(k: K, v: Ending[K]) {
    setEnding((e) => ({ ...e, [k]: v }));
  }

  function patchRequires(next: EndingRequirements) {
    setEnding((e) => ({ ...e, requires: next }));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>
            {mode === 'new' ? 'Neues Ending' : ending.title || ending._id || 'Ending bearbeiten'}
          </h1>
          <p className={styles.sub}>
            <Link to="/admin/endings">← Endings</Link>
            {ending._id && <span>· {ending._id}</span>}
            {dirty && (
              <span className={styles.dirty}>
                <span className={styles.dirtyDot} aria-hidden />
                ungespeichert
              </span>
            )}
          </p>
        </div>
        <div className={styles.headerActions}>
          {mode === 'edit' && saved[ending._id] && (
            <button
              type="button"
              className={admin.btnDanger}
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Löschen
            </button>
          )}
          <button
            type="button"
            className={admin.btnPrimary}
            onClick={onSave}
            disabled={blockSave}
            title={errors.length > 0 ? errors.join('\n') : undefined}
          >
            {busy ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </header>

      <div className={styles.grid}>
        {/* ─── Left column: core fields ─────────────────────────── */}
        <div className={styles.col}>
          <section className={styles.section}>
            <header className={styles.sectionHead}>Stammdaten</header>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="ending-title">Titel</label>
              <input
                id="ending-title"
                className={styles.input}
                value={ending.title}
                onChange={(e) => patch('title', e.target.value)}
                placeholder="z.B. Welt erstarrt"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="ending-id">ID</label>
              <input
                id="ending-id"
                className={`${styles.input} ${styles.mono}`}
                value={ending._id}
                disabled={isLocked}
                onChange={(e) => {
                  setIdTouched(true);
                  patch('_id', e.target.value);
                }}
                placeholder="welt_erstarrt"
              />
              <span className={styles.hint}>
                {isLocked
                  ? 'ID gespeichert — Änderung würde Referenzen zerbrechen.'
                  : 'lowercase · snake_case · referenziert von triggers/unlocks/removes_endings'}
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="ending-desc">Beschreibung</label>
              <textarea
                id="ending-desc"
                className={styles.textarea}
                rows={4}
                value={ending.description}
                onChange={(e) => patch('description', e.target.value)}
                placeholder="Was sagt der Endbildschirm dem Spieler?"
              />
            </div>

            <div className={styles.priorityRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="ending-priority">Priorität</label>
                <input
                  id="ending-priority"
                  type="number"
                  className={`${styles.input} ${styles.mono}`}
                  value={ending.priority ?? 100}
                  onChange={(e) => patch('priority', Number(e.target.value))}
                />
                <span className={styles.hint}>niedriger = zuerst geprüft</span>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="ending-image">Bild-URL</label>
                <input
                  id="ending-image"
                  className={styles.input}
                  value={ending.image_url ?? ''}
                  onChange={(e) => patch('image_url', e.target.value || null)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="ending-deck">Deck</label>
              <select
                id="ending-deck"
                className={styles.input}
                value={ending.deck_name ?? ''}
                onChange={(e) => patch('deck_name', e.target.value || null)}
              >
                <option value="">— global (kein Deck) —</option>
                {deckOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <span className={styles.hint}>
                Default = immer im Run (egal ob global oder Deck-gebunden) · Deck-gebunden ohne Default = nur bei gewähltem Deck · global ohne Default = nie automatisch, nur via triggers_ending
              </span>
            </div>

            <div className={styles.checkboxRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={!!ending.default}
                  onChange={(e) => patch('default', e.target.checked)}
                />
                Default (wird neuen Runs zugewiesen)
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={ending.enabled !== false}
                  onChange={(e) => patch('enabled', e.target.checked)}
                />
                Aktiviert
              </label>
            </div>
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHead}>Bedingungen</header>
            <EndingRequirementsEditor
              value={ending.requires ?? {}}
              onChange={patchRequires}
              flagSuggestions={flagSuggestions}
            />
          </section>
        </div>

        {/* ─── Right column: validation + referrers ─────────────── */}
        <div className={styles.col}>
          {errors.length > 0 && (
            <section className={`${styles.section} ${styles.problems}`}>
              <header className={styles.sectionHead}>Probleme ({errors.length})</header>
              {errors.map((msg, i) => (
                <div key={i} className={styles.error}>• {msg}</div>
              ))}
            </section>
          )}

          <section className={styles.section}>
            <header className={styles.sectionHead}>
              Referenzen · {refs.triggers + refs.unlocks + refs.removes}
            </header>
            <div className={styles.refsMeta}>
              <span>triggers {refs.triggers}</span>
              <span>unlocks {refs.unlocks}</span>
              <span>removes {refs.removes}</span>
            </div>
            {referrers.length === 0 ? (
              <div className={styles.refsEmpty}>
                {ending._id
                  ? 'Keine Karte referenziert dieses Ending.'
                  : 'Erst speichern, dann tauchen Referenzen hier auf.'}
              </div>
            ) : (
              <div className={styles.refList}>
                {referrers.map((r, i) => (
                  <Link
                    key={`${r.cardId}-${r.kind}-${i}`}
                    to={`/admin/cards/${encodeURIComponent(r.cardId)}`}
                    className={styles.refItem}
                  >
                    <span>{r.cardTitle || r.cardId}</span>
                    <span className={styles.refKind}>{r.kind}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        title="Ending löschen?"
        body={`"${ending._id}" wird unwiderruflich entfernt. ${refs.triggers + refs.unlocks + refs.removes > 0
          ? `Achtung: ${refs.triggers + refs.unlocks + refs.removes} Karten-Referenz(en) werden orphan.`
          : ''}`}
        actions={[
          { label: 'Löschen', variant: 'danger', onClick: onDelete },
          { label: 'Abbrechen', variant: 'ghost', onClick: () => setConfirmDelete(false) },
        ]}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function validateEnding(e: Ending, all: Ending[], mode: 'edit' | 'new'): string[] {
  const errs: string[] = [];
  if (!e._id) errs.push('ID ist erforderlich.');
  else if (!ID_PATTERN.test(e._id)) errs.push('ID muss /^[a-z][a-z0-9_]*$/ erfüllen.');
  if (!e.title?.trim()) errs.push('Titel ist erforderlich.');
  if (!e.description?.trim()) errs.push('Beschreibung ist erforderlich.');
  if (typeof e.priority === 'number' && !Number.isFinite(e.priority)) {
    errs.push('Priorität muss eine Zahl sein.');
  }
  if (mode === 'new' && e._id) {
    if (all.some((x) => x._id === e._id)) errs.push(`ID "${e._id}" existiert bereits.`);
  }
  return errs;
}
