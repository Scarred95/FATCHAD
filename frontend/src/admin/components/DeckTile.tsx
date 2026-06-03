/**
 * One deck tile in the Decks section grid.
 *
 * Layout matches the screenshot tile shape:
 *   [unlock chip] ...........................   [name]
 *   <description (clamped)>
 *
 *   ▦ N cards · M aktiv                          [enabled toggle]
 *
 * The whole tile is a `<Link>` to `/admin/decks/<name>` (the existing
 * DeckDetail page — lists the cards in this deck). The edit-record action
 * lives behind a small pencil button so the toggle and details remain the
 * dominant affordances.
 */
import { Link, useNavigate } from 'react-router-dom';
import type { Card, Deck } from '../types';
import { Toggle } from './Toggle';
import styles from './DeckTile.module.css';

interface Props {
  deck: Deck;
  cards: Card[];
  onToggleEnabled: () => void;
}

export function DeckTile({ deck, cards, onToggleEnabled }: Props) {
  const nav = useNavigate();
  const disabled = deck.enabled === false;
  const enabledCards = cards.filter((c) => c.enabled !== false).length;
  const unlock = deck.unlock_rule ?? { kind: 'default' };

  return (
    <Link
      to={`/admin/decks/${encodeURIComponent(deck.name)}`}
      className={`${styles.tile} ${disabled ? styles.off : ''}`}
    >
      <div className={styles.top}>
        <span
          className={`${styles.unlockChip} ${unlock.kind === 'achievement' ? styles.unlockAch : styles.unlockDefault}`}
        >
          {unlock.kind === 'achievement'
            ? `★ ${unlock.achievement_id ?? 'Achievement'}`
            : 'Standard'}
        </span>
        <span className={styles.spacer} />
        <span className={styles.name}>{deck.name}</span>
      </div>

      {deck.description && (
        <p className={styles.desc}>{deck.description}</p>
      )}

      <div className={styles.foot}>
        <span className={styles.stat}>
          ▦ <b>{cards.length}</b> Karten
          {cards.length > 0 && (
            <span className={styles.statDim}> · {enabledCards} aktiv</span>
          )}
        </span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.editBtn}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            nav(`/admin/decks-edit/${encodeURIComponent(deck.name)}`);
          }}
          aria-label="Deck bearbeiten"
          title="Deck bearbeiten"
        >✎</button>
        <Toggle on={deck.enabled !== false} onToggle={onToggleEnabled} />
      </div>
    </Link>
  );
}
