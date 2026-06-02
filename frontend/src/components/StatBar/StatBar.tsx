import { AnimatePresence, motion } from 'framer-motion';
import type { MainStatName } from '../../api/types';
import { useDeltaPulse } from '../../hooks/useDeltaPulse';
import { STAT_COLOR_VAR, STAT_LABEL } from '../statMeta';
import StatIcon from '../StatIcon/StatIcon';
import styles from './StatBar.module.css';

interface Props {
  stat: MainStatName;
  value: number;
  /** Recently-applied delta — drives the floating "+10" / "-10" indicator. */
  delta?: number;
}

export default function StatBar({ stat, value, delta }: Props) {
  const danger = value <= 15 || value >= 85;
  const { showDelta, pulseKey } = useDeltaPulse(delta);

  return (
    <div
      className={styles.wrap}
      data-danger={danger}
      style={{ '--stat-color': STAT_COLOR_VAR[stat] } as React.CSSProperties}
    >
      <div className={styles.head}>
        <StatIcon stat={stat} size="sm" />
        <motion.span
          key={value}
          className={styles.value}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
        >
          {value}
        </motion.span>
      </div>
      <div className={styles.track}>
        <motion.div
          className={styles.fill}
          initial={false}
          animate={{ width: `${value}%` }}
          transition={{ type: 'spring', stiffness: 240, damping: 28 }}
        />
        {pulseKey > 0 && (
          <motion.div
            key={pulseKey}
            className={styles.flash}
            initial={{ opacity: 0.45 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </div>
      <span className="sr-only">{STAT_LABEL[stat]}: {value}</span>
      <AnimatePresence>
        {showDelta && delta !== undefined && delta !== 0 && (
          <motion.span
            key={pulseKey}
            className={styles.delta}
            data-sign={delta > 0 ? 'pos' : 'neg'}
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
