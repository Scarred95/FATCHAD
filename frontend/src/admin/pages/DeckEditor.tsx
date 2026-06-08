/**
 * Deck editor — edit the full server-side Deck record.
 *
 * Two modes:
 *   - `new`   — POST /admin/decks. `?name=` query param is honoured so the
 *               "anlegen" button next to a shadow row can pre-fill the
 *               deck_name already used by the cards.
 *   - `edit`  — PUT  /admin/decks/:name. Name itself is immutable here
 *               (changing it would orphan every card pointing at it; the
 *               backend doesn't support rename in one shot).
 *
 * Fields: name (only when new), description, image_url, enabled, unlock_rule,
 * removes_endings, starting_card_id. Unlock rule: a radio between "Standard"
 * (kind=default) and "Achievement" (kind=achievement, requires
 * achievement_id). removes_endings is an autocomplete chip list of endings
 * this deck strips from a run when selected. starting_card_id is the story
 * card shuffled into the run's start deck when this deck is picked.
 *
 * Pattern matches CardEditor / EndingEditor: dirty tracking, blocked save
 * while invalid, danger zone with delete (edit mode only).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAdminDeckStore } from '../deckStore';
import { useAdminCardStore, cardsInDeck } from '../store';
import { useAdminEndingStore } from '../endingStore';
import type { DeckUnlockRule } from '../types';
import { TagInput } from '../components/TagInput';
import { CardPicker } from '../components/CardPicker';
import admin from '../admin.module.css';
import styles from './DeckEditor.module.css';

interface Props {
  mode: 'new' | 'edit';
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function DeckEditorPage({ mode }: Props) {
  const { name: routeName } = useParams<{ name: string }>();
  const [params] = useSearchParams();
  const nav = useNavigate();

  const decks       = useAdminDeckStore((s) => s.decks);
  const createDeck  = useAdminDeckStore((s) => s.createDeck);
  const replaceDeck = useAdminDeckStore((s) => s.replaceDeck);
  const removeDeck  = useAdminDeckStore((s) => s.removeDeck);
  const cards       = useAdminCardStore((s) => s.cards);
  const endings     = useAdminEndingStore((s) => s.endings);

  // Seed form state from URL/existing record.
  const existing = useMemo(
    () => (mode === 'edit' && routeName)
      ? decks.find((d) => d.name === routeName)
      : undefined,
    [mode, routeName, decks],
  );

  const [name, setName]               = useState<string>(
    mode === 'edit' ? (routeName ?? '') : (params.get('name') ?? ''),
  );
  const [description, setDescription] = useState<string>('');
  const [enabled, setEnabled]         = useState<boolean>(true);
  const [unlockKind, setUnlockKind]   = useState<DeckUnlockRule['kind']>('default');
  const [achievementId, setAchId]     = useState<string>('');
  const [removesEndings, setRemoves]  = useState<string[]>([]);
  const [startingCardId, setStartId]  = useState<string>('');
  const [imageUrl, setImageUrl]       = useState<string>('');
  // CardPicker seeds its text box only at mount; bump this on hydrate so it
  // remounts once with the loaded starting card instead of rendering blank.
  const [cardPickerKey, setCardPickerKey] = useState<number>(0);
  const [dirty, setDirty]             = useState<boolean>(false);
  const [busy, setBusy]               = useState<boolean>(false);

  // When the record arrives (edit mode after store load), hydrate.
  useEffect(() => {
    if (mode !== 'edit') return;
    if (!existing) return;
    setName(existing.name);
    setDescription(existing.description ?? '');
    setEnabled(existing.enabled !== false);
    setUnlockKind(existing.unlock_rule?.kind ?? 'default');
    setAchId(existing.unlock_rule?.achievement_id ?? '');
    setRemoves(existing.removes_endings ?? []);
    setStartId(existing.starting_card_id ?? '');
    setImageUrl(existing.image_url ?? '');
    setCardPickerKey((k) => k + 1);
    setDirty(false);
  }, [mode, existing]);

  const cardsInThisDeck = useMemo(
    () => cardsInDeck(cards, name),
    [cards, name],
  );

  const nameError = useMemo(() => {
    if (mode === 'edit') return null;
    if (!name.trim()) return 'Name darf nicht leer sein';
    if (!NAME_RE.test(name)) return 'Nur A–Z, 0–9, _ und -';
    if (decks.some((d) => d.name === name)) return 'Deck existiert bereits';
    return null;
  }, [name, mode, decks]);

  const unlockError = unlockKind === 'achievement' && !achievementId.trim()
    ? 'Achievement-ID erforderlich' : null;

  const canSave = !nameError && !unlockError && !busy && (mode === 'new' || dirty);

  const onChange = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  // Endings sorted for a stable autocomplete; deck-removal also drops orphan
  // ids that no longer exist as endings so the saved list can be cleaned up by
  // re-saving.
  const sortedEndings = useMemo(
    () => [...endings].sort((a, b) => a._id.localeCompare(b._id)),
    [endings],
  );
  const endingIdSuggestions = useMemo(
    () => sortedEndings.map((e) => e._id),
    [sortedEndings],
  );
  const orphanRemovals = useMemo(
    () => removesEndings.filter((id) => !endings.some((e) => e._id === id)),
    [removesEndings, endings],
  );

  const buildUnlock = (): DeckUnlockRule => unlockKind === 'achievement'
    ? { kind: 'achievement', achievement_id: achievementId.trim() }
    : { kind: 'default' };

  const onSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (mode === 'new') {
        const created = await createDeck({
          name: name.trim(),
          description: description.trim(),
          enabled,
          unlock_rule: buildUnlock(),
          removes_endings: removesEndings,
          starting_card_id: startingCardId || null,
          image_url: imageUrl.trim() || null,
        });
        if (created) {
          setDirty(false);
          nav(`/admin/decks-edit/${encodeURIComponent(created.name)}`, { replace: true });
        }
      } else {
        const saved = await replaceDeck(name, {
          description: description.trim(),
          enabled,
          unlock_rule: buildUnlock(),
          removes_endings: removesEndings,
          starting_card_id: startingCardId || null,
          image_url: imageUrl.trim() || null,
        });
        if (saved) setDirty(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (mode !== 'edit' || !existing) return;
    const usedBy = cardsInThisDeck.length;
    const msg = usedBy > 0
      ? `Deck "${existing.name}" wirklich löschen? ${usedBy} Karte(n) zeigen darauf und werden zu Schatten-Decks.`
      : `Deck "${existing.name}" wirklich löschen?`;
    if (!confirm(msg)) return;
    setBusy(true);
    const ok = await removeDeck(existing.name);
    setBusy(false);
    if (ok) nav('/admin');
  };

  // Edit mode but the record hasn't loaded yet (or doesn't exist).
  if (mode === 'edit' && !existing) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          Deck <code>{routeName}</code> nicht gefunden.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>
            {mode === 'new' ? 'Neues Deck' : name}
          </h1>
          <p className={styles.sub}>
            {mode === 'edit' && existing?.updated_at && (
              <>zuletzt geändert {new Date(existing.updated_at).toLocaleString()}</>
            )}
            {cardsInThisDeck.length > 0 && (
              <> · {cardsInThisDeck.length} Karte(n) im Deck</>
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={admin.btnSecondary}
            onClick={() => nav('/admin')}
          >Zurück</button>
          <button
            type="button"
            className={admin.btnPrimary}
            disabled={!canSave}
            onClick={() => void onSave()}
          >
            {busy ? 'Speichern…' : mode === 'new' ? 'Anlegen' : 'Speichern'}
          </button>
        </div>
      </header>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Name</label>
        <input
          className={styles.input}
          type="text"
          value={name}
          disabled={mode === 'edit'}
          onChange={(e) => onChange(setName)(e.target.value)}
          placeholder="z.B. tutorial, hauptstadt, sommer-event"
          spellCheck={false}
        />
        {nameError && <div className={styles.fieldError}>{nameError}</div>}
        {mode === 'edit' && (
          <div className={styles.fieldHint}>
            Name ist Primärschlüssel. Zum Umbenennen ein neues Deck anlegen
            und Karten umhängen.
          </div>
        )}
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Beschreibung</label>
        <textarea
          className={styles.textarea}
          rows={4}
          value={description}
          onChange={(e) => onChange(setDescription)(e.target.value)}
          placeholder="Kurze Notiz wofür dieses Deck da ist."
        />
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Bild-URL</label>
        <input
          className={styles.input}
          type="text"
          value={imageUrl}
          onChange={(e) => onChange(setImageUrl)(e.target.value)}
          placeholder="(optional)"
          spellCheck={false}
        />
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Status</label>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(setEnabled)(e.target.checked)}
          />
          <span>aktiv (deaktivierte Decks fließen nicht ins Spiel)</span>
        </label>
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Freischaltung</label>
        <div className={styles.radioRow}>
          <label className={styles.radio}>
            <input
              type="radio"
              name="unlock"
              checked={unlockKind === 'default'}
              onChange={() => onChange(setUnlockKind)('default')}
            />
            <span>Standard — jeder Spieler hat es</span>
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="unlock"
              checked={unlockKind === 'achievement'}
              onChange={() => onChange(setUnlockKind)('achievement')}
            />
            <span>Via Achievement</span>
          </label>
        </div>
        {unlockKind === 'achievement' && (
          <div className={styles.subField}>
            <input
              className={styles.input}
              type="text"
              value={achievementId}
              onChange={(e) => onChange(setAchId)(e.target.value)}
              placeholder="achievement_id"
              spellCheck={false}
            />
            {unlockError && <div className={styles.fieldError}>{unlockError}</div>}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Endings entfernen</label>
        <div className={styles.fieldHint}>
          Endings, die dieses Deck aus einem Run streicht — auch globale oder
          Deck-Defaults. Greift sobald das Deck gewählt ist.
        </div>
        {sortedEndings.length === 0 ? (
          <div className={styles.fieldHint}>Keine Endings geladen.</div>
        ) : (
          <TagInput
            value={removesEndings}
            onChange={(v) => { setRemoves(v); setDirty(true); }}
            suggestions={endingIdSuggestions}
            placeholder="Ending-ID tippen, dann Enter…"
          />
        )}
        {orphanRemovals.length > 0 && (
          <div className={styles.fieldError}>
            Unbekannte Ending-IDs (werden beim Speichern beibehalten):{' '}
            {orphanRemovals.join(', ')}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Startkarte</label>
        <div className={styles.fieldHint}>
          Story-Karte, die beim Wählen dieses Decks in das Start-Deck gemischt
          wird — der Run öffnet damit (die Karte verkettet sich dann via
          adds_to_deck). Leer = kein eigener Auftakt.
        </div>
        <CardPicker
          key={cardPickerKey}
          value={startingCardId}
          onChange={(id) => onChange(setStartId)(id)}
          cards={cards}
          placeholder="card_id (optional)"
        />
      </section>

      {mode === 'edit' && (
        <section className={`${styles.section} ${styles.danger}`}>
          <label className={styles.fieldLabel}>Gefahrenzone</label>
          <div className={styles.dangerRow}>
            <div className={styles.dangerText}>
              Deck löschen. Karten behalten ihren <code>deck_name</code> und
              tauchen danach als Schatten-Decks auf.
            </div>
            <button
              type="button"
              className={admin.btnDanger}
              disabled={busy}
              onClick={() => void onDelete()}
            >Löschen</button>
          </div>
        </section>
      )}
    </div>
  );
}
