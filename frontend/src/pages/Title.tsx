/** Landing screen — new/continue/about plus login/logout + admin entry. */
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listRuns, getHealth } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Title.module.css';

export default function Title() {
  const nav = useNavigate();
  const [hasRuns, setHasRuns] = useState<boolean | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const userId = useAuthStore((s) => s.userId);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const isGuest = useAuthStore((s) => s.isGuest);
  const logout = useAuthStore((s) => s.logout);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    // Runs are per-user and require a token; only fetch when signed in.
    if (userId) {
      listRuns()
        .then((runs) => setHasRuns(runs.length > 0))
        .catch(() => setHasRuns(false));
    } else {
      setHasRuns(false);
    }

    getHealth()
      .then((h) => setOnline(h.status === 'ok'))
      .catch(() => setOnline(false));
  }, [userId]);

  function onLogout() {
    logout();
    pushToast('Abgemeldet', 'info');
  }

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

      <div className={styles.adminBlock}>
        {isGuest && (
          <p className={styles.tagline}>
            Du spielst als Gast — erstelle ein Konto, um deinen Fortschritt zu sichern.
          </p>
        )}
        <div className={styles.adminRow}>
          {userId ? (
            <>
              {isGuest && (
                <Link to="/register" className={styles.adminLink}>
                  Konto erstellen
                </Link>
              )}
              {isAdmin && (
                <Link to="/admin" className={styles.adminLink}>
                  Admin öffnen
                </Link>
              )}
              <button
                type="button"
                className={styles.btnText}
                onClick={onLogout}
              >
                Abmelden
              </button>
            </>
          ) : (
            <Link to="/login" className={styles.adminLink}>
              Anmelden
            </Link>
          )}
        </div>
      </div>

      {online === false && (
        <div className={styles.statusPill}>
          Offline — Server nicht erreichbar
        </div>
      )}
    </main>
  );
}
