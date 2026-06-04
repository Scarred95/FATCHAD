/** Earned achievements overview — all trophies the player has unlocked. */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEarnedAchievements } from '../api/client';
import { errorMessage } from '../api/http';
import type { EarnedAchievement } from '../api/types';
import Header, { BackArrow } from '../components/Header/Header';
import styles from './Achievements.module.css';

export default function Achievements() {
  const nav = useNavigate();
  const [achievements, setAchievements] = useState<EarnedAchievement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEarnedAchievements()
      .then((data) => {
        data.sort((a, b) => +new Date(b.unlocked_at) - +new Date(a.unlocked_at));
        setAchievements(data);
      })
      .catch((e) => setError(errorMessage(e, 'Konnte nicht laden')));
  }, []);

  return (
    <main className={`page ${styles.page}`}>
      <Header
        left={<BackArrow />}
        center="Errungenschaften"
      />

      <div className={styles.list}>
        {achievements === null && !error && (
          <>
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
            <div className={`skeleton ${styles.skeleton}`} />
          </>
        )}

        {achievements !== null && achievements.length === 0 && (
          <motion.div
            className={styles.empty}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className={styles.emptyIcon}>🏆</div>
            <p className={styles.emptyText}>
              Noch keine Errungenschaften.<br />
              Beende Runs um sie freizuschalten.
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {achievements?.map((ach, i) => (
            <motion.div
              key={ach.id}
              className={styles.card}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.32, ease: 'easeOut' }}
            >
              <div className={styles.cardTop}>
                <span className={styles.name}>{ach.name}</span>
                <span className={styles.points}>+{ach.points} Pkt.</span>
              </div>
              {ach.description && (
                <p className={styles.desc}>{ach.description}</p>
              )}
              <div className={styles.cardBottom}>
                {ach.unlocks_deck && (
                  <span className={styles.unlock}>
                    Freischaltet: {ach.unlocks_deck}
                  </span>
                )}
                <span className={styles.date}>
                  {formatDate(ach.unlocked_at)}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
