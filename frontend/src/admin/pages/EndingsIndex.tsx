import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminEndingStore, referencesToEnding } from '../endingStore';
import { useAdminCardStore } from '../store';
import { EndingsImportExportBar } from '../components/EndingsImportExportBar';
import type { Ending, StatKey } from '../types';
import { STAT_COLORS, STAT_LABELS, STAT_KEYS } from '../types';
import admin from '../admin.module.css';
import styles from './EndingsIndex.module.css';

type Filter = 'all' | 'default' | 'nondefault' | 'disabled';

/**
 * Endings as a card grid. Each card surfaces the requirements (stats + flags)
 * at a glance so authors can scan the catalogue without opening the editor.
 */
export function EndingsIndex() {
  const nav = useNavigate();
  const endings = useAdminEndingStore((s) => s.endings);
  const cards = useAdminCardStore((s) => s.cards);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const arr = endings.slice();
    arr.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a._id.localeCompare(b._id));
    if (filter === 'default') return arr.filter((e) => e.default);
    if (filter === 'nondefault') return arr.filter((e) => !e.default);
    if (filter === 'disabled') return arr.filter((e) => e.enabled === false);
    return arr;
  }, [endings, filter]);

  const counts = useMemo(() => ({
    all: endings.length,
    default: endings.filter((e) => e.default).length,
    nondefault: endings.filter((e) => !e.default).length,
    disabled: endings.filter((e) => e.enabled === false).length,
  }), [endings]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Endings</h1>
          <p className={styles.sub}>
            {endings.length} Ending{endings.length === 1 ? '' : 's'} · klick zum Bearbeiten
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={admin.btnPrimary}
            onClick={() => nav('/admin/endings/new')}
          >
            + Neues Ending
          </button>
        </div>
      </header>

      <EndingsImportExportBar />

      <div className={styles.filters}>
        <FilterChip label={`Alle (${counts.all})`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label={`Default (${counts.default})`} active={filter === 'default'} onClick={() => setFilter('default')} />
        <FilterChip label={`Nicht-default (${counts.nondefault})`} active={filter === 'nondefault'} onClick={() => setFilter('nondefault')} />
        <FilterChip label={`Deaktiviert (${counts.disabled})`} active={filter === 'disabled'} onClick={() => setFilter('disabled')} />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {endings.length === 0
            ? 'Noch keine Endings vorhanden.'
            : 'Kein Ending passt zum Filter.'}
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((e) => (
            <EndingCard
              key={e._id}
              ending={e}
              refCount={totalRefs(e._id, cards)}
              onClick={() => nav(`/admin/endings/${encodeURIComponent(e._id)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={active ? styles.chipActive : styles.chip}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

interface CardProps {
  ending: Ending;
  refCount: number;
  onClick: () => void;
}

function EndingCard({ ending, refCount, onClick }: CardProps) {
  const disabled = ending.enabled === false;
  const reqs = ending.requires ?? {};
  const statEntries: Array<{ key: StatKey; min?: number | null; max?: number | null }> = useMemo(
    () =>
      STAT_KEYS.flatMap((k) => {
        const r = reqs.stats?.[k];
        if (!r) return [];
        if (r.min == null && r.max == null) return [];
        return [{ key: k, min: r.min, max: r.max }];
      }),
    [reqs],
  );

  const flagsAll = reqs.flags_all ?? [];
  const flagsAny = reqs.flags_any ?? [];
  const flagsNone = reqs.flags_none ?? [];
  const hasFlags = flagsAll.length + flagsAny.length + flagsNone.length > 0;
  const hasReqs = statEntries.length > 0 || hasFlags;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${admin.panel} ${styles.card} ${disabled ? styles.cardDisabled : ''}`}
    >
      <div className={styles.cardHead}>
        <div className={styles.cardTitleWrap}>
          <span className={styles.cardTitle}>{ending.title || '(ohne Titel)'}</span>
          <span className={styles.cardId}>{ending._id}</span>
        </div>
        <div className={styles.cardBadges}>
          {ending.default ? (
            <span className={styles.badgeDefault}>default</span>
          ) : (
            <span className={styles.badge}>quest</span>
          )}
          {disabled && <span className={styles.badgeOff}>aus</span>}
        </div>
      </div>

      {ending.description && (
        <div className={styles.cardDesc}>{ending.description}</div>
      )}

      {hasReqs ? (
        <div className={styles.reqs}>
          {statEntries.length > 0 && (
            <div className={styles.reqSection}>
              <div className={styles.reqLabel}>Stats</div>
              <div className={styles.chipRow}>
                {statEntries.map((s) => (
                  <span
                    key={s.key}
                    className={styles.statChip}
                    style={{
                      borderColor: STAT_COLORS[s.key],
                      color: STAT_COLORS[s.key],
                    }}
                  >
                    {STAT_LABELS[s.key]} {formatRange(s.min, s.max)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {hasFlags && (
            <div className={styles.reqSection}>
              <div className={styles.reqLabel}>Flags</div>
              <div className={styles.chipRow}>
                {flagsAll.map((f) => (
                  <span key={`all-${f}`} className={styles.flagAll} title="required (all)">
                    +{f}
                  </span>
                ))}
                {flagsAny.map((f) => (
                  <span key={`any-${f}`} className={styles.flagAny} title="required (any)">
                    ±{f}
                  </span>
                ))}
                {flagsNone.map((f) => (
                  <span key={`none-${f}`} className={styles.flagNone} title="must not have">
                    −{f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.reqsEmpty}>Keine Bedingungen</div>
      )}

      <div className={styles.cardFoot}>
        <span title="Priorität (lower = früher geprüft)">p{ending.priority ?? 100}</span>
        <span title="Anzahl Karten, die dieses Ending referenzieren">
          {refCount} ref{refCount === 1 ? '' : 's'}
        </span>
      </div>
    </button>
  );
}

function formatRange(min?: number | null, max?: number | null): string {
  if (min != null && max != null) return `${min}…${max}`;
  if (min != null) return `≥ ${min}`;
  if (max != null) return `≤ ${max}`;
  return '';
}

function totalRefs(id: string, cards: Parameters<typeof referencesToEnding>[1]): number {
  const c = referencesToEnding(id, cards);
  return c.triggers + c.unlocks + c.removes;
}
