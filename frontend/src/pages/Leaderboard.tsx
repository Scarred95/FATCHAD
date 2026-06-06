/** Public leaderboards — two boards behind a segmented switch:
 *  "Erfolgs-Punkte" (career achievement points) and "Beste Runs" (rounds
 *  survived). Readable signed-out; a signed-in player additionally gets a
 *  "Nur meine" toggle on the run board (their own published runs).
 *
 *  Layout note: the page itself stays static (header + switch fixed); only the
 *  rows scroll — see the module CSS `.scroll` region. */
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPointsLeaderboard,
  getRunsLeaderboard,
  getMyLeaderboardRuns,
} from '../api/client';
import { errorMessage } from '../api/http';
import type { LeaderboardPointsRow, LeaderboardRunRow } from '../api/types';
import Header, { BackArrow, IconButton } from '../components/Header/Header';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Leaderboard.module.css';

type Board = 'points' | 'runs';

export default function Leaderboard() {
  const nav = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const pushToast = useToastStore((s) => s.push);

  const [board, setBoard] = useState<Board>('points');
  // "Nur meine" only applies to the run board — points is one row per account.
  const [mineOnly, setMineOnly] = useState(false);
  const [points, setPoints] = useState<LeaderboardPointsRow[] | null>(null);
  const [runs, setRuns] = useState<LeaderboardRunRow[] | null>(null);

  // Switching to the points board drops the run-only "mine" filter so it can't
  // linger in an inapplicable state.
  const showMine = board === 'runs' && Boolean(userId);
  const effectiveMine = showMine && mineOnly;

  useEffect(() => {
    let cancelled = false;
    const fail = (e: unknown) =>
      !cancelled && pushToast(errorMessage(e, 'Konnte Bestenliste nicht laden'), 'error');

    if (board === 'points') {
      setPoints(null);
      getPointsLeaderboard().then((r) => !cancelled && setPoints(r)).catch(fail);
    } else {
      setRuns(null);
      const load = effectiveMine ? getMyLeaderboardRuns() : getRunsLeaderboard();
      // "mine" comes back oldest-first; sort by score so it reads like the board.
      load
        .then((r) => !cancelled && setRuns(effectiveMine ? sortByScore(r) : r))
        .catch(fail);
    }
    return () => {
      cancelled = true;
    };
  }, [board, effectiveMine, pushToast]);

  const loading = board === 'points' ? points === null : runs === null;
  const isEmpty = useMemo(
    () => (board === 'points' ? points?.length === 0 : runs?.length === 0),
    [board, points, runs],
  );

  return (
    <main className={`page ${styles.page}`}>
      <Header
        left={<IconButton label="Zurück" onClick={() => nav('/')}><BackArrow /></IconButton>}
        center="Bestenliste"
      />

      <div className={styles.switch} role="tablist" aria-label="Bestenliste-Ansicht">
        <button
          type="button"
          role="tab"
          aria-selected={board === 'points'}
          className={styles.switchBtn}
          data-active={board === 'points'}
          onClick={() => setBoard('points')}
        >
          Erfolgs-Punkte
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={board === 'runs'}
          className={styles.switchBtn}
          data-active={board === 'runs'}
          onClick={() => setBoard('runs')}
        >
          Beste Runs
        </button>
      </div>

      {showMine && (
        <div className={styles.filterRow}>
          <label className={styles.mineToggle}>
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />
            Nur meine
          </label>
        </div>
      )}

      <div className={styles.scroll}>
        {loading && (
          <>
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
          </>
        )}

        {!loading && isEmpty && (
          <p className={styles.empty}>
            {effectiveMine
              ? 'Du hast noch keinen Run veröffentlicht.'
              : 'Noch keine Einträge.'}
          </p>
        )}

        {!loading && board === 'points' && points?.map((row, i) => (
          <Row key={`${row.display_name}-${i}`} rank={i + 1} index={i}>
            <span className={styles.name}>{row.display_name}</span>
            <span className={styles.score}>
              {row.score}
              <span className={styles.scoreUnit}>Pkt</span>
            </span>
          </Row>
        ))}

        {!loading && board === 'runs' && runs?.map((row, i) => (
          <Row key={row.run_id} rank={i + 1} index={i}>
            <span className={styles.runMeta}>
              <span className={styles.name}>{row.display_name}</span>
              <span className={styles.runSub}>
                {row.status === 'abandoned' ? 'Aufgegeben' : 'Beendet'}
                {row.deck_ids.length > 0 && ` · ${row.deck_ids.join(', ')}`}
              </span>
            </span>
            <span className={styles.score}>
              {row.score}
              <span className={styles.scoreUnit}>Runden</span>
            </span>
          </Row>
        ))}
      </div>
    </main>
  );
}

/** A single ranked row, animated in with a small stagger. */
function Row({
  rank,
  index,
  children,
}: {
  rank: number;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={styles.row}
      data-top={rank <= 3}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.28, ease: 'easeOut' }}
    >
      <span className={styles.rank} data-top={rank <= 3}>{rank}</span>
      {children}
    </motion.div>
  );
}

function sortByScore<T extends { score: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.score - a.score);
}
