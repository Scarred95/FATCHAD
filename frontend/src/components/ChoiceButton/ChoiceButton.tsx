import { motion } from 'framer-motion';
import type { ChoicePreview } from '../../api/types';
import HintList from '../HintIcon/HintList';
import styles from './ChoiceButton.module.css';

interface Props {
  choice: ChoicePreview;
  index: number;
  /** -1 = points left, 0 = no arrow, +1 = points right. */
  arrow?: -1 | 0 | 1;
  /** When true, this choice will fire on swipe release. */
  active?: boolean;
  disabled?: boolean;
  onClick: (index: number) => void;
}

export default function ChoiceButton({ choice, index, arrow = 0, active, disabled, onClick }: Props) {
  return (
    <motion.button
      className={styles.btn}
      data-arrow={arrow}
      data-active={active ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onClick(index)}
      whileTap={{ scale: 0.97 }}
      animate={active ? { scale: 1.04 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 24 }}
    >
      {arrow === -1 && <span className={styles.arrow}>←</span>}
      <span className={styles.body}>
        <span className={styles.text}>{choice.text}</span>
        <HintList hints={choice.hints} align={arrow === -1 ? 'start' : arrow === 1 ? 'end' : 'center'} />
      </span>
      {arrow === 1 && <span className={styles.arrow}>→</span>}
    </motion.button>
  );
}
