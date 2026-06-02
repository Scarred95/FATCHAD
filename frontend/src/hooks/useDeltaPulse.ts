/**
 * Gates a stat bar's floating "+N"/"-N" indicator.
 *
 * The store keeps `delta` set until the next choice, so we gate it locally:
 * each fresh non-zero delta bumps `pulseKey` (a re-render key for the
 * flash/float animations) and shows the indicator for ~1.6s — long enough
 * for the float-up to settle — before AnimatePresence exits it.
 */
import { useEffect, useState } from 'react';

const VISIBLE_MS = 1600;

export function useDeltaPulse(delta: number | undefined) {
  const [showDelta, setShowDelta] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (delta && delta !== 0) {
      setPulseKey((k) => k + 1);
      setShowDelta(true);
      const t = setTimeout(() => setShowDelta(false), VISIBLE_MS);
      return () => clearTimeout(t);
    }
    setShowDelta(false);
  }, [delta]);

  return { showDelta, pulseKey };
}
