/**
 * History viewer — accordion timeline of a run's past turns.
 *
 * Used in three places (RunList row, EndScreen, in-run HUD). Snapshot at
 * open time: fetches on mount / runId change, no live refresh — the
 * operator closes and reopens to see new entries.
 *
 * Admin-only details (flag changes, ending triggers) are gated behind
 * `useAdminStore.isAdmin` — non-admins see only choice text + stat deltas.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { getHistory } from '../../api/client';
import { useAdminStore } from '../../stores/adminStore';
import type { HistoryDetailEntry, StatName } from '../../api/types';
import styles from './HistoryModal.module.css';

interface Props {
  open: boolean;
  runId: string | null;
  onClose: () => void;
}

const STAT_LABELS: Record<StatName, string> = {
  moneten: 'Moneten',
  aura: 'Aura',
  respekt: 'Respekt',
  rizz: 'Rizz',
  chaos: 'Chaos',
};

const STAT_VAR: Record<StatName, string> = {
  moneten: 'var(--color-stat-moneten)',
  aura: 'var(--color-stat-aura)',
  respekt: 'var(--color-stat-respekt)',
  rizz: 'var(--color-stat-rizz)',
  chaos: 'var(--color-stat-chaos)',
};

const STAT_ORDER: StatName[] = ['moneten', 'aura', 'respekt', 'rizz', 'chaos'];

export default function HistoryModal({ open, runId, onClose }: Props) {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const [entries, setEntries] = useState<HistoryDetailEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTurns, setOpenTurns] = useState<Set<number>>(new Set());

  // Fetch on open / when runId changes. Reset state each time so an old
  // run's data doesn't flash before the new fetch resolves.
  useEffect(() => {
    if (!open || !runId) return;
    setEntries(null);
    setError(null);
    setOpenTurns(new Set());
    setLoading(true);
    let cancelled = false;
    getHistory(runId)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.detail || e?.message || 'Fehler beim Laden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, runId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const allExpanded = useMemo(
    () => !!entries && entries.length > 0 && openTurns.size === entries.length,
    [entries, openTurns],
  );

  const toggleAll = () => {
    if (!entries) return;
    if (allExpanded) setOpenTurns(new Set());
    else setOpenTurns(new Set(entries.map((e) => e.turn)));
  };

  const toggleOne = (turn: number) =>
    setOpenTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Verlauf"
            initial={{ scale: 0.95, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.head}>
              <div>
                <h2 className={styles.title}>Verlauf</h2>
                {entries && (
                  <div className={styles.sub}>
                    {entries.length} Zug{entries.length === 1 ? '' : 'e'}
                    {isAdmin && <span className={styles.adminBadge}>admin</span>}
                  </div>
                )}
              </div>
              <div className={styles.headActions}>
                {entries && entries.length > 0 && (
                  <button type="button" className={styles.btn} onClick={toggleAll}>
                    {allExpanded ? 'Alle einklappen' : 'Alle ausklappen'}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.btnClose}
                  onClick={onClose}
                  aria-label="Schließen"
                >×</button>
              </div>
            </header>

            <div className={styles.body}>
              {loading && <div className={styles.placeholder}>Lädt…</div>}
              {error && <div className={styles.error}>{error}</div>}
              {entries && entries.length === 0 && (
                <div className={styles.placeholder}>Noch keine Züge gespielt.</div>
              )}
              {entries && entries.length > 0 && (
                <ol className={styles.list}>
                  {entries.map((e) => (
                    <HistoryRow
                      key={`${e.turn}-${e.event_id}`}
                      entry={e}
                      open={openTurns.has(e.turn)}
                      onToggle={() => toggleOne(e.turn)}
                      isAdmin={isAdmin}
                    />
                  ))}
                </ol>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface RowProps {
  entry: HistoryDetailEntry;
  open: boolean;
  onToggle: () => void;
  isAdmin: boolean;
}

function HistoryRow({ entry, open, onToggle, isAdmin }: RowProps) {
  const deltas = useMemo(
    () => STAT_ORDER
      .map((k) => ({ stat: k, amount: entry.effects[k] ?? 0 }))
      .filter((d) => d.amount !== 0),
    [entry.effects],
  );

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.rowHead}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={styles.turn}>T{entry.turn}</span>
        <span className={styles.cardTitle}>{entry.title}</span>
        {entry.category && <span className={styles.category}>{entry.category}</span>}
        <span className={styles.chevron} aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.rowBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className={styles.rowBodyInner}>
              {entry.description && (
                <p className={styles.desc}>{entry.description}</p>
              )}
              <div className={styles.choiceRow}>
                <span className={styles.choiceLabel}>Wahl:</span>
                <span className={styles.choiceText}>{entry.choice_text}</span>
              </div>

              {deltas.length > 0 ? (
                <div className={styles.deltas}>
                  {deltas.map((d) => (
                    <span
                      key={d.stat}
                      className={styles.delta}
                      style={{
                        ['--stat-color' as any]: STAT_VAR[d.stat],
                      }}
                      data-sign={d.amount > 0 ? 'pos' : 'neg'}
                    >
                      <span className={styles.deltaStat}>{STAT_LABELS[d.stat]}</span>
                      <span className={styles.deltaAmount}>
                        {d.amount > 0 ? '+' : ''}{d.amount}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className={styles.noDeltas}>Keine Stat-Änderung</div>
              )}

              {isAdmin && (entry.sets_flags.length + entry.clears_flags.length > 0
                || entry.triggered_ending) && (
                <div className={styles.adminBlock}>
                  {(entry.sets_flags.length + entry.clears_flags.length > 0) && (
                    <div className={styles.flagsRow}>
                      <span className={styles.flagsLabel}>Flags:</span>
                      {entry.sets_flags.map((f) => (
                        <span key={`s-${f}`} className={styles.flagSet}>+{f}</span>
                      ))}
                      {entry.clears_flags.map((f) => (
                        <span key={`c-${f}`} className={styles.flagClear}>−{f}</span>
                      ))}
                    </div>
                  )}
                  {entry.triggered_ending && (
                    <div className={styles.endingRow}>
                      <span className={styles.endingLabel}>Ending getriggert:</span>
                      <span className={styles.endingId}>{entry.triggered_ending}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
