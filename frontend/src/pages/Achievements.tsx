/** Achievements gallery — every visible achievement plus the player's earned
 *  ones. Locked entries show their hint; unlocked ones reveal description +
 *  when they were earned (including hidden achievements, which only appear
 *  once earned). */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAchievements, listUnlockedAchievements } from '../api/client';
import { errorMessage } from '../api/http';
import type { AchievementView, UnlockedAchievementView } from '../api/types';
import Ambient from '../components/Ambient/Ambient';
import Header, { BackArrow, IconButton } from '../components/Header/Header';
import { useToastStore } from '../stores/toastStore';
import styles from './Achievements.module.css';

interface Row {
  ach: AchievementView;
  unlockedAt: string | null;
}

export default function Achievements() {
  const nav = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAchievements(), listUnlockedAchievements()])
      .then(([all, unlocked]) => {
        if (cancelled) return;
        setRows(mergeRows(all, unlocked));
      })
      .catch((e) => {
        if (!cancelled) pushToast(errorMessage(e, 'Konnte nicht laden'), 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const earned = rows.filter((r) => r.unlockedAt !== null);
    const points = earned.reduce((sum, r) => sum + r.ach.points, 0);
    return { earned: earned.length, total: rows.length, points };
  }, [rows]);

  return (
    <main className={`page ${styles.page}`}>
      <Ambient />
      <Header
        left={<IconButton label="Zurück" onClick={() => nav('/')}><BackArrow /></IconButton>}
        center="Erfolge"
      />

      {summary && (
        <motion.div
          className={styles.summary}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span className={styles.summaryMain}>
            {summary.earned} / {summary.total}
          </span>
          <span className={styles.summarySub}>freigeschaltet · {summary.points} Punkte</span>
        </motion.div>
      )}

      <div className={styles.list}>
        {rows === null && (
          <>
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
          </>
        )}

        {rows !== null && rows.length === 0 && (
          <p className={styles.empty}>Noch keine Erfolge definiert.</p>
        )}

        <AnimatePresence>
          {rows?.map((r, i) => {
            const unlocked = r.unlockedAt !== null;
            return (
              <motion.div
                key={r.ach.id}
                className={styles.tile}
                data-unlocked={unlocked}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.32, ease: 'easeOut' }}
                layout
              >
                <div className={styles.icon} data-unlocked={unlocked}>
                  {unlocked ? '★' : '🔒'}
                </div>
                <div className={styles.meta}>
                  <span className={styles.name}>{r.ach.name}</span>
                  {unlocked ? (
                    <>
                      {r.ach.description && (
                        <span className={styles.desc}>{r.ach.description}</span>
                      )}
                      <span className={styles.unlockedAt}>
                        Freigeschaltet {formatDate(r.unlockedAt!)}
                      </span>
                    </>
                  ) : (
                    r.ach.hint && <span className={styles.hint}>{r.ach.hint}</span>
                  )}
                  {r.ach.unlocks_deck && (
                    <span className={styles.deckTag}>Deck: {r.ach.unlocks_deck}</span>
                  )}
                </div>
                <span className={styles.points}>{r.ach.points}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </main>
  );
}

/** Merge the visible catalog with the caller's unlocks. Earned-but-hidden
 *  achievements aren't in `all`, so they're appended from `unlocked`. Earned
 *  entries float to the top, then by points. */
function mergeRows(all: AchievementView[], unlocked: UnlockedAchievementView[]): Row[] {
  const unlockedAt = new Map(unlocked.map((u) => [u.id, u.unlocked_at]));
  const seen = new Set(all.map((a) => a.id));
  const rows: Row[] = all.map((ach) => ({ ach, unlockedAt: unlockedAt.get(ach.id) ?? null }));
  for (const u of unlocked) {
    if (!seen.has(u.id)) rows.push({ ach: u, unlockedAt: u.unlocked_at });
  }
  rows.sort((a, b) => {
    const ae = a.unlockedAt !== null ? 0 : 1;
    const be = b.unlockedAt !== null ? 0 : 1;
    if (ae !== be) return ae - be;
    return b.ach.points - a.ach.points;
  });
  return rows;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
