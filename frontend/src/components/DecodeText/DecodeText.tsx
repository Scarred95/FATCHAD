/** Scramble-in text: on mount each unresolved character flickers through random
 *  glyphs, then settles. Letters lock in a shuffled (random) order rather than
 *  strictly left-to-right, so the decode looks like it's resolving all over the
 *  string at once.
 *
 *  After the initial decode, an idle loop keeps the line alive: every so often a
 *  few random letters re-scramble for ~half a second, then snap back to the real
 *  character. Honours both reducedMotion and disableGlitch by rendering the final
 *  text immediately (no animation, no idle re-scramble). */
import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

const GLYPHS = '!<>-_\\/[]{}=+*^?#________01';

function randGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

export default function DecodeText({
  text,
  className,
  tickMs = 22,
  charsPerStep = 1.2,
}: {
  text: string;
  className?: string;
  /** Frame interval in ms; lower = faster scramble. */
  tickMs?: number;
  /** Characters resolved per frame; >1 locks multiple letters at once. */
  charsPerStep?: number;
}) {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const disableGlitch = useSettingsStore((s) => s.disableGlitch);
  const skip = reducedMotion || disableGlitch;
  const [display, setDisplay] = useState(skip ? text : '');
  // Indices currently re-scrambling during the idle phase.
  const scrambling = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (skip) {
      setDisplay(text);
      return;
    }
    const nonSpace = text
      .split('')
      .map((ch, i) => (ch === ' ' ? -1 : i))
      .filter((i) => i >= 0);

    // Shuffle the non-space indices so letters resolve in a random order.
    const order = [...nonSpace];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let revealedCount = 0;
    let decoding = true;
    let last = '';

    // Render every frame: spaces stay; during decode, unlocked letters flicker;
    // after decode, only the idle-scrambling letters flicker.
    const frame = setInterval(() => {
      if (decoding) {
        revealedCount = Math.min(order.length, revealedCount + charsPerStep);
        if (revealedCount >= order.length) decoding = false;
      }
      // Idle with nothing scrambling → output is just `text`; skip the rebuild
      // and the redundant setState so the loop costs nothing while at rest.
      if (!decoding && scrambling.current.size === 0) {
        if (last !== text) {
          last = text;
          setDisplay(text);
        }
        return;
      }
      const locked = new Set(order.slice(0, Math.floor(revealedCount)));
      const out = text
        .split('')
        .map((ch, i) => {
          if (ch === ' ') return ch;
          if (decoding) return locked.has(i) ? ch : randGlyph();
          return scrambling.current.has(i) ? randGlyph() : ch;
        })
        .join('');
      last = out;
      setDisplay(out);
    }, tickMs);

    // Idle re-scramble: pick a few random letters, glitch them for ~half a
    // second, then release. Schedule the next burst at a random gap.
    function scheduleBurst() {
      const gap = 1600 + Math.random() * 2600; // 1.6–4.2s between bursts
      const t = setTimeout(() => {
        if (!decoding && nonSpace.length) {
          const n = 1 + Math.floor(Math.random() * 3); // 1–3 letters
          const picked = new Set<number>();
          for (let k = 0; k < n; k++) {
            picked.add(nonSpace[Math.floor(Math.random() * nonSpace.length)]);
          }
          picked.forEach((i) => scrambling.current.add(i));
          const release = setTimeout(() => {
            picked.forEach((i) => scrambling.current.delete(i));
          }, 350 + Math.random() * 300); // ~0.35–0.65s scrambled
          timeouts.push(release);
        }
        scheduleBurst();
      }, gap);
      timeouts.push(t);
    }
    scheduleBurst();

    return () => {
      clearInterval(frame);
      timeouts.forEach(clearTimeout);
      scrambling.current.clear();
    };
  }, [text, skip, tickMs, charsPerStep]);

  // nbsp keeps the line from collapsing on the first (empty) frame.
  return <span className={className}>{display || '\u00A0'}</span>;
}
