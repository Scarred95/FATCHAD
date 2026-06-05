/** Settings — account actions, client-local display preferences, and a danger
 *  zone. There's no settings backend: display prefs live in localStorage
 *  (settingsStore) and account actions go through Cognito / the runs API. */
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteRun, listRuns } from '../api/client';
import { errorMessage } from '../api/http';
import Header, { BackArrow, IconButton } from '../components/Header/Header';
import Modal from '../components/Modal/Modal';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Settings.module.css';

export default function Settings() {
  const nav = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const isGuest = useAuthStore((s) => s.isGuest);
  const logout = useAuthStore((s) => s.logout);
  const changePassword = useAuthStore((s) => s.changePassword);

  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const disableGlitch = useSettingsStore((s) => s.disableGlitch);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);
  const setDisableGlitch = useSettingsStore((s) => s.setDisableGlitch);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

  function onLogout() {
    logout();
    pushToast('Abgemeldet', 'info');
    nav('/welcome');
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      pushToast('Passwörter stimmen nicht überein', 'error');
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(oldPw, newPw);
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      pushToast('Passwort geändert', 'info');
    } catch (e) {
      pushToast(errorMessage(e, 'Passwort konnte nicht geändert werden'), 'error');
    } finally {
      setPwBusy(false);
    }
  }

  async function onWipeRuns() {
    setConfirmWipe(false);
    setWiping(true);
    try {
      const runs = await listRuns();
      await Promise.all(runs.map((r) => deleteRun(r._id, true)));
      pushToast(`${runs.length} Läufe gelöscht`, 'info');
    } catch (e) {
      pushToast(errorMessage(e, 'Konnte nicht löschen'), 'error');
    } finally {
      setWiping(false);
    }
  }

  return (
    <main className={`page ${styles.page}`}>
      <Header
        left={<IconButton label="Zurück" onClick={() => nav('/')}><BackArrow /></IconButton>}
        center="Einstellungen"
      />

      {/* ── Account ─────────────────────────────────────────────── */}
      <motion.section
        className={styles.section}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className={styles.sectionTitle}>Konto</h2>

        {isGuest ? (
          <div className={styles.card}>
            <p className={styles.cardText}>
              Du spielst als Gast. Erstelle ein Konto, um dein Passwort zu setzen
              und deinen Fortschritt zu sichern.
            </p>
            <Link to="/register" className={styles.linkBtn}>Konto erstellen</Link>
          </div>
        ) : (
          <form className={styles.card} onSubmit={onChangePassword}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Aktuelles Passwort</span>
              <input
                type="password"
                className={styles.input}
                autoComplete="current-password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Neues Passwort</span>
              <input
                type="password"
                className={styles.input}
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Neues Passwort bestätigen</span>
              <input
                type="password"
                className={styles.input}
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
              />
            </label>
            <button type="submit" className={styles.primaryBtn} disabled={pwBusy}>
              {pwBusy ? 'Speichert…' : 'Passwort ändern'}
            </button>
          </form>
        )}

        <button type="button" className={styles.ghostBtn} onClick={onLogout}>
          Abmelden
        </button>
      </motion.section>

      {/* ── Display preferences ─────────────────────────────────── */}
      <motion.section
        className={styles.section}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h2 className={styles.sectionTitle}>Darstellung</h2>
        <div className={styles.card}>
          <label className={styles.toggle}>
            <span>
              Bewegung reduzieren
              <small className={styles.toggleHint}>Animationen &amp; Übergänge aus</small>
            </span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
          </label>
          <label className={styles.toggle}>
            <span>
              Glitch-Effekte aus
              <small className={styles.toggleHint}>Ruhigere Optik ohne Störeffekte</small>
            </span>
            <input
              type="checkbox"
              checked={disableGlitch}
              onChange={(e) => setDisableGlitch(e.target.checked)}
            />
          </label>
        </div>
      </motion.section>

      {/* ── Danger zone ─────────────────────────────────────────── */}
      <motion.section
        className={styles.section}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className={`${styles.sectionTitle} ${styles.danger}`}>Gefahrenzone</h2>
        <div className={styles.card}>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={() => setConfirmWipe(true)}
            disabled={wiping}
          >
            {wiping ? 'Löscht…' : 'Alle Läufe löschen'}
          </button>
          <button type="button" className={styles.dangerBtn} disabled title="Bald verfügbar">
            Konto löschen (bald)
          </button>
        </div>
      </motion.section>

      <Modal
        open={confirmWipe}
        title="Alle Läufe löschen?"
        body="Sämtliche gespeicherten Läufe werden unwiderruflich entfernt. Erfolge bleiben erhalten."
        actions={[
          { label: 'Alle löschen', variant: 'danger', onClick: onWipeRuns },
          { label: 'Abbrechen', variant: 'ghost', onClick: () => setConfirmWipe(false) },
        ]}
        onClose={() => setConfirmWipe(false)}
      />
    </main>
  );
}
