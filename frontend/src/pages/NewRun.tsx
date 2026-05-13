import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRunStore } from '../stores/runStore';
import { useToastStore } from '../stores/toastStore';
import styles from './NewRun.module.css';

export default function NewRun() {
  const nav = useNavigate();
  const create = useRunStore((s) => s.createRun);
  const isLoading = useRunStore((s) => s.isLoading);
  const pushToast = useToastStore((s) => s.push);
  const [skipTutorial, setSkipTutorial] = useState(false);

  async function start() {
    try {
      const id = await create();
      nav(`/runs/${id}`);
    } catch (e) {
      pushToast(errMsg(e), 'error');
    }
  }

  return (
    <main className={`page ${styles.page}`}>
      <motion.h1
        className={`display ${styles.heading}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        Bereit, die Welt<br />zu ruinieren?
      </motion.h1>

      <motion.div
        className={styles.modifiers}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <label className={styles.toggle}>
          <span>Tutorial überspringen</span>
          <input
            type="checkbox"
            checked={skipTutorial}
            onChange={(e) => setSkipTutorial(e.target.checked)}
            disabled
          />
          <small className={styles.note}>(bald)</small>
        </label>
      </motion.div>

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <button
          className={styles.start}
          onClick={start}
          disabled={isLoading}
        >
          {isLoading ? 'Startet…' : "Los geht's"}
        </button>
        <button className={styles.cancel} onClick={() => nav(-1)}>
          Abbrechen
        </button>
      </motion.div>
    </main>
  );
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'detail' in e) return String((e as any).detail);
  if (e instanceof Error) return e.message;
  return 'Konnte nicht starten';
}
