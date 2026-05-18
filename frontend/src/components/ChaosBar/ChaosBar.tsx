import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import StatIcon from '../StatIcon/StatIcon';
import styles from './ChaosBar.module.css';

interface Props {
  /** -100..+100 */
  value: number;
  delta?: number;
}

export default function ChaosBar({ value, delta }: Props) {
  // Width as % of half — capped at 50% per side.
  const pct = Math.min(50, Math.abs(value) / 2);
  const direction = value >= 0 ? 'pos' : 'neg';
  const danger = Math.abs(value) >= 85;

  // Match StatBar: keep the delta on-screen briefly, then fade. Without
  // this gate the value lingers until the next choice is submitted.
  const [showDelta, setShowDelta] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (delta && delta !== 0) {
      setPulseKey((k) => k + 1);
      setShowDelta(true);
      const t = setTimeout(() => setShowDelta(false), 1600);
      return () => clearTimeout(t);
    }
    setShowDelta(false);
  }, [delta]);

  return (
    <div className={styles.wrap} data-danger={danger}>
      <div className={styles.head}>
        <StatIcon stat="chaos" size="sm" />
        <motion.span
          key={value}
          className={styles.value}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
        >
          {value > 0 ? `+${value}` : value}
        </motion.span>
      </div>
      <div className={styles.track}>
        <div className={styles.center} aria-hidden />
        <motion.div
          className={styles.fill}
          data-direction={direction}
          initial={false}
          animate={{
            width: `${pct}%`,
            left: direction === 'pos' ? '50%' : `${50 - pct}%`,
          }}
          transition={{ type: 'spring', stiffness: 240, damping: 28 }}
        />
      </div>
      <AnimatePresence>
        {showDelta && delta !== undefined && delta !== 0 && (
          <motion.span
            key={pulseKey}
            className={styles.delta}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -22 }}
            exit={{ opacity: 0, y: -34 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
