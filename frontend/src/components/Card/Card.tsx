import { motion } from 'framer-motion';
import { useEffect } from 'react';
import type { CardResponse } from '../../api/types';
import CardArt from '../CardArt/CardArt';
import styles from './Card.module.css';
import { useCardSwipe, type SwipeIntent } from './useCardSwipe';

interface Props {
  card: CardResponse;
  /** When true, the card responds to drag gestures. */
  swipeable?: boolean;
  /** Whether a 3rd "down" choice exists — enables vertical swipe + foot hint. */
  hasDown?: boolean;
  /** Fires on swipe-commit. 0 = left, 1 = right, 2 = down. */
  onCommit?: (index: 0 | 1 | 2) => void;
  /** Bubbles the current swipe intent so the parent can light the gutters. */
  onIntentChange?: (intent: SwipeIntent) => void;
}

/**
 * Card owns its swipe state so each instance gets a fresh motion value.
 * When the keyed wrapper unmounts, its motion values die with it —
 * preventing any leak (e.g. a finished flyOff value) from affecting the
 * next card.
 *
 * Drag is handled via raw pointer events inside `useCardSwipe` so we can
 * apply asymmetric resistance (upward drag is soft-resisted; downward is
 * resisted when no 3rd choice). The motion values feed back into the
 * `style` prop for transforms, fly-off, and spring-back.
 */
export default function Card({
  card,
  swipeable = true,
  hasDown = false,
  onCommit,
  onIntentChange,
}: Props) {
  const swipe = useCardSwipe({
    enabled: swipeable,
    hasDown,
    onCommit: (i) => onCommit?.(i),
  });

  useEffect(() => {
    onIntentChange?.(swipe.intent);
  }, [swipe.intent, onIntentChange]);

  return (
    <motion.div
      className={styles.card}
      style={{ x: swipe.x, y: swipe.y, rotate: swipe.rotate, opacity: swipe.opacity }}
      data-intent={String(swipe.intent)}
      onPointerDown={swipeable ? swipe.onPointerDown : undefined}
      onPointerMove={swipeable ? swipe.onPointerMove : undefined}
      onPointerUp={swipeable ? swipe.onPointerUp : undefined}
      onPointerCancel={swipeable ? swipe.onPointerUp : undefined}
    >
      {card.image_url ? (
        <div className={styles.image} style={{ backgroundImage: `url(${card.image_url})` }}>
          <div className={styles.imageFade} aria-hidden />
        </div>
      ) : (
        <CardArt slug={card.id} category={card.category} deckName={card.deck_name} />
      )}

      <div className={styles.body}>
        <h2 className={`display ${styles.title}`}>{card.title}</h2>
        <p className={styles.description}>{card.description}</p>
      </div>

      <div className={styles.foot}>
        <span className={styles.footArrow}>←</span>
        <span className={styles.footText}>
          {hasDown ? 'Wische in eine Richtung. Auch nach unten.' : 'Wische links oder rechts'}
        </span>
        <span className={styles.footArrow}>{hasDown ? '↓' : '→'}</span>
      </div>
    </motion.div>
  );
}
