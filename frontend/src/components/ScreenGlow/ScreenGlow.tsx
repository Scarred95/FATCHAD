/**
 * Fullscreen X-pattern glow that sits behind the game content. Four
 * triangles fan out from the screen center via clip-paths; each lights up
 * when swipe `intent` points its way. The top triangle is always lit, with
 * its hue/intensity driven by the current chaos value (warm at +chaos,
 * cool at -chaos, dim near 0).
 */
import styles from './ScreenGlow.module.css';

interface Props {
  /** Swipe intent: -1 = left, 1 = right, 'down' = bottom, 0 = idle. */
  intent: -1 | 0 | 1 | 'down';
  chaos: number;
  hasDown?: boolean;
}

export default function ScreenGlow({ intent, chaos, hasDown }: Props) {
  const c = typeof chaos === 'number' ? chaos : 0;
  const mag = Math.min(1, Math.abs(c) / 100);
  const alpha = 0.04 + mag * 0.4;
  const rgb = c === 0 ? '255,255,255' : c > 0 ? '255,96,32' : '96,128,255';
  const topBg = `linear-gradient(to bottom, rgba(${rgb},${alpha}) 0%, rgba(${rgb},0) 65%)`;

  return (
    <div className={styles.glow} aria-hidden>
      <div className={`${styles.gw} ${styles.top}`} style={{ opacity: 1, background: topBg }} />
      <div className={`${styles.gw} ${styles.left}${intent === -1 ? ' ' + styles.on : ''}`} />
      <div className={`${styles.gw} ${styles.right}${intent === 1 ? ' ' + styles.on : ''}`} />
      {hasDown && (
        <div className={`${styles.gw} ${styles.bottom}${intent === 'down' ? ' ' + styles.on : ''}`} />
      )}
    </div>
  );
}
