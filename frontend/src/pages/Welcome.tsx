/**
 * Front gate — the first screen a signed-out visitor sees.
 *
 * Three ways in: Anmelden (login), Registrieren (register), or Als Gast
 * spielen (guest). On any successful path the user lands on the Title screen
 * (`/`). Signed-in users skip this screen entirely.
 */
import { motion } from 'framer-motion';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Title.module.css';

export default function Welcome() {
  const nav = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const initializing = useAuthStore((s) => s.initializing);
  const loading = useAuthStore((s) => s.loading);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const pushToast = useToastStore((s) => s.push);

  async function onGuest() {
    try {
      await loginAsGuest();
      nav('/');
    } catch (err: any) {
      pushToast(err?.message ?? 'Gast-Login fehlgeschlagen', 'error');
    }
  }

  // Wait out session restore so we don't flash the gate before a redirect.
  if (initializing) return null;
  // Already signed in — the gate has nothing to offer.
  if (userId) return <Navigate to="/" replace />;

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
        <button className={styles.btnPrimary} onClick={() => nav('/login')}>
          Anmelden
        </button>
        <button className={styles.btnSecondary} onClick={() => nav('/register')}>
          Registrieren
        </button>
        <button className={styles.btnSecondary} onClick={onGuest} disabled={loading}>
          {loading ? '…' : 'Als Gast spielen'}
        </button>
        {/* Boards are public — reachable before signing in. */}
        <Link to="/leaderboard" className={styles.btnText}>
          Bestenliste
        </Link>
        <Link to="/about" className={styles.btnText}>
          Über FATCHAD
        </Link>
      </motion.div>
    </main>
  );
}
