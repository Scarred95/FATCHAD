import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { flagInventoryOf } from '../store';
import type { Card } from '../types';
import styles from './FlagInspector.module.css';

interface Props {
  open: boolean;
  flag: string | null;
  cards: Card[];
  onClose: () => void;
  /** Optionally provide a setter so the inspector can switch flags inline. */
  onSelectFlag?: (flag: string) => void;
}

interface Buckets {
  requireAll: Card[];
  requireAny: Card[];
  requireNone: Card[];
  setBy: Card[];
  clearedBy: Card[];
}

function bucketize(flag: string, cards: Card[]): Buckets {
  const out: Buckets = {
    requireAll: [],
    requireAny: [],
    requireNone: [],
    setBy: [],
    clearedBy: [],
  };
  for (const c of cards) {
    if (c.requires?.flags_all?.includes(flag)) out.requireAll.push(c);
    if (c.requires?.flags_any?.includes(flag)) out.requireAny.push(c);
    if (c.requires?.flags_none?.includes(flag)) out.requireNone.push(c);
    if (c.choices.some((ch) => ch.sets_flags?.includes(flag))) out.setBy.push(c);
    if (c.choices.some((ch) => ch.clears_flags?.includes(flag))) out.clearedBy.push(c);
  }
  return out;
}

function CardRow({ c, onClose }: { c: Card; onClose: () => void }) {
  return (
    <Link
      to={`/admin/cards/${encodeURIComponent(c._id)}`}
      onClick={onClose}
      className={styles.row}
    >
      <span className={styles.rowTitle}>{c.title || c._id}</span>
      <span className={styles.rowId}>{c._id}</span>
    </Link>
  );
}

export function FlagInspector({ open, flag, cards, onClose, onSelectFlag }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const flagList = useMemo(() => flagInventoryOf(cards), [cards]);

  const buckets = useMemo(
    () => (flag ? bucketize(flag, cards) : null),
    [flag, cards],
  );

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headLeft}>
            <div className={styles.kicker}>Flag inspector</div>
            <div className={styles.flagName}>{flag ?? '— pick a flag —'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Close"
          >×</button>
        </header>

        {!flag && (
          <div className={styles.flagPicker}>
            <div className={styles.sectionLabel}>{flagList.length} flag(s) in use</div>
            {flagList.length === 0 ? (
              <div className={styles.empty}>No flags defined.</div>
            ) : (
              <ul className={styles.flagList}>
                {flagList.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      onClick={() => onSelectFlag?.(f)}
                      className={styles.flagBtn}
                    >{f}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {flag && buckets && (
          <div className={styles.body}>
            <Section
              title="Required (flags_all)"
              hint="Card only appears if this flag IS set"
              rows={buckets.requireAll}
              onClose={onClose}
            />
            <Section
              title="Allowed (flags_any)"
              hint="Card appears if ANY listed flag is set"
              rows={buckets.requireAny}
              onClose={onClose}
            />
            <Section
              title="Forbidden (flags_none)"
              hint="Card only appears if this flag is NOT set"
              rows={buckets.requireNone}
              onClose={onClose}
            />
            <Section
              title="Set by"
              hint="Choices that turn this flag ON"
              rows={buckets.setBy}
              onClose={onClose}
            />
            <Section
              title="Cleared by"
              hint="Choices that turn this flag OFF"
              rows={buckets.clearedBy}
              onClose={onClose}
            />

            {onSelectFlag && (
              <button
                type="button"
                onClick={() => onSelectFlag('')}
                className={styles.backLink}
              >← all flags</button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({
  title, hint, rows, onClose,
}: { title: string; hint: string; rows: Card[]; onClose: () => void }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>{title}</span>
        <span className={styles.sectionCount}>{rows.length}</span>
      </div>
      <div className={styles.sectionHint}>{hint}</div>
      {rows.length === 0 ? (
        <div className={styles.sectionEmpty}>—</div>
      ) : (
        <div className={styles.sectionRows}>
          {rows.map((c) => <CardRow key={c._id} c={c} onClose={onClose} />)}
        </div>
      )}
    </section>
  );
}
