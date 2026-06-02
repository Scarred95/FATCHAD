import { STAT_NAMES } from '../../api/types';
import type { StatHint, StatName } from '../../api/types';
import HintIcon from './HintIcon';
import styles from './HintList.module.css';

interface Props {
  hints: Partial<Record<StatName, StatHint>>;
  align?: 'start' | 'center' | 'end';
}

export default function HintList({ hints, align = 'center' }: Props) {
  const visible = STAT_NAMES
    .filter((stat) => hints[stat] && hints[stat] !== 'hidden');

  if (visible.length === 0) return null;

  return (
    <div className={styles.list} data-align={align}>
      {visible.map((stat) => (
        <HintIcon key={stat} stat={stat} direction={hints[stat] as StatHint} />
      ))}
    </div>
  );
}
