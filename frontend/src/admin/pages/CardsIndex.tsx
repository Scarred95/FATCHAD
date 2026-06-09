/**
 * Cards section — top-level catalogue browser (new in the redesign).
 *
 * Mirrors the screenshot: section toolbar (search · sort · view mode · import
 * · export · "+ Neue Karte"), two filter rows (Kategorie / Deck) plus an
 * include-disabled toggle, then either a tile grid or a list table.
 *
 * No editing happens here — each tile / row links to the existing CardEditor
 * page (untouched). Enabling/disabling a card from the tile uses the same
 * optimistic store action the DeckDetail page already uses.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminCardStore, deckNamesOf, categoryNamesOf, isInDeck } from '../store';
import { ORPHAN_DECK } from '../types';
import { useAdminEndingStore } from '../endingStore';
import { validateCard } from '../utils/validate';
import { SectionToolbar, type ViewMode } from '../components/SectionToolbar';
import { CardTile } from '../components/CardTile';
import { Toggle } from '../components/Toggle';
import { categoryMeta, KNOWN_CATEGORIES } from '../components/categoryMeta';
import { ImportExportBar } from '../components/ImportExportBar';
import type { Card } from '../types';
import styles from './CardsIndex.module.css';

type SortKey = 'title' | 'weight' | 'choices' | 'id';

const SORT_OPTIONS = [
  { value: 'title', label: 'A–Z' },
  { value: 'weight', label: 'Gewicht' },
  { value: 'choices', label: 'Optionen' },
  { value: 'id', label: 'ID' },
];

export function CardsIndex() {
  const cards = useAdminCardStore((s) => s.cards);
  const endings = useAdminEndingStore((s) => s.endings);
  const setCardEnabled = useAdminCardStore((s) => s.setCardEnabled);
  const nav = useNavigate();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('title');
  const [viewMode, setViewMode] = useState<ViewMode>('tile');
  const [cats, setCats] = useState<string[]>([]);
  const [decks, setDecks] = useState<string[]>([]);
  const [includeDisabled, setIncludeDisabled] = useState(true);

  const knownEndingIds = useMemo(
    () => new Set(endings.map((e) => e._id)),
    [endings],
  );

  // Categories shown in the filter row = the known canonical set ∪ anything
  // actually present in the data (so unknown user-added categories still
  // appear and can be filtered on).
  const categoryChips = useMemo(() => {
    const present = new Set(categoryNamesOf(cards));
    const out: string[] = [];
    for (const k of KNOWN_CATEGORIES) if (present.has(k)) out.push(k);
    for (const k of present) if (!KNOWN_CATEGORIES.includes(k)) out.push(k);
    return out;
  }, [cards]);

  const deckChips = useMemo(() => deckNamesOf(cards), [cards]);
  const hasOrphans = useMemo(() => cards.some((c) => !c.deck_name), [cards]);

  const issuesByCard = useMemo(() => {
    const map = new Map<string, ReturnType<typeof validateCard>>();
    for (const c of cards) map.set(c._id, validateCard(c, cards, knownEndingIds));
    return map;
  }, [cards, knownEndingIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (c: Card) => {
      if (q && ![c.title, c._id, c.description, c.deck_name ?? '']
        .some((s) => (s ?? '').toLowerCase().includes(q))) return false;
      if (cats.length > 0 && !cats.includes(c.category)) return false;
      if (decks.length > 0 && !decks.some((d) => isInDeck(c, d))) return false;
      if (!includeDisabled && c.enabled === false) return false;
      return true;
    };
    const list = cards.filter(matches);
    list.sort((a, b) => {
      if (sort === 'title')   return a.title.localeCompare(b.title);
      if (sort === 'weight')  return (b.weight ?? 10) - (a.weight ?? 10);
      if (sort === 'choices') return (b.choices?.length ?? 0) - (a.choices?.length ?? 0);
      return a._id.localeCompare(b._id);
    });
    return list;
  }, [cards, search, cats, decks, includeDisabled, sort]);

  const toggleCat = (c: string) =>
    setCats((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const toggleDeck = (d: string) =>
    setDecks((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  return (
    <div className={styles.page}>
      <SectionToolbar
        title="Cards"
        count={cards.length}
        noun="Karten"
        search={search} onSearch={setSearch}
        sortOptions={SORT_OPTIONS}
        sort={sort} onSort={(v) => setSort(v as SortKey)}
        viewMode={viewMode} onViewMode={setViewMode}
        extras={<ImportExportBar />}
        primaryAction={{ label: 'Neue Karte', onClick: () => nav('/admin/cards/new') }}
      />

      {/* ─── Filter row: categories ──────────────────────────────── */}
      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>Kategorie</span>
        {categoryChips.map((c) => {
          const m = categoryMeta(c);
          const active = cats.includes(c);
          return (
            <button
              key={c}
              type="button"
              className={`${styles.fChip} ${active ? styles.fChipOn : ''}`}
              style={{ '--cat-color': m.color } as React.CSSProperties}
              onClick={() => toggleCat(c)}
            >
              <span className={styles.fChipDot} />
              {m.label}
            </button>
          );
        })}
        <span className={styles.spacer} />
        <button
          type="button"
          className={`${styles.fChip} ${!includeDisabled ? styles.fChipOn : ''}`}
          onClick={() => setIncludeDisabled((v) => !v)}
        >
          {includeDisabled ? 'alle' : 'nur aktiv'}
        </button>
      </div>

      {/* ─── Filter row: decks ───────────────────────────────────── */}
      {(deckChips.length > 0 || hasOrphans) && (
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Deck</span>
          {deckChips.map((d) => {
            const active = decks.includes(d);
            return (
              <button
                key={d}
                type="button"
                className={`${styles.fChip} ${styles.deckChip} ${active ? styles.fChipOn : ''}`}
                onClick={() => toggleDeck(d)}
              >
                ▦ {d}
              </button>
            );
          })}
          {hasOrphans && (
            <button
              type="button"
              className={`${styles.fChip} ${styles.deckChip} ${decks.includes(ORPHAN_DECK) ? styles.fChipOn : ''}`}
              onClick={() => toggleDeck(ORPHAN_DECK)}
            >
              ▦ Ohne Deck
            </button>
          )}
          {(cats.length > 0 || decks.length > 0) && (
            <>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.fChip}
                onClick={() => { setCats([]); setDecks([]); }}
              >
                ✕ zurücksetzen
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── Content ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyGlyph}>—</div>
          <h2 className={styles.emptyTitle}>Keine Karten</h2>
          <p className={styles.emptySub}>Kein Treffer für diesen Filter.</p>
        </div>
      ) : viewMode === 'tile' ? (
        <div className={styles.tileGrid}>
          {filtered.map((c) => (
            <CardTile
              key={c._id}
              card={c}
              issues={issuesByCard.get(c._id) ?? []}
              onToggleEnabled={() => void setCardEnabled(c._id, c.enabled === false)}
            />
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Karte</th>
              <th>Kategorie</th>
              <th>Deck</th>
              <th className={styles.num}>Gewicht</th>
              <th className={styles.num}>Optionen</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const issues = issuesByCard.get(c._id) ?? [];
              const errors = issues.filter((i) => i.level === 'error').length;
              const warnings = issues.filter((i) => i.level === 'warning').length;
              const m = categoryMeta(c.category);
              return (
                <tr key={c._id} className={c.enabled === false ? styles.rowOff : ''}>
                  <td>
                    <Toggle
                      on={c.enabled !== false}
                      onToggle={() => void setCardEnabled(c._id, c.enabled === false)}
                    />
                  </td>
                  <td>
                    <Link to={`/admin/cards/${encodeURIComponent(c._id)}`} className={styles.rowTitle}>
                      {c.title}
                      {c.important && <span className={styles.rowStar}> ★</span>}
                    </Link>
                    <div className={styles.rowSub}>{c._id}</div>
                  </td>
                  <td>
                    <span
                      className={styles.fChip}
                      style={{ '--cat-color': m.color } as React.CSSProperties}
                    >
                      <span className={styles.fChipDot} />
                      {m.label}
                    </span>
                  </td>
                  <td className={styles.mono}>{c.deck_name ?? '—'}</td>
                  <td className={styles.num}>{c.weight ?? 10}</td>
                  <td className={styles.num}>{c.choices?.length ?? 0}</td>
                  <td>
                    {errors > 0 ? (
                      <span className={styles.errChip}>Fehler</span>
                    ) : warnings > 0 ? (
                      <span className={styles.warnChip}>Warnung</span>
                    ) : (
                      <span className={styles.okChip}>ok</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
