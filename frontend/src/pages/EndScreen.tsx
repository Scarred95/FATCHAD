/**
 * Run-over screen — ending banner, final-stat grid, share + new-run actions.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getEndSummary, publishRun } from '../api/client';
import { ApiError, errorMessage } from '../api/http';
import { STAT_NAMES } from '../api/types';
import type { EndSummary, LeaderboardRunRow, Stats, UnlockedAchievement } from '../api/types';
import { STAT_LABEL } from '../components/statMeta';
import StatIcon from '../components/StatIcon/StatIcon';
import HistoryModal from '../components/HistoryModal/HistoryModal';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useAuthStore } from '../stores/authStore';
import { useRunStore } from '../stores/runStore';
import { useToastStore } from '../stores/toastStore';
import styles from './EndScreen.module.css';

/** The publish endpoint returns a structured 409 when the caller is at the
 *  5-run cap: `{ detail: { reason: 'leaderboard_full', current: [...] } }`.
 *  Pull the current runs out so the UI can prompt for a swap; null for any
 *  other error (including the plain "already published" 409). */
function fullBoardRuns(e: unknown): LeaderboardRunRow[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const d = (e.data as { detail?: { reason?: string; current?: LeaderboardRunRow[] } } | null)
    ?.detail;
  return d?.reason === 'leaderboard_full' ? d.current ?? [] : null;
}

export default function EndScreen() {
  const { runId } = useParams<{ runId: string }>();
  const nav = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const isGuest = useAuthStore((s) => s.isGuest);
  const exitRun = useRunStore((s) => s.exitRun);
  const createRun = useRunStore((s) => s.createRun);
  const [summary, setSummary] = useState<EndSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishState, setPublishState] = useState<'idle' | 'busy' | 'done'>('idle');
  // Non-null while the replace picker is open — the caller's current 5 runs.
  const [pickerRuns, setPickerRuns] = useState<LeaderboardRunRow[] | null>(null);

  useEffect(() => {
    if (!runId) return;
    getEndSummary(runId)
      .then(setSummary)
      .catch((e) => setError(errorMessage(e, 'Konnte nicht laden')));
  }, [runId]);

  async function newRun() {
    exitRun();
    try {
      const id = await createRun();
      nav(`/runs/${id}`);
    } catch (e) {
      pushToast(errorMessage(e, 'Konnte nicht laden'), 'error');
    }
  }

  // Publish this run to the highscore board. At the cap the backend 409s with
  // the current five; we surface them in the picker and re-call with the chosen
  // run to replace. A plain "already published" 409 just flips to the done state.
  async function publish(replaceRunId?: string) {
    if (!runId) return;
    setPublishState('busy');
    try {
      await publishRun(runId, replaceRunId);
      setPickerRuns(null);
      setPublishState('done');
      pushToast('Run ist jetzt im Leaderboard', 'info');
    } catch (e) {
      const current = fullBoardRuns(e);
      if (current) {
        setPickerRuns(current);
        setPublishState('idle');
        return;
      }
      if (e instanceof ApiError && e.status === 409) {
        // Already published — nothing to do but reflect it.
        setPublishState('done');
        pushToast(errorMessage(e, 'Run steht bereits im Leaderboard'), 'info');
        return;
      }
      setPublishState('idle');
      pushToast(errorMessage(e, 'Veröffentlichen fehlgeschlagen'), 'error');
    }
  }

  function share() {
    if (!summary) return;
    const text = formatShareText(summary);
    navigator.clipboard?.writeText(text).then(
      () => pushToast('In Zwischenablage kopiert', 'info'),
      () => pushToast('Kopieren fehlgeschlagen', 'error'),
    );
  }

  if (error) {
    return (
      <main className={`page ${styles.page}`}>
        <p className={styles.errorMsg}>{error}</p>
        <Link to="/runs" className={styles.backLink}>Zurück zur Übersicht</Link>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className={`page ${styles.page}`}>
        <p className={styles.dim}>Lade Zusammenfassung…</p>
      </main>
    );
  }

  const isAbandoned = summary.status === 'abandoned';
  const title = summary.ending_title ?? (isAbandoned ? 'Aufgegeben' : 'Vorbei');
  const flavor =
    summary.ending_description ??
    (isAbandoned ? 'Du hast aufgegeben. Niemand wird sich erinnern.' : '');

  return (
    <main className={`page ${styles.page}`}>
      <motion.div
        className={styles.banner}
        data-status={summary.status}
        initial={{ opacity: 0, scale: 1.4, filter: 'blur(20px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1.0, ease: 'easeOut' }}
      >
        <span className={styles.bannerLabel}>
          {isAbandoned ? 'Abbruch' : 'Ende'}
        </span>
        <h1 className={`display ${styles.bannerTitle}`}>{title}</h1>
      </motion.div>

      {flavor && (
        <motion.p
          className={styles.flavor}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          {flavor}
        </motion.p>
      )}

      {summary.newly_unlocked.length > 0 && (
        <AchievementStack items={summary.newly_unlocked} />
      )}

      <motion.div
        className={styles.summary}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.0 }}
      >
        <StatGrid stats={summary.final_stats} />

        <dl className={styles.meta}>
          <div>
            <dt>Züge überlebt</dt>
            <dd>{summary.turns_survived}</dd>
          </div>
          <div>
            <dt>Karten gespielt</dt>
            <dd>{summary.cards_played}</dd>
          </div>
        </dl>
      </motion.div>

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.4 }}
      >
        <button className={styles.primary} onClick={newRun}>Neue Runde</button>
        {!isGuest && (
          <button
            className={styles.secondary}
            onClick={() => publish()}
            disabled={publishState !== 'idle'}
          >
            {publishState === 'done'
              ? 'Im Leaderboard ✓'
              : publishState === 'busy'
                ? 'Wird veröffentlicht…'
                : 'Aufs Leaderboard'}
          </button>
        )}
        <button className={styles.secondary} onClick={() => setHistoryOpen(true)}>Verlauf</button>
        <button className={styles.secondary} onClick={share}>Teilen</button>
        <Link to="/runs" className={styles.tertiary}>Zurück zur Übersicht</Link>
      </motion.div>

      <HistoryModal
        open={historyOpen}
        runId={runId ?? null}
        onClose={() => setHistoryOpen(false)}
      />

      <ReplacePicker
        runs={pickerRuns}
        busy={publishState === 'busy'}
        onPick={(rid) => publish(rid)}
        onClose={() => setPickerRuns(null)}
      />
    </main>
  );
}

