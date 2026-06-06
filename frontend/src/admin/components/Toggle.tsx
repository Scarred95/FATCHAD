/**
 * Pill-style switch used in tile footers, list rows, and the deck-toggle
 * cells. Pure visual primitive — caller owns state.
 */
import styles from './Toggle.module.css';

interface Props {
  on: boolean;
  onToggle: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export function Toggle({ on, onToggle, ariaLabel, disabled }: Props) {
  return (
    <button
      type="button"
      className={`${styles.toggle} ${on ? styles.on : ''}`}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      aria-pressed={on}
      aria-label={ariaLabel ?? (on ? 'aktiv' : 'inaktiv')}
      disabled={disabled}
    >
      <span className={styles.knob} />
    </button>
  );
}
