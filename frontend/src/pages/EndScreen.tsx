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

  const isWin = summary.status === 'won';
  const isLose = summary.status === 'lost';

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
          {isWin ? 'Sieg' : isLose ? 'Niederlage' : 'Abbruch'}
        </span>
        <h1 className={`display ${styles.bannerTitle}`}>
          {prettyEnding(summary.ending) || (isLose ? 'Vorbei' : 'Frieden')}
        </h1>
      </motion.div>

      <motion.p
        className={styles.flavor}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        {flavorFor(summary.ending, summary.status)}
      </motion.p>

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

function prettyEnding(id: string | null): string {
  if (!id) return '';
  const map: Record<string, string> = {
    chaos_agent: 'Chaos Agent',
    grey_eminence: 'Graue Eminenz',
    death_bankrupt: 'Pleite',
    death_revolution: 'Revolution',
    death_irrelevant: 'Irrelevant',
    death_jumped_shark: 'Jumped The Shark',
    death_couped: 'Geputscht',
    death_conspiracy: 'Verschwörung',
    death_frozen_out: 'Ausgegrenzt',
    death_drowned_in_drama: 'In Drama Ertrunken',
    softlock_no_cards: 'Welt erstarrt',
  };
  return map[id] ?? id.toUpperCase().replace(/_/g, ' ');
}

function flavorFor(ending: string | null, status: EndSummary['status']): string {
  if (status === 'abandoned') return 'Du hast aufgegeben. Niemand wird sich erinnern.';
  if (!ending) return '';
  const map: Record<string, string> = {
    chaos_agent: 'Du hast die Welt in Brand gesteckt. Die Flammen tanzen für dich.',
    grey_eminence: 'Niemand weiß, dass du dahinter stehst. Genau so wolltest du es.',
    death_bankrupt: 'Pleite. Niemand nimmt deine Anrufe entgegen.',
    death_revolution: 'Zu reich. Die Straßen brennen mit deinem Namen darauf.',
    death_irrelevant: 'Niemand schaut mehr hin. Du bist verschwunden, ohne zu gehen.',
    death_jumped_shark: 'Zu viel Aufmerksamkeit, zu wenig Substanz. Cringe ewig.',
    death_couped: 'Andere haben gewartet. Andere waren besser vorbereitet.',
    death_conspiracy: 'Zu viel Kontrolle. Selbst deine Verbündeten kippen.',
    death_frozen_out: 'Niemand findet dich noch interessant. Auch du selbst nicht.',
    death_drowned_in_drama: 'Jeder Tag ein Skandal. Irgendwann konnte niemand mehr folgen.',
    softlock_no_cards: 'Die Welt hat aufgehört, dich zu brauchen.',
  };
  return map[ending] ?? 'Eine Geschichte, die nur du noch erzählen kannst.';
}

function formatShareText(s: EndSummary): string {
  const ending = prettyEnding(s.ending) || s.status;
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
