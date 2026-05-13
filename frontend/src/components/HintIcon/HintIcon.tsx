import type { StatHint, StatName } from '../../api/types';
import StatIcon from '../StatIcon/StatIcon';
import styles from './HintIcon.module.css';

interface Props {
  stat: StatName;
  direction: StatHint;
}

const STAT_COLOR: Record<StatName, string> = {
  moneten: 'var(--color-stat-moneten)',
  aura: 'var(--color-stat-aura)',
  respekt: 'var(--color-stat-respekt)',
  rizz: 'var(--color-stat-rizz)',
  chaos: 'var(--color-stat-chaos)',
};

export default function HintIcon({ stat, direction }: Props) {
  if (direction === 'hidden') return null;

  return (
    <span
      className={styles.hint}
      style={{ '--stat-color': STAT_COLOR[stat] } as React.CSSProperties}
      data-direction={direction}
      title={`${stat} ${direction}`}
    >
      <StatIcon stat={stat} size="sm" />
      <span className={styles.arrow} aria-hidden="true">
        {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '?'}
      </span>
    </span>
  );
}
