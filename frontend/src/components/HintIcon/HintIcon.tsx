import type { StatHint, StatName } from '../../api/types';
import { STAT_COLOR_VAR } from '../statMeta';
import StatIcon from '../StatIcon/StatIcon';
import styles from './HintIcon.module.css';

interface Props {
  stat: StatName;
  direction: StatHint;
}

export default function HintIcon({ stat, direction }: Props) {
  if (direction === 'hidden') return null;

  return (
    <span
      className={styles.hint}
      style={{ '--stat-color': STAT_COLOR_VAR[stat] } as React.CSSProperties}
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
