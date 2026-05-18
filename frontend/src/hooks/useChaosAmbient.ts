/**
 * Sync the current chaos value into the document's CSS custom properties so
 * background gradients, accent shifts, and ambient effects can pick it up.
 *
 * The chaos value comes in as -100..+100 from game state; we expose:
 *   --chaos-signed   -1..+1 (polarity)
 *   --chaos           0..1  (magnitude — for "intensity" effects)
 */
import { useEffect } from 'react';

export function useChaosAmbient(chaos: number | undefined | null) {
  useEffect(() => {
    const el = document.documentElement;
    const c = typeof chaos === 'number' ? chaos : 0;
    const signed = Math.max(-1, Math.min(1, c / 100));
    const mag = Math.abs(signed);
    el.style.setProperty('--chaos-signed', signed.toFixed(3));
    el.style.setProperty('--chaos', mag.toFixed(3));
    el.dataset.chaos = c.toString();
    // Above |chaos| 75 the world starts to glitch — a body class swaps in
    // the scanline overlay defined in globals.css. Threshold is intentionally
    // lower than the ±100 endgame so the player has visual warning.
    document.body.classList.toggle('chaosExtreme', Math.abs(c) >= 75);
    return () => {
      el.style.setProperty('--chaos-signed', '0');
      el.style.setProperty('--chaos', '0');
      el.dataset.chaos = '0';
      document.body.classList.remove('chaosExtreme');
    };
  }, [chaos]);
}
