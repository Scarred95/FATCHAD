/**
 * Reigns-style card swipe interaction.
 *
 * Supports both 2-choice (horizontal-only) and 3-choice (horizontal + down).
 * Pointer events are handled directly so we can apply asymmetric resistance:
 * upward drag is soft-resisted (no commit happens up), and downward drag is
 * resisted further when the card has no 3rd choice. Framer Motion is still
 * used for the value transforms (rotate, opacity) and for the fly-off /
 * spring-back animations.
 *
 * Returns motion values + handlers to wire onto a Framer Motion <motion.div>:
 *   - x, y:    drag offsets, animated on commit/reset
 *   - rotate:  tilt mapped from x (max ~14deg)
 *   - opacity: fades as the card flies off in either axis
 *   - intent:  -1 (left), +1 (right), 'down' (down commit), 0 (centered)
 *   - onPointerDown / onPointerMove / onPointerUp: bind to the card element
 */
import { useTransform, useMotionValue, animate, useMotionValueEvent } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

const HCOMMIT = 100;
const VCOMMIT = 100;
const FLY_X = 600;
const FLY_Y = 700;

export type SwipeIntent = -1 | 0 | 1 | 'down';

export function useCardSwipe(opts: {
  enabled: boolean;
  /** When true, downward drag past VCOMMIT commits choice index 2. */
  hasDown?: boolean;
  /** index 0 = swipe left, 1 = swipe right, 2 = swipe down. */
  onCommit: (index: 0 | 1 | 2) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-14, 0, 14]);
  // Fade based on the dominant axis so the card dims smoothly whichever way
  // it flies off.
  const opacity = useTransform([x, y], (values) => {
    const [xv, yv] = values as [number, number];
    const m = Math.max(Math.abs(xv), Math.abs(yv));
    if (m < 200) return 1;
    if (m >= FLY_X) return 0;
    return 1 - (m - 200) / (FLY_X - 200);
  });

  const [intent, setIntent] = useState<SwipeIntent>(0);
  const drag = useRef({ active: false, sx: 0, sy: 0, pid: -1 });

  // Update the intent live as motion values change (covers both pointer
  // moves and the early frames of fly-off / spring-back).
  useMotionValueEvent(x, 'change', () => updateIntent());
  useMotionValueEvent(y, 'change', () => updateIntent());

  function updateIntent() {
    const dx = x.get();
    const dy = y.get();
    if (opts.hasDown && dy > Math.abs(dx) && dy >= VCOMMIT) setIntent('down');
    else if (dx <= -HCOMMIT) setIntent(-1);
    else if (dx >= HCOMMIT) setIntent(1);
    else setIntent(0);
  }

  const reset = useCallback(
    (immediate = false) => {
      // Stop any in-flight animation before resetting — set() alone doesn't
      // cancel a running animate(), so the value could otherwise drift.
      x.stop();
      y.stop();
      if (immediate) {
        x.set(0);
        y.set(0);
      } else {
        animate(x, 0, { type: 'spring', stiffness: 380, damping: 30 });
        animate(y, 0, { type: 'spring', stiffness: 380, damping: 30 });
      }
      setIntent(0);
    },
    [x, y],
  );

  const flyOff = useCallback(
    (dir: -1 | 1 | 'down') => {
      if (dir === 'down') {
        animate(y, FLY_Y, { type: 'tween', ease: 'easeIn', duration: 0.28 });
      } else {
        animate(x, dir * FLY_X, { type: 'tween', ease: 'easeIn', duration: 0.28 });
      }
    },
    [x, y],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!opts.enabled) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { active: true, sx: e.clientX, sy: e.clientY, pid: e.pointerId };
    },
    [opts.enabled],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = drag.current;
      if (!s.active || e.pointerId !== s.pid) return;
      let dx = e.clientX - s.sx;
      let dy = e.clientY - s.sy;
      // Upward drag never commits — soft-resist so the card barely lifts.
      if (dy < 0) dy = dy / 3;
      // No 3rd choice: also resist downward drag heavily.
      if (!opts.hasDown && dy > 0) dy = dy / 4;
      x.set(dx);
      y.set(dy);
    },
    [opts.hasDown, x, y],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = drag.current;
      if (!s.active || e.pointerId !== s.pid) return;
      s.active = false;
      if (!opts.enabled) {
        reset();
        return;
      }
      const dx = x.get();
      const dy = y.get();
      if (opts.hasDown && dy > VCOMMIT && dy > Math.abs(dx)) {
        flyOff('down');
        opts.onCommit(2);
      } else if (dx <= -HCOMMIT) {
        flyOff(-1);
        opts.onCommit(0);
      } else if (dx >= HCOMMIT) {
        flyOff(1);
        opts.onCommit(1);
      } else {
        reset();
      }
    },
    [opts, x, y, reset, flyOff],
  );

  return {
    x,
    y,
    rotate,
    opacity,
    intent,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    reset,
  };
}
