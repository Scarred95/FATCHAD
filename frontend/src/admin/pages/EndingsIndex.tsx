/**
 * Endings section — top-level browser.
 *
 *   • SectionToolbar with search · sort · view mode · import/export · "+ Neues Ending"
 *   • Filter chips: default / quest / nur aktiv
 *   • Tile or list view
 *
 * Tile/row click → EndingEditor (unchanged). Default + enabled flips use
 * the optimistic store actions; both are reversible from inside the tile.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminEndingStore, referencesToEnding } from '../endingStore';
import { useAdminCardStore } from '../store';
import { SectionToolbar, type ViewMode } from '../components/SectionToolbar';
import { EndingTile } from '../components/EndingTile';
import { EndingsImportExportBar } from '../components/EndingsImportExportBar';
import { Toggle } from '../components/Toggle';
import type { Ending } from '../types';
import styles from './EndingsIndex.module.css';

type SortKey = 'priority' | 'title' | 'id' | 'refs';
type KindFilter = 'all' | 'default' | 'quest';

const SORT_OPTIONS = [
  { value: 'priority', label: 'Priorität' },
  { value: 'title',    label: 'A–Z' },
  { value: 'id',       label: 'ID' },
  { value: 'refs',     label: 'Referenzen' },
];

function totalRefs(id: string, cards: Parameters<typeof referencesToEnding>[1]): number {
  const c = referencesToEnding(id, cards);
  return c.triggers + c.unlocks + c.removes;
}

export function EndingsIndex() {
  const nav = useNavigate();
  const endings = useAdminEndingStore((s) => s.endings);
  const setEndingEnabled = useAdminEndingStore((s) => s.setEndingEnabled);
  const setEndingDefault = useAdminEndingStore((s) => s.setEndingDefault);
  const cards = useAdminCardStore((s) => s.cards);

  const [search, setSearch]     = useState('');
  const [sort, setSort]         = useState<SortKey>('priority');
  const [viewMode, setViewMode] = useState<ViewMode>('tile');
  const [kind, setKind]         = useState<KindFilter>('all');
  const [includeDisabled, setIncludeDisabled] = useState(true);

  const refsById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of endings) m.set(e._id, totalRefs(e._id, cards));
    return m;
  }, [endings, cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (e: Ending) => {
      if (q && ![e.title, e._id, e.description ?? '']
        .some((s) => s.toLowerCase().includes(q))) return false;
      if (kind === 'default' && !e.default) return false;
      if (kind === 'quest'   &&  e.default) return false;
      if (!includeDisabled && e.enabled === false) return false;
      return true;
    };
    const list = endings.filter(matches);
    list.sort((a, b) => {
      if (sort === 'priority') {
        return (a.priority ?? 100) - (b.priority ?? 100) || a._id.localeCompare(b._id);
      }
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sort === 'refs')  return (refsById.get(b._id) ?? 0) - (refsById.get(a._id) ?? 0);
      return a._id.localeCompare(b._id);
    });
    return list;
  }, [endings, search, kind, includeDisabled, sort, refsById]);

  const counts = useMemo(() => ({
    all: endings.length,
    default: endings.filter((e) => e.default).length,
    quest: endings.filter((e) => !e.default).length,
  }), [endings]);

  return (
    <div className={styles.page}>
      <SectionToolbar
        title="Endings"
        count={endings.length}
        noun="Endings"
        search={search} onSearch={setSearch}
        sortOptions={SORT_OPTIONS}
        sort={sort} onSort={(v) => setSort(v as SortKey)}
        viewMode={viewMode} onViewMode={setViewMode}
        extras={<EndingsImportExportBar />}
        primaryAction={{ label: 'Neues Ending', onClick: () => nav('/admin/endings/new') }}
      />

      <div className={styles.filterRow}>
        <span className={styles.filterLabel}>Typ</span>
        <button
          type="button"
          className={`${styles.fChip} ${kind === 'all' ? styles.fChipOn : ''}`}
          onClick={() => setKind('all')}
        >alle ({counts.all})</button>
        <button
          type="button"
          className={`${styles.fChip} ${kind === 'default' ? styles.fChipOn : ''}`}
          onClick={() => setKind('default')}
        >default ({counts.default})</button>
        <button
          type="button"
          className={`${styles.fChip} ${kind === 'quest' ? styles.fChipOn : ''}`}
          onClick={() => setKind('quest')}
        >quest ({counts.quest})</button>
        <span className={styles.spacer} />
        <button
          type="button"
          className={`${styles.fChip} ${!includeDisabled ? styles.fChipOn : ''}`}
          onClick={() => setIncludeDisabled((v) => !v)}
        >
          {includeDisabled ? 'alle Status' : 'nur aktiv'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyGlyph}>—</div>
          <h2 className={styles.emptyTitle}>Keine Endings</h2>
          <p className={styles.emptySub}>
            {endings.length === 0
              ? 'Noch nichts angelegt.'
              : 'Kein Ending passt zum Filter.'}
          </p>
        </div>
      ) : viewMode === 'tile' ? (
        <div className={styles.tileGrid}>
          {filtered.map((e) => (
            <EndingTile
              key={e._id}
              ending={e}
              refCount={refsById.get(e._id) ?? 0}
              onToggleEnabled={() => void setEndingEnabled(e._id, e.enabled === false)}
              onToggleDefault={() => void setEndingDefault(e._id, !e.default)}
            />
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Ending</th>
              <th>Typ</th>
              <th className={styles.num}>Prio</th>
              <th className={styles.num}>Refs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e._id} className={e.enabled === false ? styles.rowOff : ''}>
                <td>
                  <Toggle
                    on={e.enabled !== false}
                    onToggle={() => void setEndingEnabled(e._id, e.enabled === false)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.rowTitle}
                    onClick={() => nav(`/admin/endings/${encodeURIComponent(e._id)}`)}
                  >
                    {e.title || '(ohne Titel)'}
                  </button>
                  <div className={styles.rowSub}>{e._id}</div>
                </td>
                <td>
                  <button
                    type="button"
                    className={e.default ? styles.kindDefault : styles.kindQuest}
                    onClick={() => void setEndingDefault(e._id, !e.default)}
                  >
                    {e.default ? 'default' : 'quest'}
                  </button>
                </td>
                <td className={styles.num}>{e.priority ?? 100}</td>
                <td className={styles.num}>{refsById.get(e._id) ?? 0}</td>
                <td>
                  <button
                    type="button"
                    className={styles.editAction}
                    onClick={() => nav(`/admin/endings/${encodeURIComponent(e._id)}`)}
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
