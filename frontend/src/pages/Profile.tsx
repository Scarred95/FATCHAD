/** Profile — read-only identity + aggregate play stats. There's no profile
 *  edit backend yet; identity comes from the Cognito token, stats are summed
 *  client-side from the player's runs and unlocked achievements. */
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRuns, listUnlockedAchievements } from '../api/client';
import { errorMessage } from '../api/http';
import Header, { BackArrow, IconButton } from '../components/Header/Header';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Profile.module.css';

interface Aggregate {
  total: number;
  active: number;
  ended: number;
  abandoned: number;
  achievements: number;
  points: number;
}

export default function Profile() {
  const nav = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const displayName = useAuthStore((s) => s.displayName);
  const email = useAuthStore((s) => s.email);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [agg, setAgg] = useState<Aggregate | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRuns(), listUnlockedAchievements()])
      .then(([runs, unlocked]) => {
        if (cancelled) return;
        setAgg({
          total: runs.length,
          active: runs.filter((r) => r.status === 'active').length,
          ended: runs.filter((r) => r.status === 'ended').length,
          abandoned: runs.filter((r) => r.status === 'abandoned').length,
          achievements: unlocked.length,
          points: unlocked.reduce((sum, u) => sum + u.points, 0),
        });
      })
      .catch((e) => {
        if (!cancelled) pushToast(errorMessage(e, 'Konnte nicht laden'), 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  const name = displayName ?? (isGuest ? 'Gast' : 'Spieler');
  const badge = isAdmin ? 'Admin' : isGuest ? 'Gast' : 'Konto';

  return (
    <main className={`page ${styles.page}`}>
      <Header
        left={<IconButton label="Zurück" onClick={() => nav('/')}><BackArrow /></IconButton>}
        center="Profil"
      />

      <motion.div
        className={styles.identity}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className={styles.avatar} aria-hidden>{name.charAt(0).toUpperCase()}</div>
        <h1 className={`display ${styles.name}`}>{name}</h1>
        {email && <p className={styles.email}>{email}</p>}
        <span className={styles.badge} data-kind={badge.toLowerCase()}>{badge}</span>
        {isGuest && (
          <p className={styles.guestNote}>
            Gastkonto — erstelle ein Konto, um deinen Fortschritt zu sichern.
          </p>
        )}
      </motion.div>

      <motion.section
        className={styles.stats}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2 className={styles.sectionTitle}>Statistik</h2>
        {agg === null ? (
          <div className={styles.grid}>
            <div className={`skeleton ${styles.statSkeleton}`} />
            <div className={`skeleton ${styles.statSkeleton}`} />
            <div className={`skeleton ${styles.statSkeleton}`} />
            <div className={`skeleton ${styles.statSkeleton}`} />
          </div>
        ) : (
          <div className={styles.grid}>
            <Stat value={agg.total} label="Läufe" />
            <Stat value={agg.ended} label="Beendet" />
            <Stat value={agg.abandoned} label="Aufgegeben" />
            <Stat value={agg.active} label="Aktiv" />
            <Stat value={agg.achievements} label="Erfolge" accent />
            <Stat value={agg.points} label="Punkte" accent />
          </div>
        )}
      </motion.section>
    </main>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className={styles.statCard} data-accent={accent ? 'true' : 'false'}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
