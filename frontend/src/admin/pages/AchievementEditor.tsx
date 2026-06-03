/**
 * Achievement editor — full edit of the server-side Achievement record.
 *
 * Two modes:
 *   - `new`  — POST /admin/achievements. id is editable.
 *   - `edit` — PUT  /admin/achievements/:id. id is immutable (changing
 *              would orphan UserAchievement progress rows).
 *
 * Fields: _id, name, description, points, criteria.description,
 * criteria.payload (raw JSON), unlocks_deck (from deck store list +
 * free text), enabled, image_url.
 *
 * `criteria.payload` is edited as raw JSON since the shape is opaque in
 * v1 — we parse + validate before save so the user gets a clear error
 * instead of a 422 from the backend.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminAchievementStore } from '../achievementStore';
import { useAdminDeckStore } from '../deckStore';
import { useAdminCardStore, flagInventoryOf } from '../store';
import { useAdminEndingStore } from '../endingStore';
import {
  PredicateBuilder,
  cleanPayload,
  predicateIssues,
  type Payload,
  type PredicateOptions,
} from '../components/PredicateBuilder';
import type { Achievement } from '../types';
import admin from '../admin.module.css';
import styles from './AchievementEditor.module.css';

interface Props {
  mode: 'new' | 'edit';
}

const ID_RE = /^[a-zA-Z0-9_-]+$/;

export function AchievementEditorPage({ mode }: Props) {
  const { id: routeId } = useParams<{ id: string }>();
  const nav = useNavigate();

  const achievements = useAdminAchievementStore((s) => s.achievements);
  const upsert       = useAdminAchievementStore((s) => s.upsertAchievement);
  const remove       = useAdminAchievementStore((s) => s.removeAchievement);
  const decks        = useAdminDeckStore((s) => s.decks);
  const cards        = useAdminCardStore((s) => s.cards);
  const endings      = useAdminEndingStore((s) => s.endings);

  const existing = useMemo(
    () => (mode === 'edit' && routeId)
      ? achievements.find((a) => a._id === routeId)
      : undefined,
    [mode, routeId, achievements],
  );

  const [id, setId]                 = useState<string>(mode === 'edit' ? (routeId ?? '') : '');
  const [name, setName]             = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [points, setPoints]         = useState<string>('0');
  const [critDesc, setCritDesc]     = useState<string>('');
  const [payload, setPayload]       = useState<Payload>({});
  const [payloadMode, setPayloadMode] = useState<'builder' | 'json'>('builder');
  const [jsonDraft, setJsonDraft]   = useState<string>('{}');
  const [jsonError, setJsonError]   = useState<string | null>(null);
  const [unlocksDeck, setUnlocks]   = useState<string>('');
  const [enabled, setEnabled]       = useState<boolean>(true);
  const [imageUrl, setImageUrl]     = useState<string>('');
  const [dirty, setDirty]           = useState<boolean>(false);
  const [busy, setBusy]             = useState<boolean>(false);

  // Hydrate from existing record once it lands.
  useEffect(() => {
    if (mode !== 'edit' || !existing) return;
    setId(existing._id);
    setName(existing.name);
    setDescription(existing.description ?? '');
    setPoints(String(existing.points ?? 0));
    setCritDesc(existing.criteria?.description ?? '');
    const ep = existing.criteria?.payload;
    setPayload(ep && typeof ep === 'object' && !Array.isArray(ep) ? (ep as Payload) : {});
    setPayloadMode('builder');
    setJsonError(null);
    setUnlocks(existing.unlocks_deck ?? '');
    setEnabled(existing.enabled !== false);
    setImageUrl(existing.image_url ?? '');
    setDirty(false);
  }, [mode, existing]);

  const idError = useMemo(() => {
    if (mode === 'edit') return null;
    if (!id.trim()) return 'ID darf nicht leer sein';
    if (!ID_RE.test(id)) return 'Nur A–Z, 0–9, _ und -';
    if (achievements.some((a) => a._id === id)) return 'Achievement existiert bereits';
    return null;
  }, [id, mode, achievements]);

  const nameError = !name.trim() ? 'Name erforderlich' : null;

  const pointsNum = Number(points);
  const pointsError = !Number.isFinite(pointsNum) || !Number.isInteger(pointsNum)
    ? 'Punkte müssen eine ganze Zahl sein' : null;

  // Autocomplete sources for the predicate builder, derived from the live
  // catalog stores (all preloaded at AdminLayout mount).
  const predicateOptions = useMemo<PredicateOptions>(() => ({
    flags: flagInventoryOf(cards),
    endings: endings.map((e) => ({ id: e._id, title: e.title })),
    cards: cards.map((c) => ({ id: c._id, title: c.title })),
    categories: [...new Set(cards.map((c) => c.category).filter(Boolean))].sort(),
    decks: decks.map((d) => d.name),
  }), [cards, endings, decks]);

  // In builder mode the payload object is always valid; only raw JSON editing
  // can produce a parse error that blocks save.
  const payloadError = payloadMode === 'json' ? jsonError : null;
  const payloadWarnings = useMemo(() => predicateIssues(payload), [payload]);
  const critDescError = !critDesc.trim() ? 'Kriterium-Beschreibung erforderlich' : null;

  const canSave = !idError && !nameError && !pointsError && !payloadError && !critDescError
    && !busy && (mode === 'new' || dirty);

  const onChange = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  const onPayloadChange = (p: Payload) => { setPayload(p); setDirty(true); };

  // Builder → JSON: serialize the canonical object into the editable draft.
  const enterJsonMode = () => {
    setJsonDraft(JSON.stringify(payload, null, 2));
    setJsonError(null);
    setPayloadMode('json');
  };

  // JSON edits parse into the canonical object live; a parse error keeps the
  // draft text but blocks save + the round-trip back to builder.
  const onJsonChange = (raw: string) => {
    setJsonDraft(raw);
    setDirty(true);
    const trimmed = raw.trim();
    if (trimmed === '') { setPayload({}); setJsonError(null); return; }
    try {
      const v = JSON.parse(trimmed) as unknown;
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        setJsonError('Payload muss ein JSON-Objekt sein');
        return;
      }
      setPayload(v as Payload);
      setJsonError(null);
    } catch (e) {
      setJsonError(`Ungültiges JSON: ${(e as Error).message}`);
    }
  };

  // JSON → builder: only allowed once the draft parses cleanly.
  const enterBuilderMode = () => {
    if (jsonError) return;
    setPayloadMode('builder');
  };

  const buildRecord = (): Achievement | null => {
    if (payloadError) return null;
    return {
      _id: id.trim(),
      name: name.trim(),
      description: description.trim(),
      criteria: {
        description: critDesc.trim(),
        payload: cleanPayload(payload),
      },
      points: pointsNum,
      unlocks_deck: unlocksDeck.trim() ? unlocksDeck.trim() : null,
      enabled,
      image_url: imageUrl.trim() ? imageUrl.trim() : null,
    };
  };

  const onSave = async () => {
    if (!canSave) return;
    const rec = buildRecord();
    if (!rec) return;
    setBusy(true);
    const ok = await upsert(rec);
    setBusy(false);
    if (ok) {
      setDirty(false);
      if (mode === 'new') {
        nav(`/admin/achievements/${encodeURIComponent(rec._id)}`, { replace: true });
      }
    }
  };

  const onDelete = async () => {
    if (mode !== 'edit' || !existing) return;
    if (!confirm(`Achievement "${existing.name}" wirklich löschen?`)) return;
    setBusy(true);
    const ok = await remove(existing._id);
    setBusy(false);
    if (ok) nav('/admin/achievements');
  };

  if (mode === 'edit' && !existing) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          Achievement <code>{routeId}</code> nicht gefunden.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>
            {mode === 'new' ? 'Neues Achievement' : (name || id)}
          </h1>
          <p className={styles.sub}>
            {mode === 'edit' && <>id: <code>{id}</code></>}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={admin.btnSecondary}
            onClick={() => nav('/admin/achievements')}
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
        <label className={styles.fieldLabel}>ID</label>
        <input
          className={styles.input}
          type="text"
          value={id}
          disabled={mode === 'edit'}
          onChange={(e) => onChange(setId)(e.target.value)}
          placeholder="z.B. first_win, ten_losses"
          spellCheck={false}
        />
        {idError && <div className={styles.fieldError}>{idError}</div>}
        {mode === 'edit' && (
          <div className={styles.fieldHint}>
            ID ist Primärschlüssel und kann nicht geändert werden — verweist
            auf bestehende UserAchievement-Datensätze.
          </div>
        )}
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Name</label>
        <input
          className={styles.input}
          type="text"
          value={name}
          onChange={(e) => onChange(setName)(e.target.value)}
          placeholder="Anzeigename im Spiel"
        />
        {nameError && <div className={styles.fieldError}>{nameError}</div>}
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Beschreibung</label>
        <textarea
          className={styles.textarea}
          rows={3}
          value={description}
          onChange={(e) => onChange(setDescription)(e.target.value)}
          placeholder="Spielertext — wird im Profil angezeigt."
        />
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Punkte</label>
        <input
          className={styles.input}
          type="number"
          value={points}
          onChange={(e) => onChange(setPoints)(e.target.value)}
        />
        {pointsError && <div className={styles.fieldError}>{pointsError}</div>}
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Kriterium — Beschreibung</label>
        <textarea
          className={styles.textarea}
          rows={2}
          value={critDesc}
          onChange={(e) => onChange(setCritDesc)(e.target.value)}
          placeholder='z.B. "Gewinne 3 Runs hintereinander mit Chaos &gt; 80"'
        />
        {critDescError && <div className={styles.fieldError}>{critDescError}</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.payloadHeader}>
          <label className={styles.fieldLabel}>Kriterium — Bedingung</label>
          {payloadMode === 'builder' ? (
            <button
              type="button"
              className={admin.btnSecondary}
              onClick={enterJsonMode}
            >Experte: JSON ansehen</button>
          ) : (
            <button
              type="button"
              className={admin.btnSecondary}
              disabled={!!jsonError}
              onClick={enterBuilderMode}
            >Zurück zum Builder</button>
          )}
        </div>

        {payloadMode === 'builder' ? (
          <PredicateBuilder
            value={payload}
            onChange={onPayloadChange}
            options={predicateOptions}
          />
        ) : (
          <textarea
            className={`${styles.textarea} ${styles.mono}`}
            rows={10}
            value={jsonDraft}
            onChange={(e) => onJsonChange(e.target.value)}
            spellCheck={false}
            placeholder='{ "type": "min_stat", "stat": "chaos", "value": 80 }'
          />
        )}

        {payloadError && <div className={styles.fieldError}>{payloadError}</div>}
        {payloadWarnings.length > 0 && (
          <div className={styles.fieldHint}>
            Unvollständig (feuert serverseitig nicht):
            <ul className={styles.warnList}>
              {payloadWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <div className={styles.fieldHint}>
          Bedingungstyp wählen und Felder ausfüllen. „Verknüpfung“
          (UND/ODER/NICHT) verschachtelt weitere Bedingungen.
        </div>
      </section>

      <section className={styles.section}>
        <label className={styles.fieldLabel}>Schaltet Deck frei</label>
        <input
          className={styles.input}
          type="text"
          list="deck-names"
          value={unlocksDeck}
          onChange={(e) => onChange(setUnlocks)(e.target.value)}
          placeholder="(leer = kein Deck-Unlock)"
          spellCheck={false}
        />
        <datalist id="deck-names">
          {decks.map((d) => <option key={d.name} value={d.name} />)}
        </datalist>
        <div className={styles.fieldHint}>
          Wenn gesetzt, schreibt der Backend-Handler beim Freischalten ein
          UNLOCK#DECK#-Item für den Spieler.
        </div>
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
          <span>aktiv (deaktivierte Achievements werden nicht ausgewertet)</span>
        </label>
      </section>

      {mode === 'edit' && (
        <section className={`${styles.section} ${styles.danger}`}>
          <label className={styles.fieldLabel}>Gefahrenzone</label>
          <div className={styles.dangerRow}>
            <div className={styles.dangerText}>
              Achievement löschen. UserAchievement-Progress bleibt orphan, bis
              ein Cleanup-Job ihn entfernt.
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
