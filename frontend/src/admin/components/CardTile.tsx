/**
 * One card tile in the Cards section grid. Pure presentational — the parent
 * owns selection state, validation, and the enable toggle handler.
 *
 * Matches the screenshot's tile shape:
 *   [category chip] [★ wichtig] ........................ [_id]
 *   <title>
 *   <description (clamped)>
 *
 *   L Auflegen.                                         [hints]
 *   R Zuhören.                                          [hints]
 *
 *   [deck chip]  Gewicht <weight>  [errors]  ...........  [toggle]
 */
import { Link } from 'react-router-dom';
import type { Card } from '../types';
import type { ValidationIssue } from '../utils/validate';
import { categoryMeta } from './categoryMeta';
import { Toggle } from './Toggle';
import styles from './CardTile.module.css';

interface Props {
  card: Card;
  issues: ValidationIssue[];
  selected?: boolean;
  onToggleEnabled: () => void;
}

const CHOICE_LABELS = ['L', 'R', 'D'] as const;

export function CardTile({ card, issues, selected, onToggleEnabled }: Props) {
  const cat = categoryMeta(card.category);
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const disabled = card.enabled === false;

  // The whole tile is a link to the editor — click anywhere except the
  // toggle/hints opens the existing CardEditor page unchanged.
  return (
    <Link
      to={`/admin/cards/${encodeURIComponent(card._id)}`}
      className={`${styles.tile} ${selected ? styles.selected : ''} ${disabled ? styles.off : ''}`}
    >
      <div className={styles.top}>
        <span
          className={styles.catChip}
          style={{ '--cat-color': cat.color } as React.CSSProperties}
        >
          <span className={styles.catDot} />
          {cat.label}
        </span>
        {card.important && (
          <span className={styles.importantChip}>★ wichtig</span>
        )}
        <span className={styles.id}>{card._id}</span>
      </div>

      <h3 className={styles.title}>{card.title}</h3>
      <p className={styles.desc}>{card.description}</p>

      <ul className={styles.choices}>
        {(card.choices ?? []).slice(0, 3).map((ch, i) => (
          <li key={i} className={styles.choice}>
            <span className={styles.choiceKey}>{CHOICE_LABELS[i]}</span>
            <span className={styles.choiceText}>{ch.text}</span>
            <HintChips card={card} choiceIndex={i} />
          </li>
        ))}
      </ul>

      <div className={styles.foot}>
        {card.deck_name && (
          <span className={styles.deckChip}>▦ {card.deck_name}</span>
        )}
        <span className={styles.stat}>
          Gewicht <b>{card.weight ?? 10}</b>
        </span>
        {errors > 0 && (
          <span className={styles.errChip}>{errors} FEHLER</span>
        )}
        {errors === 0 && warnings > 0 && (
          <span className={styles.warnChip}>{warnings} WARNUNG</span>
        )}
        <span className={styles.spacer} />
        <Toggle on={card.enabled !== false} onToggle={onToggleEnabled} />
      </div>
    </Link>
  );
}

/* ─── Hint chips ──────────────────────────────────────────────────── */

/**
 * Tiny coloured pills next to a choice showing stat hints (up/down/?).
 * Only renders for stats the choice actually hints at — silent when none.
 */
function HintChips({ card, choiceIndex }: { card: Card; choiceIndex: number }) {
  const ch = card.choices?.[choiceIndex];
  const hints = ch?.hints;
  if (!hints) return null;
  const entries = Object.entries(hints).filter(([, v]) => v && v !== 'hidden');
  if (entries.length === 0) return null;
  return (
    <span className={styles.hintChips}>
      {entries.map(([stat, hint]) => (
        <HintChip key={stat} stat={stat} hint={hint as string} />
      ))}
    </span>
  );
}

const STAT_COLOR: Record<string, string> = {
  moneten: 'var(--color-stat-moneten)',
  aura: 'var(--color-stat-aura)',
  respekt: 'var(--color-stat-respekt)',
  rizz: 'var(--color-stat-rizz)',
  chaos: 'var(--color-stat-chaos)',
};

function HintChip({ stat, hint }: { stat: string; hint: string }) {
  const sym = hint === 'up' ? '↑' : hint === 'down' ? '↓' : '?';
  return (
    <span
      className={styles.hintChip}
      style={{ '--stat-color': STAT_COLOR[stat] ?? 'var(--color-text-dim)' } as React.CSSProperties}
      title={`${stat}: ${hint}`}
    >
      {sym}
    </span>
  );
}
