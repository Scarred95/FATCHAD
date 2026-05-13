import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import type { CardResponse } from '../../api/types';
import HintList from '../HintIcon/HintList';
import styles from './Card.module.css';
import { useCardSwipe } from './useCardSwipe';

interface Props {
  card: CardResponse;
  /** When true, the card is swipeable. 3-choice cards pass false. */
  swipeable?: boolean;
  /** Fires on swipe-commit. index 0 = swipe left, 1 = swipe right. */
  onCommit?: (index: 0 | 1) => void;
  /** Bubbles the current swipe intent so callers can highlight choice buttons. */
  onIntentChange?: (intent: -1 | 0 | 1) => void;
}

/**
 * Card owns its swipe state so each instance gets a fresh motion value.
 * When AnimatePresence unmounts the exiting card, its motion values die
 * with it — preventing any leak (e.g. a finished flyOff value) from
 * affecting the next card.
 */
export default function Card({ card, swipeable = true, onCommit, onIntentChange }: Props) {
  const swipe = useCardSwipe({
    enabled: swipeable,
    onCommit: (i) => onCommit?.(i),
  });

  useEffect(() => {
    onIntentChange?.(swipe.intent);
  }, [swipe.intent, onIntentChange]);

  const activeChoiceIndex = swipe.intent === -1 ? 0 : swipe.intent === 1 ? 1 : null;
  const activeChoice = activeChoiceIndex !== null ? card.choices[activeChoiceIndex] : null;

  return (
    <motion.div
      className={styles.card}
      drag={swipeable ? 'x' : false}
      dragElastic={0.2}
      dragMomentum={false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={swipe.onDragEnd}
      style={swipeable ? { x: swipe.x, rotate: swipe.rotate, opacity: swipe.opacity } : undefined}
      data-intent={swipe.intent}
      whileTap={swipeable ? { cursor: 'grabbing' } : undefined}
    >
      {card.image_url && (
        <div className={styles.image} style={{ backgroundImage: `url(${card.image_url})` }}>
          <div className={styles.imageFade} aria-hidden />
        </div>
      )}

      <div className={styles.body}>
        <h2 className={`display ${styles.title}`}>{card.title}</h2>
        <p className={styles.description}>{card.description}</p>
      </div>

      <div className={styles.hintFooter}>
        <AnimatePresence mode="wait">
          {activeChoice && (
            <motion.div
              key={activeChoiceIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16 }}
            >
              <HintList hints={activeChoice.hints} align="center" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Commit-edge hint labels */}
      {swipeable && (
        <>
          <div className={styles.edgeLabel} data-side="left" data-active={swipe.intent === -1}>
            REL
          </div>
          <div className={styles.edgeLabel} data-side="right" data-active={swipe.intent === 1}>
            REL
          </div>
        </>
      )}
    </motion.div>
  );
}
