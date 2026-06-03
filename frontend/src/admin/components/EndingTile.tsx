/**
 * One ending tile in the Endings section grid.
 *
 *   [default | quest]  [p100]  ............... [_id]
 *   <title>
 *   <description (clamped)>
 *
 *   <stat chips + flag chips — requirements at a glance>
 *
 *   <N refs>                                    [edit] [toggle]
 *
 * Click anywhere except the buttons opens the existing EndingEditor.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Ending, StatKey } from '../types';
import { STAT_COLORS, STAT_LABELS, STAT_KEYS } from '../types';
import { Toggle } from './Toggle';
import styles from './EndingTile.module.css';

interface Props {
  ending: Ending;
  refCount: number;
  onToggleEnabled: () => void;
  onToggleDefault: () => void;
}

function formatRange(min?: number | null, max?: number | null): string {
  if (min != null && max != null) return `${min}…${max}`;
  if (min != null) return `≥ ${min}`;
  if (max != null) return `≤ ${max}`;
  return '';
}

export function EndingTile({ ending, refCount, onToggleEnabled, onToggleDefault }: Props) {
  const nav = useNavigate();
  const disabled = ending.enabled === false;
  const reqs = ending.requires ?? {};

  const statEntries = useMemo(
    () =>
      STAT_KEYS.flatMap<{ key: StatKey; min?: number | null; max?: number | null }>(
        (k) => {
          const r = reqs.stats?.[k];
          if (!r) return [];
          if (r.min == null && r.max == null) return [];
          return [{ key: k, min: r.min, max: r.max }];
        },
      ),
    [reqs],
  );

  const flagsAll = reqs.flags_all ?? [];
  const flagsAny = reqs.flags_any ?? [];
  const flagsNone = reqs.flags_none ?? [];
  const hasFlags = flagsAll.length + flagsAny.length + flagsNone.length > 0;
  const hasReqs = statEntries.length > 0 || hasFlags;

  const open = () => nav(`/admin/endings/${encodeURIComponent(ending._id)}`);

  return (
    <div
      className={`${styles.tile} ${disabled ? styles.off : ''}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      }}
    >
      <div className={styles.top}>
        <button
          type="button"
          className={ending.default ? styles.kindDefault : styles.kindQuest}
          onClick={(e) => { e.stopPropagation(); onToggleDefault(); }}
          title={ending.default ? 'Default-Flag entfernen' : 'Als Default markieren'}
        >
          {ending.default ? 'default' : 'quest'}
        </button>
        <span className={styles.prio} title="Priorität (niedriger = früher geprüft)">
          p{ending.priority ?? 100}
        </span>
        <span className={styles.spacer} />
        <span className={styles.id}>{ending._id}</span>
      </div>

      <h3 className={styles.title}>{ending.title || '(ohne Titel)'}</h3>
      {ending.description && <p className={styles.desc}>{ending.description}</p>}

      {hasReqs ? (
        <div className={styles.reqs}>
          {statEntries.map((s) => (
            <span
              key={s.key}
              className={styles.statChip}
              style={{ borderColor: STAT_COLORS[s.key], color: STAT_COLORS[s.key] }}
            >
              {STAT_LABELS[s.key]} {formatRange(s.min, s.max)}
            </span>
          ))}
          {flagsAll.map((f) => (
            <span key={`all-${f}`} className={styles.flagAll} title="required (all)">+{f}</span>
          ))}
          {flagsAny.map((f) => (
            <span key={`any-${f}`} className={styles.flagAny} title="required (any)">±{f}</span>
          ))}
          {flagsNone.map((f) => (
            <span key={`none-${f}`} className={styles.flagNone} title="must not have">−{f}</span>
          ))}
        </div>
      ) : (
        <div className={styles.reqsEmpty}>Keine Bedingungen</div>
      )}

      <div className={styles.foot}>
        <span className={styles.refs} title="Karten, die dieses Ending referenzieren">
          {refCount} ref{refCount === 1 ? '' : 's'}
        </span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.editBtn}
          onClick={(e) => { e.stopPropagation(); open(); }}
          aria-label="Ending bearbeiten"
          title="bearbeiten"
        >✎</button>
        <Toggle on={ending.enabled !== false} onToggle={onToggleEnabled} />
      </div>
    </div>
  );
}
