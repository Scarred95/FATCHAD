/**
 * One achievement tile in the Achievements section grid.
 *
 *   [points chip] ............................ [_id]
 *   <name>
 *   <description (clamped)>
 *   <criteria.description (mono, clamped)>
 *
 *   [↦ unlocks deck]                              [edit]  [toggle]
 */
import { useNavigate } from 'react-router-dom';
import type { Achievement } from '../types';
import { Toggle } from './Toggle';
import styles from './AchievementTile.module.css';

interface Props {
  ach: Achievement;
  onToggleEnabled: () => void;
}

export function AchievementTile({ ach, onToggleEnabled }: Props) {
  const nav = useNavigate();
  const disabled = ach.enabled === false;
  const points = ach.points ?? 0;

  return (
    <div
      className={`${styles.tile} ${disabled ? styles.off : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => nav(`/admin/achievements/${encodeURIComponent(ach._id)}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          nav(`/admin/achievements/${encodeURIComponent(ach._id)}`);
        }
      }}
    >
      <div className={styles.top}>
        <span className={styles.pointsChip}>{points} PKT</span>
        <span className={styles.spacer} />
        <span className={styles.id}>{ach._id}</span>
      </div>

      <h3 className={styles.title}>{ach.name}</h3>
      {ach.description && <p className={styles.desc}>{ach.description}</p>}

      {ach.criteria?.description && (
        <pre className={styles.crit} title="criteria.description">
          {ach.criteria.description}
        </pre>
      )}

      <div className={styles.foot}>
        {ach.unlocks_deck && (
          <span className={styles.deckChip}>↦ {ach.unlocks_deck}</span>
        )}
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.editBtn}
          onClick={(e) => {
            e.stopPropagation();
            nav(`/admin/achievements/${encodeURIComponent(ach._id)}`);
          }}
          aria-label="Achievement bearbeiten"
          title="bearbeiten"
        >✎</button>
        <Toggle on={ach.enabled !== false} onToggle={onToggleEnabled} />
      </div>
    </div>
  );
}
