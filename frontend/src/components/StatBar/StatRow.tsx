/**
 * The horizontal stat bar row used at the top of the Game screen.
 * Composes 4 StatBars + 1 ChaosBar. Reads recent deltas from the store
 * so individual bars can flash/pulse when something changed.
 */
import type { Stats, MainStatName } from '../../api/types';
import type { StatDelta } from '../../stores/runStore';
import StatBar from './StatBar';
import ChaosBar from '../ChaosBar/ChaosBar';
import styles from './StatRow.module.css';

interface Props {
  stats: Stats;
  deltas?: StatDelta[];
}

const MAIN: MainStatName[] = ['moneten', 'aura', 'respekt', 'rizz'];

function deltaFor(deltas: StatDelta[] | undefined, stat: keyof Stats): number | undefined {
  return deltas?.find((d) => d.stat === stat)?.amount;
}

export default function StatRow({ stats, deltas }: Props) {
  return (
    <div className={styles.row}>
      {MAIN.map((s) => (
        <StatBar key={s} stat={s} value={stats[s]} delta={deltaFor(deltas, s)} />
      ))}
      <div className={styles.divider} aria-hidden />
      <ChaosBar value={stats.chaos} delta={deltaFor(deltas, 'chaos')} />
    </div>
  );
}
