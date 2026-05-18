/**
 * A choice rendered as text in the empty space next to the card. No box,
 * no background — relies on glow + arrow to communicate state. Highlights
 * when the user is dragging in its direction; tappable as a fallback for
 * desktops or accessibility.
 */
import HintList from '../HintIcon/HintList';
import type { ChoicePreview } from '../../api/types';
import styles from './OptionGutter.module.css';

type Position = 'left' | 'right' | 'down';

interface Props {
  position: Position;
  choice: ChoicePreview | undefined;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const ARROW: Record<Position, string> = {
  left: '←',
  right: '→',
  down: '↓',
};

const HINT_ALIGN: Record<Position, 'start' | 'center' | 'end'> = {
  left: 'end',
  right: 'start',
  down: 'center',
};

export default function OptionGutter({ position, choice, active, disabled, onClick }: Props) {
  if (!choice) {
    return <div className={`${styles.gutter} ${styles[position]} ${styles.empty}`} aria-hidden />;
  }
  return (
    <button
      type="button"
      className={`${styles.gutter} ${styles[position]}${active ? ' ' + styles.active : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={styles.arrow} aria-hidden>
        {ARROW[position]}
      </span>
      <span className={styles.text}>{choice.text}</span>
      <HintList hints={choice.hints} align={HINT_ALIGN[position]} />
    </button>
  );
}
