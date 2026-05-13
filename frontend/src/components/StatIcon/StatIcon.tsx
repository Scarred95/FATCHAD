import type { StatName } from '../../api/types';
import styles from './StatIcon.module.css';

export type StatIconSize = 'sm' | 'md' | 'lg';

interface Props {
  stat: StatName;
  size?: StatIconSize;
  /** Override the stat color (e.g. for hint icons). */
  color?: string;
}

const SIZE_PX: Record<StatIconSize, number> = { sm: 16, md: 24, lg: 40 };

const STAT_COLOR: Record<StatName, string> = {
  moneten: 'var(--color-stat-moneten)',
  aura: 'var(--color-stat-aura)',
  respekt: 'var(--color-stat-respekt)',
  rizz: 'var(--color-stat-rizz)',
  chaos: 'var(--color-stat-chaos)',
};

export default function StatIcon({ stat, size = 'md', color }: Props) {
  const px = SIZE_PX[size];
  const fill = color ?? STAT_COLOR[stat];
  return (
    <span
      className={styles.icon}
      style={{ width: px, height: px, color: fill }}
      aria-label={stat}
    >
      {ICONS[stat]}
    </span>
  );
}

const ICONS: Record<StatName, JSX.Element> = {
  moneten: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  aura: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </svg>
  ),
  respekt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  ),
  rizz: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 21s-7-4.5-9.5-9C1 9 2 5 5.5 4.5 8 4 10 5.5 12 8c2-2.5 4-4 6.5-3.5C22 5 23 9 21.5 12 19 16.5 12 21 12 21z" />
    </svg>
  ),
  chaos: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="13,2 3,14 11,14 9,22 21,10 13,10" />
    </svg>
  ),
};
