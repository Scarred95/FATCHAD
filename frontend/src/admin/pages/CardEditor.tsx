import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CardPreview } from '../components/CardPreview';
import { ChoicesEditor } from '../components/ChoicesEditor';
import { RequirementsEditor } from '../components/RequirementsEditor';
import { ValidationPanel } from '../components/ValidationPanel';
import { FlagInspector } from '../components/FlagInspector';
import Modal from '../../components/Modal/Modal';
import {
  categoryNamesOf, deckNamesOf, flagInventoryOf, referrersOf, useAdminCardStore,
} from '../store';
import { useAdminEndingStore } from '../endingStore';
import {
  ALL_CATEGORIES, type Card, type Requirements,
} from '../types';
import { validateCard } from '../utils/validate';
import { emptyCard } from '../utils/factory';
import { slugify } from '../utils/slug';
import { diffCard, type DiffEntry } from '../utils/diff';
import admin from '../admin.module.css';
import styles from './CardEditor.module.css';

interface Props { mode: 'edit' | 'new'; }

export function CardEditorPage({ mode }: Props) {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const nav = useNavigate();
  const cards = useAdminCardStore((s) => s.cards);
  const saved = useAdminCardStore((s) => s.saved);
  const upsertCard = useAdminCardStore((s) => s.upsertCard);
  const removeCard = useAdminCardStore((s) => s.removeCard);
  const duplicateCard = useAdminCardStore((s) => s.duplicateCard);

  const initial = useMemo<Card>(() => {
    if (mode === 'new') {
      return emptyCard({ deck_name: search.get('deck') || null });
    }
    const existing = cards.find((c) => c._id === id);
    return existing ? structuredClone(existing) : emptyCard({ _id: id ?? '' });
  }, [mode, id, cards, search]);

  const [card, setCard] = useState<Card>(initial);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [idTouched, setIdTouched] = useState(false);
  const [inspectorFlag, setInspectorFlag] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<DiffEntry[] | null>(null);
  useEffect(() => { setCard(initial); setIdTouched(false); }, [initial]);

  const flagSuggestions = useMemo(() => flagInventoryOf(cards), [cards]);
  const deckSuggestions = useMemo(() => deckNamesOf(cards), [cards]);
  const categorySuggestions = useMemo(
    () => [...new Set([...ALL_CATEGORIES, ...categoryNamesOf(cards)])],
    [cards],
  );

  // Validate against a hypothetical dataset where this card is the current version.
  const datasetForValidation = useMemo(() => {
    const others = cards.filter((c) => c._id !== card._id && c._id !== initial._id);
    return [...others, card];
  }, [cards, card, initial._id]);

  const endings = useAdminEndingStore((s) => s.endings);
  const endingIds = useMemo(() => new Set(endings.map((e) => e._id)), [endings]);
  const issues = useMemo(
    () => validateCard(card, datasetForValidation, endingIds),
    [card, datasetForValidation, endingIds],
  );
  const errors = issues.filter((i) => i.level === 'error');
  const blockSave = errors.length > 0 || busy;
  const isLocked = mode === 'edit' && !!saved[card._id];

  const referrers = useMemo(() => referrersOf(cards, card._id), [cards, card._id]);

  // Dirty = the card in state differs from what came from the store
  // (or from the empty template in `new` mode). JSON.stringify is fine
  // here — cards are small and field order is stable.
  const dirty = useMemo(
    () => JSON.stringify(card) !== JSON.stringify(initial),
    [card, initial],
  );

  // Warn on browser close / refresh while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message string but still show a prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const patch = (p: Partial<Card>) => setCard((c) => ({ ...c, ...p }));
  const patchReq = (r: Requirements) => setCard((c) => ({ ...c, requires: r }));

  // Auto-suggest _id from title in `new` mode until the operator types
  // in the _id field themselves. Doesn't fire while editing existing cards.
  useEffect(() => {
    if (mode !== 'new' || idTouched) return;
    if (card.title.trim().length < 3) return;
    const candidate = `evt_${slugify(card.title)}`;
    if (candidate === card._id) return;
    setCard((c) => ({ ...c, _id: candidate }));
  }, [card.title, mode, idTouched, card._id]);

  const persist = useCallback(async () => {
    setBusy(true);
    const ok = await upsertCard(card);
    setBusy(false);
    if (!ok) return;
    if (mode === 'new') nav(`/admin/cards/${encodeURIComponent(card._id)}`, { replace: true });
  }, [card, mode, nav, upsertCard]);

  const onSave = async () => {
    if (blockSave) return;
    // If the operator is staring at the diff modal already, treat a
    // second Save (button or Cmd/Ctrl+S) as confirmation. Avoids the
    // pointless re-compute and matches the intuition that Cmd+S commits.
    if (pendingDiff) {
      setPendingDiff(null);
      await persist();
      return;
    }
    // For existing cards with structural edits, surface a diff modal so
    // the operator can eyeball what's about to be written.
    if (mode === 'edit' && saved[card._id]) {
      const entries = diffCard(initial, card);
      if (entries.length > 0) {
        setPendingDiff(entries);
        return;
      }
    }
    await persist();
  };

  const onDelete = () => setConfirmDelete(true);

  const performDelete = async () => {
    setConfirmDelete(false);
    setBusy(true);
    const ok = await removeCard(card._id);
    setBusy(false);
    if (!ok) return;
    nav(card.deck_name ? `/admin/decks/${encodeURIComponent(card.deck_name)}` : '/admin');
  };

  const onDuplicate = async () => {
    const proposed = prompt('New _id for the duplicate', `${card._id}_copy`);
    if (!proposed) return;
    if (!/^evt_[a-z0-9_]+$/.test(proposed)) { alert('_id must match ^evt_[a-z0-9_]+$'); return; }
    if (cards.some((c) => c._id === proposed)) { alert('That _id already exists'); return; }
    setBusy(true);
    const ok = await duplicateCard(card._id, proposed);
    setBusy(false);
    if (!ok) return;
    nav(`/admin/cards/${encodeURIComponent(proposed)}`);
  };

  // Keyboard shortcuts. Refs keep the listener stable across re-renders
  // while still calling the freshest handler. FlagInspector and the
  // delete-confirm Modal handle their own Escape; we only intercept Esc
  // for the diff modal (which is rendered inline below). Cmd/Ctrl+S
  // routes through onSave() and is therefore safe whether or not the
  // diff modal is open — see the pendingDiff branch in onSave.
  const onSaveRef = useRef(onSave);
  const onDuplicateRef = useRef(onDuplicate);
  onSaveRef.current = onSave;
  onDuplicateRef.current = onDuplicate;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === 's') {
        e.preventDefault();
        void onSaveRef.current();
      } else if (ctrl && key === 'd' && mode === 'edit') {
        e.preventDefault();
        void onDuplicateRef.current();
      } else if (e.key === 'Escape' && pendingDiff) {
        setPendingDiff(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, pendingDiff]);

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link
          to={card.deck_name ? `/admin/decks/${encodeURIComponent(card.deck_name)}` : '/admin/decks/__orphans__'}
          className={styles.crumbLink}
        >← Back to {card.deck_name ?? 'orphans'}</Link>
        <span className={styles.divider}>/</span>
        <Link to="/admin" className={styles.crumbFaint}>all decks</Link>
        <span className={styles.divider}>/</span>
        <span className={styles.crumbId}>{card._id || '(unsaved)'}</span>

        <div className={styles.actions}>
          {dirty && (
            <span className={styles.dirty} title="Ungesicherte Änderungen">
              <span className={styles.dirtyDot} aria-hidden />
              unsaved
            </span>
          )}
          <button
            type="button"
            onClick={() => { setInspectorFlag(null); setInspectorOpen(true); }}
            className={admin.btnSecondary}
            title="Karten finden, die ein Flag setzen / lesen"
          >Flags…</button>
          {mode === 'edit' && <button onClick={() => void onDuplicate()} className={admin.btnSecondary} title="Cmd/Ctrl+D">Duplicate</button>}
          {mode === 'edit' && <button onClick={() => onDelete()} className={admin.btnDanger}>Delete</button>}
          <button onClick={() => void onSave()} disabled={blockSave} className={admin.btnPrimary} title="Cmd/Ctrl+S">
            {errors.length > 0 ? `Fix ${errors.length} error(s)` : busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {/* LEFT — Identity */}
        <section className={`${admin.panel} ${styles.section}`}>
          <div>
            <div className={admin.fieldLabel}>
              _id {isLocked && <span className={styles.locked}>(locked)</span>}
            </div>
            <div className={styles.idRow}>
              <input
                value={card._id}
                onChange={(e) => { setIdTouched(true); patch({ _id: e.target.value }); }}
                disabled={isLocked}
                placeholder="evt_… (auto from title)"
                className={admin.fieldInput}
                style={{ fontFamily: 'Menlo, Monaco, monospace', fontSize: 'var(--fs-body-xs)' }}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(card._id)}
                className={`${admin.btnSecondary} ${styles.idCopy}`}
                title="Copy"
              >⧉</button>
            </div>
          </div>

          <div>
            <div className={admin.fieldLabel}>Title</div>
            <input
              value={card.title}
              onChange={(e) => patch({ title: e.target.value })}
              className={admin.fieldInput}
            />
          </div>

          <div>
            <div className={admin.fieldLabel}>Description</div>
            <textarea
              value={card.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={3}
              className={admin.fieldInput}
            />
          </div>

          <div className={styles.twoCol}>
            <div>
              <div className={admin.fieldLabel}>Category</div>
              <input
                list="cat-suggest"
                value={card.category}
                onChange={(e) => patch({ category: e.target.value })}
                className={admin.fieldInput}
              />
              <datalist id="cat-suggest">
                {categorySuggestions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <div className={admin.fieldLabel}>Deck name</div>
              <input
                list="deck-suggest"
                value={card.deck_name ?? ''}
                onChange={(e) => patch({ deck_name: e.target.value || null })}
                placeholder="(orphan)"
                className={admin.fieldInput}
              />
              <datalist id="deck-suggest">
                {deckSuggestions.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>

          <div className={styles.twoCol}>
            <div>
              <div className={admin.fieldLabel}>Weight: {card.weight ?? 10}</div>
              <input
                type="range"
                min={0}
                max={100}
                value={card.weight ?? 10}
                onChange={(e) => patch({ weight: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div className={styles.checkRow}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={!!card.important}
                  onChange={(e) => patch({ important: e.target.checked })}
                />
                important (re-shuffle if ineligible)
              </label>
              <label className={styles.checkLabel} title="Wenn aus, wird die Karte nie vom Spiel gezogen — bleibt aber in der DB.">
                <input
                  type="checkbox"
                  checked={card.enabled !== false}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                />
                enabled (live in game)
              </label>
            </div>
          </div>

          <div>
            <div className={admin.fieldLabel}>image_url</div>
            <input
              value={card.image_url ?? ''}
              onChange={(e) => patch({ image_url: e.target.value || null })}
              placeholder="(optional)"
              className={admin.fieldInput}
            />
          </div>

          <details className={styles.detailsSummary}>
            <summary>Requirements (eligibility gate)</summary>
            <div className={styles.detailsBody}>
              <RequirementsEditor
                value={card.requires ?? {}}
                onChange={patchReq}
                flagSuggestions={flagSuggestions}
              />
            </div>
          </details>
        </section>

        {/* MIDDLE — Choices */}
        <section className={`${admin.panel} ${styles.section}`}>
          <ChoicesEditor
            value={card.choices}
            onChange={(v) => patch({ choices: v })}
            allCards={cards}
            flagSuggestions={flagSuggestions}
          />
        </section>

        {/* RIGHT — Preview & graph + validation */}
        <section className={styles.rightCol}>
          <div className={`${admin.panel} ${styles.previewSection}`}>
            <CardPreview card={card} />
          </div>

          <div className={`${admin.panel} ${styles.referrers}`}>
            <div>
              <div className={admin.fieldLabel}>Adds:</div>
              <div className={styles.refRow}>
                {card.choices.flatMap((ch) => ch.adds_to_deck ?? []).map((d, i) => {
                  const target = cards.find((c) => c._id === d.card_id);
                  return (
                    <Link
                      key={`${d.card_id}-${i}`}
                      to={`/admin/cards/${encodeURIComponent(d.card_id)}`}
                      className={styles.refLink}
                    >
                      <span className={admin.chip}>
                        {target ? target.title : <span className={styles.missing}>{d.card_id} (missing)</span>}
                      </span>
                    </Link>
                  );
                })}
                {card.choices.every((ch) => !(ch.adds_to_deck?.length)) && (
                  <span className={styles.empty}>(none)</span>
                )}
              </div>
            </div>
            <div>
              <div className={admin.fieldLabel}>Added by:</div>
              <div className={styles.refRow}>
                {referrers.map((r) => (
                  <Link
                    key={r._id}
                    to={`/admin/cards/${encodeURIComponent(r._id)}`}
                    className={styles.refLink}
                  ><span className={admin.chip}>{r.title}</span></Link>
                ))}
                {referrers.length === 0 && <span className={styles.empty}>(none)</span>}
              </div>
            </div>
          </div>

          <ValidationPanel issues={issues} />
        </section>
      </div>

      <Modal
        open={confirmDelete}
        title="Karte löschen?"
        body={`${card._id} wird unwiderruflich gelöscht.`}
        actions={[
          { label: 'Abbrechen', variant: 'ghost', onClick: () => setConfirmDelete(false) },
          { label: 'Löschen', variant: 'danger', onClick: () => void performDelete() },
        ]}
        onClose={() => setConfirmDelete(false)}
      />

      {pendingDiff && (
        <div className={styles.diffBackdrop} onClick={() => setPendingDiff(null)}>
          <div
            className={styles.diffDialog}
            role="dialog"
            aria-modal="true"
            aria-label="Änderungen prüfen"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.diffHeader}>
              <h2 className={styles.diffTitle}>
                {pendingDiff.length} Änderung{pendingDiff.length === 1 ? '' : 'en'}
              </h2>
              <div className={styles.diffSub}>{card._id}</div>
            </header>
            <ul className={styles.diffList}>
              {pendingDiff.map((d, i) => (
                <li key={`${d.path}-${i}`} className={styles.diffRow}>
                  <div className={styles.diffPath}>{d.path}</div>
                  <div className={styles.diffLabel}>{d.label}</div>
                  {(d.before !== undefined || d.after !== undefined) && (
                    <div className={styles.diffBeforeAfter}>
                      <span className={styles.diffBefore}>{d.before ?? '∅'}</span>
                      <span className={styles.diffArrow}>→</span>
                      <span className={styles.diffAfter}>{d.after ?? '∅'}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className={styles.diffActions}>
              <button
                type="button"
                className={admin.btnSecondary}
                onClick={() => setPendingDiff(null)}
              >Abbrechen</button>
              <button
                type="button"
                className={admin.btnPrimary}
                onClick={() => { setPendingDiff(null); void persist(); }}
              >Speichern</button>
            </div>
          </div>
        </div>
      )}

      <FlagInspector
        open={inspectorOpen}
        flag={inspectorFlag}
        cards={cards}
        onClose={() => setInspectorOpen(false)}
        onSelectFlag={(f) => setInspectorFlag(f || null)}
      />
    </div>
  );
}
