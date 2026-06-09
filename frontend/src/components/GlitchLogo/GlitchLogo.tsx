/** The FATCHAD wordmark. An italic (skewed) lean, a letter-by-letter drop-in on
 *  mount, then three layered, pure-CSS glitch effects take over:
 *  1. Chromatic (RGB) split — pink/cyan text-shadow offset to either side, always
 *     on, gently breathing.
 *  2. Per-letter glitch bursts — each letter runs the same tear animation on its
 *     own staggered timer (--glitch-delay/--glitch-dur), so a random letter or
 *     two is glitching at any moment rather than all in unison.
 *  3. Neon flicker — a whole-word pink drop-shadow that stutters like failing
 *     neon.
 *  Each letter is two nested spans: the outer motion.span owns the drop-in
 *  transform, the inner .char owns the ongoing CSS glitch transform — so the two
 *  never fight over the `transform` property. The per-letter glitch timings are
 *  seeded from the character index (not Math.random) so they stay stable across
 *  re-renders. disableGlitch / reducedMotion strip the effects back to a clean
 *  wordmark (CSS), and reducedMotion also skips the drop-in. */
import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import styles from './GlitchLogo.module.css';

const WORD = 'FATCHAD';

// Hand-picked offsets so no two letters glitch in sync; staying off Math.random
// keeps the cadence identical between renders.
const DELAYS = [0, 2.6, 1.1, 3.4, 0.5, 4.2, 1.9];
const DURATIONS = [5.2, 6.1, 4.7, 5.8, 6.4, 4.9, 5.5];

export default function GlitchLogo({ className }: { className?: string }) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  return (
    <h1 className={`display ${styles.logo} ${className ?? ''}`} aria-label={WORD}>
      {WORD.split('').map((ch, i) => (
        <motion.span
          key={i}
          className={styles.drop}
          aria-hidden
          // Drop from above, settling left-to-right; CSS glitch resumes after.
          initial={reducedMotion ? false : { y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26, delay: i * 0.07 }}
        >
          <span
            className={styles.char}
            style={
              {
                '--glitch-delay': `${DELAYS[i % DELAYS.length]}s`,
                '--glitch-dur': `${DURATIONS[i % DURATIONS.length]}s`,
              } as CSSProperties
            }
          >
            {ch}
          </span>
        </motion.span>
      ))}
    </h1>
  );
}
