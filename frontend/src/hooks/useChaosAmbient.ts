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
    return () => {
      el.style.setProperty('--chaos-signed', '0');
      el.style.setProperty('--chaos', '0');
      el.dataset.chaos = '0';
    };
  }, [chaos]);
}
