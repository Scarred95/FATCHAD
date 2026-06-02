/** Landing screen — new/continue/about plus the inline admin-token unlock. */
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listRuns, getHealth } from '../api/client';
import { getUserId } from '../stores/userStore';
import { useAdminStore } from '../stores/adminAuthStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Title.module.css';

export default function Title() {
  const nav = useNavigate();
  const [hasRuns, setHasRuns] = useState<boolean | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const enableAdmin = useAdminStore((s) => s.enable);
  const disableAdmin = useAdminStore((s) => s.disable);
  const pushToast = useToastStore((s) => s.push);

  // Inline token entry state. Checking the box opens the input row;
  // unchecking (or pressing Esc / Cancel) collapses it again.
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listRuns(getUserId())
      .then((runs) => setHasRuns(runs.length > 0))
      .catch(() => setHasRuns(false));

    getHealth()
      .then((h) => setOnline(h.status === 'ok'))
      .catch(() => setOnline(false));
  }, []);

  // Checkbox handler. Checking opens the inline input; unchecking
  // disables admin mode (or just closes the not-yet-submitted input).
  function onAdminToggle(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setTokenOpen(true);
      setTokenError(null);
    } else {
      setTokenOpen(false);
      setTokenInput('');
      setTokenError(null);
      if (isAdmin) disableAdmin();
    }
  }

  async function onTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setTokenError(null);
    const ok = await enableAdmin(tokenInput);
    setSubmitting(false);
    if (ok) {
      setTokenOpen(false);
      setTokenInput('');
      pushToast('Admin-Modus aktiv', 'info');
    } else {
      setTokenError('Token ungültig');
    }
  }

  function onTokenCancel() {
    setTokenOpen(false);
    setTokenInput('');
    setTokenError(null);
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
        <div className={styles.adminRow}>
          <label className={styles.adminToggle}>
            <input
              type="checkbox"
              checked={isAdmin || tokenOpen}
              onChange={onAdminToggle}
            />
            <span>Admin-Modus</span>
          </label>
          {isAdmin && (
            <Link to="/admin" className={styles.adminLink}>
              Öffnen
            </Link>
          )}
        </div>

        {tokenOpen && !isAdmin && (
          <form className={styles.tokenForm} onSubmit={onTokenSubmit}>
            <input
              type="password"
              className={styles.tokenInput}
              placeholder="Admin-Token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onTokenCancel();
              }}
              autoFocus
              disabled={submitting}
            />
            <button
              type="submit"
              className={styles.tokenSubmit}
              disabled={submitting || !tokenInput.trim()}
            >
              {submitting ? '…' : 'OK'}
            </button>
            <button
              type="button"
              className={styles.tokenCancel}
              onClick={onTokenCancel}
              disabled={submitting}
            >
              Abbrechen
            </button>
          </form>
        )}

        {tokenError && (
          <div className={styles.tokenError}>{tokenError}</div>
        )}
      </div>

      {online === false && (
        <div className={styles.statusPill}>
          Offline — Server nicht erreichbar
        </div>
      )}
    </main>
  );
}