/** Shown when the highscore board is full: the caller picks one of their five
 *  existing runs to drop in favour of the new one. */
function ReplacePicker({
  runs,
  busy,
  onPick,
  onClose,
}: {
  runs: LeaderboardRunRow[] | null;
  busy: boolean;
  onPick: (runId: string) => void;
  onClose: () => void;
}) {
  useEscapeKey(runs !== null, onClose);
  return (
    <AnimatePresence>
      {runs !== null && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.pickerDialog}
            role="dialog"
            aria-modal="true"
            aria-label="Run ersetzen"
            initial={{ scale: 0.95, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.pickerHead}>
              <h2 className={styles.pickerTitle}>Leaderboard voll</h2>
              <p className={styles.pickerSub}>
                Du hast bereits {runs.length} Runs im Leaderboard. Wähle einen, den
                du ersetzen möchtest.
              </p>
            </header>
            <ul className={styles.pickerList}>
              {runs.map((r) => (
                <li key={r.run_id}>
                  <button
                    type="button"
                    className={styles.pickerRow}
                    onClick={() => onPick(r.run_id)}
                    disabled={busy}
                  >
                    <span className={styles.pickerScore}>{r.score} Runden</span>
                    <span className={styles.pickerMeta}>{r.ending ?? r.status}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.pickerCancel} onClick={onClose}>
              Abbrechen
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AchievementStack({ items }: { items: UnlockedAchievement[] }) {
  return (
    <motion.section
      className={styles.achievements}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
    >
      <span className={styles.achHeader}>
        {items.length === 1 ? 'Achievement freigeschaltet' : 'Achievements freigeschaltet'}
      </span>
      {items.map((a, i) => (
        <motion.div
          key={a.id}
          className={styles.achCard}
          initial={{ opacity: 0, scale: 0.92, x: -10 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.95 + i * 0.12, ease: 'easeOut' }}
        >
          {a.image_url ? (
            <img className={styles.achIcon} src={a.image_url} alt="" />
          ) : (
            <span className={styles.achIconFallback} aria-hidden>★</span>
          )}
          <div className={styles.achBody}>
            <span className={styles.achName}>{a.name}</span>
            {a.description && <span className={styles.achDesc}>{a.description}</span>}
            {a.unlocks_deck && (
              <span className={styles.achDeck}>Deck freigeschaltet: {a.unlocks_deck}</span>
            )}
          </div>
          {a.points > 0 && <span className={styles.achPoints}>+{a.points}</span>}
        </motion.div>
      ))}
    </motion.section>
  );
}

function StatGrid({ stats }: { stats: Stats }) {
  const rows = STAT_NAMES.map((stat) => ({ stat, value: stats[stat] }));
  return (
    <div className={styles.statGrid}>
      {rows.map(({ stat, value }, i) => (
        <motion.div
          key={stat}
          className={styles.statRow}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 1.0 + i * 0.08 }}
        >
          <StatIcon stat={stat} size="sm" />
          <span className={styles.statName}>{stat}</span>
          <span className={styles.statValue}>{value}</span>
        </motion.div>
      ))}
    </div>
  );
}

function formatShareText(s: EndSummary): string {
  const ending = s.ending_title ?? (s.status === 'abandoned' ? 'Aufgegeben' : 'Ende');
  const statLine = STAT_NAMES.map((k) => `${STAT_LABEL[k]} ${s.final_stats[k]}`).join(' · ');
  return `FATCHAD — ${ending}\nZüge: ${s.turns_survived} · Karten: ${s.cards_played}\n${statLine}`;
}
