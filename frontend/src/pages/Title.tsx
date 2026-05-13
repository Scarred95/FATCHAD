import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listRuns, getHealth } from '../api/client';
import { getUserId } from '../stores/userStore';
import styles from './Title.module.css';

export default function Title() {
  const nav = useNavigate();
  const [hasRuns, setHasRuns] = useState<boolean | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    listRuns(getUserId())
      .then((runs) => setHasRuns(runs.length > 0))
      .catch(() => setHasRuns(false));

    getHealth()
      .then((h) => setOnline(h.status === 'ok'))
      .catch(() => setOnline(false));
  }, []);

  return (
    <main className={`page ${styles.page}`}>
      <div className={styles.ambient} aria-hidden />

      <motion.div
        className={styles.logoBlock}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className={`display ${styles.logo}`}>
          F<span className={styles.glitch}>A</span>TCH
          <span className={styles.glitchSlow}>A</span>D
        </h1>
        <p className={styles.tagline}>
          Eine Welt. Vier Werte. Eine schlechte Idee nach der anderen.
        </p>
      </motion.div>

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
      >
        <button
          className={styles.btnPrimary}
          onClick={() => nav('/runs/new')}
        >
          Neue Runde
        </button>
        <button
          className={styles.btnSecondary}
          onClick={() => nav('/runs')}
          disabled={!hasRuns}
        >
          Fortsetzen
        </button>
        <Link to="/about" className={styles.btnText}>
          Über FATCHAD
        </Link>
      </motion.div>

      {online === false && (
        <div className={styles.statusPill}>
          Offline — Server nicht erreichbar
        </div>
      )}
    </main>
  );
}
