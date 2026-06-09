/** Profile — read-only identity + aggregate play stats. There's no profile
 *  edit backend yet; identity comes from the Cognito token, stats are summed
 *  client-side from the player's runs and unlocked achievements. */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteRun, listRuns, listUnlockedAchievements } from '../api/client';
import { errorMessage } from '../api/http';
import Ambient from '../components/Ambient/Ambient';
import Header, { BackArrow, IconButton } from '../components/Header/Header';
import Modal from '../components/Modal/Modal';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Profile.module.css';

type Section = 'password' | 'danger' | null;

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
  const changePassword = useAuthStore((s) => s.changePassword);
  const [agg, setAgg] = useState<Aggregate | null>(null);

  // Accordion: one settings section open at a time, expanding downward.
  const [openSection, setOpenSection] = useState<Section>(null);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

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

  function toggle(section: Exclude<Section, null>) {
    setOpenSection((cur) => (cur === section ? null : section));
  }

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
      <Ambient />

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

      <motion.section
        className={styles.settings}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className={styles.sectionTitle}>Einstellungen</h2>

        {!isGuest && (
          <AccordionItem
            label="Passwort"
            open={openSection === 'password'}
            onToggle={() => toggle('password')}
          >
            <form className={styles.form} onSubmit={onChangePassword}>
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
          </AccordionItem>
        )}

        <AccordionItem
          label="Gefahrenzone"
          danger
          open={openSection === 'danger'}
          onToggle={() => toggle('danger')}
        >
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
        </AccordionItem>
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

/** Collapsible settings row that expands downward to reveal its content. */
function AccordionItem({
  label,
  danger,
  open,
  onToggle,
  children,
}: {
  label: string;
  danger?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.accItem} data-open={open}>
      <button
        type="button"
        className={`${styles.accHeader} ${danger ? styles.accHeaderDanger : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className={styles.accChevron} data-open={open} aria-hidden>⌄</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.accBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
          >
            <div className={styles.accContent}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
