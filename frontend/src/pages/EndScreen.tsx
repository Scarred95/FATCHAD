import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getEndSummary } from '../api/client';
import type { EndSummary, MainStatName, Stats } from '../api/types';
import StatIcon from '../components/StatIcon/StatIcon';
import { useRunStore } from '../stores/runStore';
import { useToastStore } from '../stores/toastStore';
import styles from './EndScreen.module.css';

export default function EndScreen() {
  const { runId } = useParams<{ runId: string }>();
  const nav = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const exitRun = useRunStore((s) => s.exitRun);
  const createRun = useRunStore((s) => s.createRun);
  const [summary, setSummary] = useState<EndSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    getEndSummary(runId)
      .then(setSummary)
      .catch((e) => setError(errMsg(e)));
  }, [runId]);

  async function newRun() {
    exitRun();
    try {
      const id = await createRun();
      nav(`/runs/${id}`);
    } catch (e) {
      pushToast(errMsg(e), 'error');
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
        <button className={styles.secondary} onClick={share}>Teilen</button>
        <Link to="/runs" className={styles.tertiary}>Zurück zur Übersicht</Link>
      </motion.div>
    </main>
  );
}

function StatGrid({ stats }: { stats: Stats }) {
  const rows: { stat: MainStatName | 'chaos'; value: number }[] = [
    { stat: 'moneten', value: stats.moneten },
    { stat: 'aura', value: stats.aura },
    { stat: 'respekt', value: stats.respekt },
    { stat: 'rizz', value: stats.rizz },
    { stat: 'chaos', value: stats.chaos },
  ];
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
  return `FATCHAD — ${ending}\nZüge: ${s.turns_survived} · Karten: ${s.cards_played}\n` +
    `Moneten ${s.final_stats.moneten} · Aura ${s.final_stats.aura} · ` +
    `Respekt ${s.final_stats.respekt} · Rizz ${s.final_stats.rizz} · ` +
    `Chaos ${s.final_stats.chaos}`;
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'detail' in e) return String((e as any).detail);
  if (e instanceof Error) return e.message;
  return 'Konnte nicht laden';
}
