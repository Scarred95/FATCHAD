import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHealth } from '../api/client';
import Header, { BackArrow, IconButton } from '../components/Header/Header';
import styles from './About.module.css';

export default function About() {
  const nav = useNavigate();
  const [health, setHealth] = useState<{ ok: boolean; db: boolean } | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => setHealth({ ok: h.status === 'ok', db: h.db }))
      .catch(() => setHealth({ ok: false, db: false }));
  }, []);

  return (
    <main className={`page ${styles.page}`}>
      <Header
        left={<IconButton label="Zurück" onClick={() => nav('/')}><BackArrow /></IconButton>}
        center="Über"
      />

      <motion.div
        className={styles.body}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <section className={styles.section}>
          <h2 className={`display ${styles.h}`}>Was ist FATCHAD?</h2>
          <p>
            Ein Reigns-artiges Karten-Spiel über schlechte Entscheidungen und globale
            Konsequenzen. Du wischst, die Welt zerbricht. Es bleibt zu hoffen, dass du
            keine Verantwortung trägst.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={`display ${styles.h}`}>Stats</h2>
          <ul className={styles.statList}>
            <li><strong>Moneten</strong> — Geld &amp; Ressourcen</li>
            <li><strong>Aura</strong> — öffentliches Bild</li>
            <li><strong>Respekt</strong> — politischer Stand</li>
            <li><strong>Rizz</strong> — persönliche Anziehung</li>
            <li><strong>Chaos</strong> — systemische Instabilität (±100 = Sieg)</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={`display ${styles.h}`}>Credits</h2>
          <p className={styles.dim}>
            Backend: FastAPI, Motor, MongoDB.<br />
            Frontend: React, Vite, Framer Motion, Zustand.<br />
            Schriften: Anton, Inter.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={`display ${styles.h}`}>Status</h2>
          <p className={styles.dim}>
            Server: <span className={styles.healthDot} data-ok={health?.ok ? 'true' : 'false'} />
            {health === null ? 'prüfe…' : health.ok ? 'erreichbar' : 'offline'}
            {' · '}
            DB: {health === null ? '…' : health.db ? 'ok' : 'offline'}
          </p>
        </section>
      </motion.div>
    </main>
  );
}
