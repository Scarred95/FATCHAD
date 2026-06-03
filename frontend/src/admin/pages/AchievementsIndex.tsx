/**
 * Achievements section — top-level browser.
 *
 *   • SectionToolbar with search · sort · view mode · "+ Neues Achievement"
 *   • Filter row: enabled toggle (alle / nur aktiv) + deck filter chips
 *     (decks that any achievement unlocks)
 *   • Tile or list view
 *
 * Tile/row click → AchievementEditor; toggle uses the optimistic
 * `setAchievementEnabled` action.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAchievementStore } from '../achievementStore';
import { useAdminDeckStore } from '../deckStore';
import { SectionToolbar, type ViewMode } from '../components/SectionToolbar';
import { AchievementTile } from '../components/AchievementTile';
import { Toggle } from '../components/Toggle';
import type { Achievement } from '../types';
import styles from './AchievementsIndex.module.css';

type SortKey = 'name' | 'points' | 'id';

const SORT_OPTIONS = [
  { value: 'name',   label: 'A–Z' },
  { value: 'points', label: 'Punkte' },
  { value: 'id',     label: 'ID' },
];

export function AchievementsIndex() {
  const achievements = useAdminAchievementStore((s) => s.achievements);
  const setAchievementEnabled = useAdminAchievementStore((s) => s.setAchievementEnabled);
  const decks = useAdminDeckStore((s) => s.decks);
  const nav = useNavigate();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('tile');
  const [unlockFilter, setUnlockFilter] = useState<string[]>([]);
  const [includeDisabled, setIncludeDisabled] = useState(true);

  // Deck-unlock chips = decks that at least one achievement unlocks, plus
  // any extra deck_name values referenced but not yet present as a record.
  const unlockChips = useMemo(() => {
    const present = new Set<string>();
    for (const a of achievements) if (a.unlocks_deck) present.add(a.unlocks_deck);
    const known = new Set(decks.map((d) => d.name));
    const ordered: string[] = [];
    for (const d of decks) if (present.has(d.name)) ordered.push(d.name);
    for (const p of present) if (!known.has(p)) ordered.push(p);
    return ordered;
  }, [achievements, decks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (a: Achievement) => {
      if (q) {
        const hay = [a.name, a._id, a.description ?? '', a.criteria?.description ?? '']
          .some((s) => s.toLowerCase().includes(q));
        if (!hay) return false;
      }
      if (unlockFilter.length > 0) {
        if (!a.unlocks_deck || !unlockFilter.includes(a.unlocks_deck)) return false;
      }
      if (!includeDisabled && a.enabled === false) return false;
      return true;
    };
    const list = achievements.filter(matches);
    list.sort((a, b) => {
      if (sort === 'name')   return a.name.localeCompare(b.name);
      if (sort === 'points') return (b.points ?? 0) - (a.points ?? 0);
      return a._id.localeCompare(b._id);
    });
    return list;
  }, [achievements, search, sort, unlockFilter, includeDisabled]);

  const toggleUnlock = (d: string) =>
    setUnlockFilter((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  return (
    <div className={styles.page}>
      <SectionToolbar
        title="Achievements"
        count={achievements.length}
        noun="Achievements"
        search={search} onSearch={setSearch}
        sortOptions={SORT_OPTIONS}
        sort={sort} onSort={(v) => setSort(v as SortKey)}
        viewMode={viewMode} onViewMode={setViewMode}
        primaryAction={{ label: 'Neues Achievement', onClick: () => nav('/admin/achievements/new') }}
      />

      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>Schaltet Deck frei</span>
        {unlockChips.length === 0 ? (
          <span className={styles.filterLabel}>—</span>
        ) : (
          unlockChips.map((d) => {
            const active = unlockFilter.includes(d);
            return (
              <button
                key={d}
                type="button"
                className={`${styles.fChip} ${active ? styles.fChipOn : ''}`}
                onClick={() => toggleUnlock(d)}
              >
                ↦ {d}
              </button>
            );
          })
        )}
        <span className={styles.spacer} />
        <button
          type="button"
          className={`${styles.fChip} ${!includeDisabled ? styles.fChipOn : ''}`}
          onClick={() => setIncludeDisabled((v) => !v)}
        >
          {includeDisabled ? 'alle' : 'nur aktiv'}
        </button>
        {unlockFilter.length > 0 && (
          <button
            type="button"
            className={styles.fChip}
            onClick={() => setUnlockFilter([])}
          >✕ zurücksetzen</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyGlyph}>—</div>
          <h2 className={styles.emptyTitle}>Keine Achievements</h2>
          <p className={styles.emptySub}>Noch nichts angelegt oder nichts passt zum Filter.</p>
        </div>
      ) : viewMode === 'tile' ? (
        <div className={styles.tileGrid}>
          {filtered.map((a) => (
            <AchievementTile
              key={a._id}
              ach={a}
              onToggleEnabled={() => void setAchievementEnabled(a._id, a.enabled === false)}
            />
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Achievement</th>
              <th>Kriterium</th>
              <th>Schaltet Deck</th>
              <th className={styles.num}>Punkte</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a._id} className={a.enabled === false ? styles.rowOff : ''}>
                <td>
                  <Toggle
                    on={a.enabled !== false}
                    onToggle={() => void setAchievementEnabled(a._id, a.enabled === false)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.rowTitle}
                    onClick={() => nav(`/admin/achievements/${encodeURIComponent(a._id)}`)}
                  >
                    {a.name}
                  </button>
                  <div className={styles.rowSub}>{a._id}</div>
                </td>
                <td className={styles.critCell}>{a.criteria?.description || '—'}</td>
                <td className={styles.mono}>{a.unlocks_deck ?? '—'}</td>
                <td className={styles.num}>{a.points ?? 0}</td>
                <td>
                  <button
                    type="button"
                    className={styles.editAction}
                    onClick={() => nav(`/admin/achievements/${encodeURIComponent(a._id)}`)}
                  >bearbeiten</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
