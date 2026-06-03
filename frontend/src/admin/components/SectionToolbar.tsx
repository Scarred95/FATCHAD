/**
 * Reusable per-section toolbar — title block on the left, controls on the right.
 *
 * Matches the screenshot's chrome: large display title + small count line,
 * then a row of controls (search · sort · view mode · import · export ·
 * primary "Neue …" button). Each section page composes the slots it needs;
 * unused props simply render nothing.
 *
 * Lives in admin/components because all admin sections will use it; nothing
 * here is Cards-specific.
 */
import type { ReactNode } from 'react';
import styles from './SectionToolbar.module.css';

export type ViewMode = 'tile' | 'list';

export interface SortOption {
  value: string;
  label: string;
}

interface Props {
  title: string;
  /** Singular count line shown beneath the title, e.g. "15 Karten". */
  count: number;
  noun: string;

  /** Optional search box. Hidden when `onSearch` is omitted. */
  search?: string;
  onSearch?: (q: string) => void;

  /** Optional sort dropdown. Hidden when no options. */
  sortOptions?: SortOption[];
  sort?: string;
  onSort?: (value: string) => void;

  /** Optional tile/list toggle. Hidden when `onViewMode` is omitted. */
  viewMode?: ViewMode;
  onViewMode?: (mode: ViewMode) => void;

  /** Drop-in slot for import/export icon buttons. */
  extras?: ReactNode;

  /** Primary action — usually "+ Neue …". Hidden when omitted. */
  primaryAction?: { label: string; onClick: () => void };
}

export function SectionToolbar({
  title, count, noun,
  search, onSearch,
  sortOptions, sort, onSort,
  viewMode, onViewMode,
  extras,
  primaryAction,
}: Props) {
  return (
    <header className={styles.toolbar}>
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.sub}>
          <b>{count}</b> {noun}
        </span>
      </div>

      <div className={styles.controls}>
        {onSearch && (
          <label className={styles.search}>
            <SearchIcon />
            <input
              type="text"
              value={search ?? ''}
              placeholder="suchen…"
              onChange={(e) => onSearch(e.target.value)}
            />
          </label>
        )}

        {sortOptions && sortOptions.length > 0 && onSort && (
          <select
            className={styles.select}
            value={sort ?? sortOptions[0]!.value}
            onChange={(e) => onSort(e.target.value)}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{`sortieren: ${o.label}`}</option>
            ))}
          </select>
        )}

        {onViewMode && (
          <div className={styles.segmented} role="group" aria-label="Ansicht">
            <button
              type="button"
              className={`${styles.segBtn} ${viewMode === 'tile' ? styles.segActive : ''}`}
              onClick={() => onViewMode('tile')}
              aria-pressed={viewMode === 'tile'}
              aria-label="Kacheln"
            >
              <GridIcon />
            </button>
            <button
              type="button"
              className={`${styles.segBtn} ${viewMode === 'list' ? styles.segActive : ''}`}
              onClick={() => onViewMode('list')}
              aria-pressed={viewMode === 'list'}
              aria-label="Liste"
            >
              <ListIcon />
            </button>
          </div>
        )}

        {extras}

        {primaryAction && (
          <button type="button" className={styles.primary} onClick={primaryAction.onClick}>
            <PlusIcon /> {primaryAction.label}
          </button>
        )}
      </div>
    </header>
  );
}

/* ─── Tiny inline icons (no extra deps) ───────────────────────────── */

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
