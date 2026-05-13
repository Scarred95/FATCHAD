import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { MainStatName } from '../../api/types';
import StatIcon from '../StatIcon/StatIcon';
import styles from './StatBar.module.css';

interface Props {
  stat: MainStatName;
  value: number;
  /** Recently-applied delta — drives the floating "+10" / "-10" indicator. */
  delta?: number;
}

const LABEL: Record<MainStatName, string> = {
  moneten: 'Moneten',
  aura: 'Aura',
  respekt: 'Respekt',
  rizz: 'Rizz',
};

const STAT_COLOR: Record<MainStatName, string> = {
  moneten: 'var(--color-stat-moneten)',
  aura: 'var(--color-stat-aura)',
  respekt: 'var(--color-stat-respekt)',
  rizz: 'var(--color-stat-rizz)',
};

export default function StatBar({ stat, value, delta }: Props) {
  const danger = value <= 15 || value >= 85;
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (delta && delta !== 0) setPulseKey((k) => k + 1);
  }, [delta]);

  return (
    <div
      className={styles.wrap}
      data-danger={danger}
      style={{ ['--stat-color' as any]: STAT_COLOR[stat] }}
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
      <span className="sr-only">{LABEL[stat]}: {value}</span>
      <AnimatePresence>
        {delta !== undefined && delta !== 0 && (
          <motion.span
            key={pulseKey}
            className={styles.delta}
            data-sign={delta > 0 ? 'pos' : 'neg'}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -22 }}
            exit={{ opacity: 0, y: -34 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
