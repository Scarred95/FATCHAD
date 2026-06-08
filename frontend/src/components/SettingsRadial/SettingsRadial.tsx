/** Floating settings cog (bottom-right) with a two-tier radial bubble menu.
 *
 *  Tier 1 — tapping the cog fans out category bubbles (Visuals / Sound) along
 *  an up-left arc.
 *  Tier 2 — tapping a category keeps that bubble in place and stacks its
 *  setting bubbles *above* it. Each setting bubble glows when its feature is
 *  ON and goes dark when OFF. All toggles are independent.
 *
 *  Labels are framed as positive features so "glow = enabled" reads naturally,
 *  even where the underlying store flag is inverted (muted). Visuals map to the
 *  CRT layer; Sound is persisted but not yet consumed (no audio wired). */
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useSettingsStore } from '../../stores/settingsStore';
import styles from './SettingsRadial.module.css';

type Category = 'visuals' | 'sound';

interface CategoryItem {
  id: Category;
  label: string;
  icon: string;
}

const ITEMS: CategoryItem[] = [
  { id: 'visuals', label: 'Visuals', icon: '◐' },
  { id: 'sound', label: 'Sound', icon: '♪' },
];

// Tier-1 categories fan into an arc pointing up-and-left from the corner cog.
const RADIUS = 96;
const ARC_START = 108; // degrees, CCW from +x (90 = straight up)
const ARC_END = 168; //   …          (180 = straight left)
// Tier-2 bubbles stack up-and-to-the-left of the selected category bubble, so
// the category sits at the bottom-right corner of its setting stack.
const STACK_GAP = 60;
const STACK_SHIFT_X = -90;

function spoke(i: number, n: number) {
  const t = n === 1 ? 0.5 : i / (n - 1);
  const rad = ((ARC_START + (ARC_END - ARC_START) * t) * Math.PI) / 180;
  return { x: Math.cos(rad) * RADIUS, y: -Math.sin(rad) * RADIUS };
}

type TierNode =
  | {
      kind: 'toggle';
      key: string;
      label: string;
      on: boolean;
      onClick: () => void;
      /** Optional inline slider that reveals inside the bubble while `on`. */
      slider?: { value: number; min: number; max: number; step: number; onChange: (value: number) => void };
    }
  | {
      kind: 'slider';
      key: string;
      label: string;
      value: number;
      min: number;
      max: number;
      step: number;
      display: string;
      disabled?: boolean;
      onChange: (value: number) => void;
    };

/** `showHint` renders the "Einstellungen →" nudge beside the cog — used on the
 *  front gate (Welcome) to point first-time visitors at the wheel. Off by
 *  default so the post-login Title screen stays clean. */
