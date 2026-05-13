import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteRun, listRuns } from '../api/client';
import type { RunSummary } from '../api/types';
import Header, { BackArrow, IconButton } from '../components/Header/Header';
import Modal from '../components/Modal/Modal';
import { useToastStore } from '../stores/toastStore';
import { getUserId } from '../stores/userStore';
import styles from './RunList.module.css';

export default function RunList() {
  const nav = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RunSummary | null>(null);

  async function refresh() {
    try {
      const data = await listRuns(getUserId());
      // Newest first.
      data.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
      setRuns(data);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function openRun(r: RunSummary) {
    if (r.status === 'active') nav(`/runs/${r._id}`);
    else nav(`/runs/${r._id}/end`);
  }

  async function handleDelete(r: RunSummary) {
    setConfirmDelete(null);
    try {
      await deleteRun(r._id, true);
      pushToast('Lauf gelöscht', 'info');
      await refresh();
    } catch (e) {
      pushToast(errMsg(e), 'error');
    }
  }

  return (
    <main className={`page ${styles.page}`}>
      <Header
        left={<IconButton label="Zurück" onClick={() => nav('/')}><BackArrow /></IconButton>}
        center="Deine Runden"
      />

      <div className={styles.list}>
        {runs === null && (
          <>
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
          </>
        )}

        {runs !== null && runs.length === 0 && (
          <motion.div
            className={styles.empty}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className={styles.emptyIcon}>👑</div>
            <p className={styles.emptyText}>
              Noch keine schlechten Entscheidungen getroffen.<br />
              Worauf wartest du?
            </p>
            <button
              className={styles.cta}
              onClick={() => nav('/runs/new')}
            >
              Neue Runde
            </button>
          </motion.div>
        )}

        <AnimatePresence>
          {runs?.map((r, i) => (
            <motion.button
              key={r._id}
              className={styles.runCard}
              data-status={r.status}
              onClick={() => openRun(r)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ delay: i * 0.05, duration: 0.32, ease: 'easeOut' }}
              layout
            >
              <span className={styles.statusDot} data-status={r.status} />
              <div className={styles.runMeta}>
                <span className={styles.runTitle}>
                  Lauf {r._id.slice(-4).toUpperCase()}
                </span>
                <span className={styles.runSub}>
                  Zug {r.turn} · {dominantStat(r)}
                </span>
              </div>
              <span className={styles.runStatus}>{statusLabel(r)}</span>
              <span
                className={styles.deleteBtn}
                role="button"
                aria-label="Löschen"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(r);
                }}
              >
                ✕
              </span>
            </motion.button>
          ))}
        </AnimatePresence>

        {error && <div className={styles.error}>{error}</div>}
      </div>

      <button className={styles.fixedCta} onClick={() => nav('/runs/new')}>
        + Neue Runde
      </button>

      <Modal
        open={!!confirmDelete}
        title="Wirklich löschen?"
        body={confirmDelete ? `Lauf ${confirmDelete._id.slice(-4).toUpperCase()} wird unwiderruflich entfernt.` : undefined}
        actions={[
          { label: 'Löschen', variant: 'danger', onClick: () => confirmDelete && handleDelete(confirmDelete) },
          { label: 'Abbrechen', variant: 'ghost', onClick: () => setConfirmDelete(null) },
        ]}
        onClose={() => setConfirmDelete(null)}
      />
    </main>
  );
}

function dominantStat(r: RunSummary): string {
  const entries = Object.entries(r.stats).filter(([k]) => k !== 'chaos');
  entries.sort((a, b) => Math.abs(b[1] - 50) - Math.abs(a[1] - 50));
  const [name, value] = entries[0];
  return `${name} ${value}`;
}

function statusLabel(r: RunSummary): string {
  if (r.status === 'active') return 'aktiv';
  if (r.status === 'won') return 'gewonnen';
  if (r.status === 'lost') return 'verloren';
  return 'aufgegeben';
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'detail' in e) return String((e as any).detail);
  if (e instanceof Error) return e.message;
  return 'Konnte nicht laden';
}
