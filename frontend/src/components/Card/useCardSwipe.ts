/**
 * Reigns-style card swipe interaction for 2-choice cards.
 *
 * Returns motion values + handlers to wire onto a Framer Motion <motion.div>:
 *   - x:        the drag distance, clamped & damped at the edges
 *   - rotate:   tilt mapped from x (max ~14deg)
 *   - intent:   -1 (committing left), +1 (committing right), 0 (centered)
 *   - onDragEnd: fires `onCommit(index)` past the threshold, springs back otherwise
 */
import { useTransform, useMotionValue, animate } from 'framer-motion';
import { useEffect, useState } from 'react';

const COMMIT_THRESHOLD = 100;
const FLY_DISTANCE = 600;

export function useCardSwipe(opts: {
  enabled: boolean;
  /** index 0 = swipe left, index 1 = swipe right. */
  onCommit: (index: 0 | 1) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-14, 0, 14]);
  const opacity = useTransform(x, [-FLY_DISTANCE, -200, 0, 200, FLY_DISTANCE], [0, 1, 1, 1, 0]);

  // Highlight which side the player is currently committing toward.
  const [intent, setIntent] = useState<-1 | 0 | 1>(0);

  useEffect(() => {
    return x.on('change', (v) => {
      if (v <= -COMMIT_THRESHOLD) setIntent(-1);
      else if (v >= COMMIT_THRESHOLD) setIntent(1);
      else setIntent(0);
    });
  }, [x]);

  function reset(immediate = false) {
    // Stop any running animation (e.g. an in-flight flyOff) — set() alone
    // doesn't cancel it, so the value would otherwise drift back off-screen.
    x.stop();
    if (immediate) x.set(0);
    else animate(x, 0, { type: 'spring', stiffness: 380, damping: 30 });
    setIntent(0);
  }

  function flyOff(direction: -1 | 1) {
    animate(x, direction * FLY_DISTANCE, {
      type: 'tween',
      ease: 'easeIn',
      duration: 0.28,
    });
  }

  function onDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (!opts.enabled) {
      reset();
      return;
    }
    const dx = info.offset.x;
    if (dx <= -COMMIT_THRESHOLD) {
      flyOff(-1);
      opts.onCommit(0);
    } else if (dx >= COMMIT_THRESHOLD) {
      flyOff(1);
      opts.onCommit(1);
    } else {
      reset();
    }
  }

  return { x, rotate, opacity, intent, onDragEnd, reset };
}
