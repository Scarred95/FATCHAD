import { motion } from 'framer-motion';
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
      {delta !== undefined && delta !== 0 && (
        <motion.span
          className={styles.delta}
          key={delta + ':' + value}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -22 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          {delta > 0 ? `+${delta}` : delta}
        </motion.span>
      )}
    </div>
  );
}