export default function SettingsRadial({ showHint = false }: { showHint?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Category | null>(null);

  const crtScanlines = useSettingsStore((s) => s.crtScanlines);
  const crtScanlineOpacity = useSettingsStore((s) => s.crtScanlineOpacity);
  const crtSweep = useSettingsStore((s) => s.crtSweep);
  const crtGlow = useSettingsStore((s) => s.crtGlow);
  const setCrtScanlines = useSettingsStore((s) => s.setCrtScanlines);
  const setCrtScanlineOpacity = useSettingsStore((s) => s.setCrtScanlineOpacity);
  const setCrtSweep = useSettingsStore((s) => s.setCrtSweep);
  const setCrtGlow = useSettingsStore((s) => s.setCrtGlow);
  const muted = useSettingsStore((s) => s.muted);
  const volume = useSettingsStore((s) => s.volume);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const setMuted = useSettingsStore((s) => s.setMuted);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume);

  useEscapeKey(open || tier !== null, () => {
    if (tier) setTier(null);
    else setOpen(false);
  });

  function toggleCog() {
    setOpen((o) => {
      const next = !o;
      if (!next) setTier(null);
      return next;
    });
  }

  function closeAll() {
    setOpen(false);
    setTier(null);
  }

  const visualsNodes: TierNode[] = [
    {
      kind: 'toggle',
      key: 'scan',
      label: 'Scanlines',
      on: crtScanlines,
      onClick: () => setCrtScanlines(!crtScanlines),
      // Opacity bar lives inside the Scanlines bubble, shown only while on.
      slider: { value: crtScanlineOpacity, min: 0, max: 0.4, step: 0.02, onChange: setCrtScanlineOpacity },
    },
    { kind: 'toggle', key: 'sweep', label: 'Sweep', on: crtSweep, onClick: () => setCrtSweep(!crtSweep) },
    { kind: 'toggle', key: 'glow', label: 'Glow', on: crtGlow, onClick: () => setCrtGlow(!crtGlow) },
  ];
  const soundNodes: TierNode[] = [
    { kind: 'toggle', key: 'sound', label: 'Ton', on: !muted, onClick: () => setMuted(!muted) },
    {
      kind: 'slider',
      key: 'vol',
      label: 'SFX',
      value: volume,
      min: 0,
      max: 100,
      step: 1,
      display: muted ? '—' : String(volume),
      disabled: muted,
      onChange: setVolume,
    },
    {
      kind: 'slider',
      key: 'music',
      label: 'Musik',
      value: musicVolume,
      min: 0,
      max: 100,
      step: 1,
      display: muted ? '—' : String(musicVolume),
      disabled: muted,
      onChange: setMusicVolume,
    },
  ];
  const tierNodes = tier === 'visuals' ? visualsNodes : tier === 'sound' ? soundNodes : [];

  const categoryIndex = ITEMS.findIndex((it) => it.id === tier);
  const catP = categoryIndex >= 0 ? spoke(categoryIndex, ITEMS.length) : { x: 0, y: 0 };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.scrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeAll}
          />
        )}
      </AnimatePresence>

      <div className={styles.dock}>
        {/* Tier 2 — setting bubbles stacked above the chosen category. */}
        <ul className={styles.stack} style={{ pointerEvents: tier ? 'auto' : 'none' }}>
          <AnimatePresence>
            {tier &&
              tierNodes.map((node, j) => (
                <motion.li
                  key={node.key}
                  className={styles.cell}
                  initial={{ x: catP.x, y: catP.y, scale: 0, opacity: 0 }}
                  animate={{ x: catP.x + STACK_SHIFT_X, y: catP.y - (j + 1) * STACK_GAP, scale: 1, opacity: 1 }}
                  exit={{ x: catP.x, y: catP.y, scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 24, delay: j * 0.05 }}
                >
                  {node.kind === 'toggle' ? (
                    <div className={`${styles.bubble} ${node.on ? styles.bubbleOn : ''}`}>
                      <button
                        type="button"
                        className={styles.bubbleLabel}
                        onClick={node.onClick}
                        aria-pressed={node.on}
                      >
                        {node.label}
                      </button>
                      {node.slider && node.on && (
                        <input
                          className={styles.bubbleSlider}
                          type="range"
                          min={node.slider.min}
                          max={node.slider.max}
                          step={node.slider.step}
                          value={node.slider.value}
                          onChange={(e) => node.slider!.onChange(Number(e.target.value))}
                          aria-label={`${node.label} Stärke`}
                        />
                      )}
                    </div>
                  ) : (
                    <div className={styles.volBubble} data-disabled={node.disabled}>
                      <span className={styles.volLabel}>{node.label}</span>
                      <input
                        type="range"
                        min={node.min}
                        max={node.max}
                        step={node.step}
                        value={node.value}
                        disabled={node.disabled}
                        onChange={(e) => node.onChange(Number(e.target.value))}
                        aria-label={node.label}
                      />
                      <span className={styles.volValue}>{node.display}</span>
                    </div>
                  )}
                </motion.li>
              ))}
          </AnimatePresence>
        </ul>

        {/* Tier 1 — category bubbles. The selected one stays put as the anchor. */}
        <ul className={styles.spokes} style={{ pointerEvents: open ? 'auto' : 'none' }}>
          {ITEMS.map((item, i) => {
            const p = spoke(i, ITEMS.length);
            const isSelected = tier === item.id;
            const visible = open && (tier === null || isSelected);
            return (
              <motion.li
                key={item.id}
                className={styles.spoke}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={
                  visible
                    ? { x: p.x, y: p.y, scale: isSelected ? 0.9 : 1, opacity: 1 }
                    : { x: 0, y: 0, scale: 0, opacity: 0 }
                }
                transition={{ type: 'spring', stiffness: 360, damping: 22, delay: visible ? i * 0.05 : 0 }}
              >
                <button
                  type="button"
                  className={`${styles.spokeBtn} ${isSelected ? styles.spokeBtnActive : ''}`}
                  onClick={() => setTier(isSelected ? null : item.id)}
                  aria-label={item.label}
                  aria-expanded={isSelected}
                >
                  <span className={styles.spokeIcon} aria-hidden>{item.icon}</span>
                  <span className={styles.spokeLabel}>{item.label}</span>
                </button>
              </motion.li>
            );
          })}
        </ul>

        <motion.button
          type="button"
          className={styles.cog}
          aria-label="Einstellungen"
          aria-expanded={open}
          onClick={toggleCog}
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          whileTap={{ scale: 0.92 }}
        >
          <span aria-hidden>⚙</span>
        </motion.button>

        {/* Onboarding nudge: a label + arrow pointing at the cog, shown only
            while the menu is closed so it never overlaps the fanned-out spokes. */}
        <AnimatePresence>
          {showHint && !open && (
            <motion.div
              className={styles.hint}
              // Wrapper animates opacity only; the inner spans own their own
              // looping transforms (rotate / x) so nothing fights over `transform`.
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-hidden={true}
            >
              <motion.span
                className={styles.hintText}
                animate={reducedMotion ? { rotate: 0 } : { rotate: [-2, 2, -2] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                Einstellungen
              </motion.span>

              <motion.span
                className={styles.hintArrow}
                animate={reducedMotion ? { x: 0 } : { x: [0, 15, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                →
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
