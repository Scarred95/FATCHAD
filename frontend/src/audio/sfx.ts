/**
 * Fire-and-forget sound-effect engine.
 *
 * Imperative on purpose — SFX are one-shot and don't belong to any component's
 * lifecycle, so any code can `playSfx('click')` without prop-drilling or hooks.
 *
 * Robustness: every play is wrapped so a MISSING FILE (or the browser's
 * autoplay block) results in a silent no-op rather than an error. That means
 * this whole system is safe to ship before the actual audio assets exist — it
 * just stays quiet until the files land under /audio.
 *
 * Volume/mute are read live from the settings store on every play, so the
 * Sound bubbles in the settings wheel control real output the moment assets
 * are present.
 */
import { useSettingsStore } from '../stores/settingsStore';

export type SfxId =
  | 'click' // generic UI tap (settings bubbles, primary buttons)
  | 'swipe' // committing a card choice
  | 'error' // error toast
  | 'gameOver'; // a run ended

interface SfxDef {
  url: string;
  /** Per-sound trim (0–1) so loud clips can be balanced against quiet ones. */
  gain?: number;
}

// Paths point at /audio (public dir). The files don't have to exist yet —
// playback no-ops until they do. Keep ids ↔ filenames in sync when adding clips.
const SFX: Record<SfxId, SfxDef> = {
  click: { url: '/audio/click.mp3', gain: 0.45 },
  swipe: { url: '/audio/swipe.mp3', gain: 0.7 },
  error: { url: '/audio/error.mp3', gain: 0.6 },
  gameOver: { url: '/audio/game-over.mp3', gain: 0.85 },
};

// Warm-cache elements so the first real play isn't delayed by a fetch.
const warmed = new Map<SfxId, HTMLAudioElement>();

/** Pre-fetch all clips. Safe to call on boot; missing files fail silently. */
export function preloadSfx() {
  if (typeof Audio === 'undefined') return;
  (Object.keys(SFX) as SfxId[]).forEach((id) => {
    if (warmed.has(id)) return;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('error', () => {
      /* file not present yet — stays a no-op */
    });
    a.src = SFX[id].url;
    warmed.set(id, a);
  });
}

/**
 * Global click cue. Attaches ONE delegated listener so every button / link /
 * role=button across the app plays the click sfx — no need to wire each
 * onClick. Runs in the capture phase so it still fires if a handler calls
 * stopPropagation. Opt OUT by putting `data-no-click-sfx` on the element or any
 * ancestor (e.g. the card swipe gutters, which play the swipe cue instead).
 * Idempotent — safe to call once on boot.
 */
let clickSfxBound = false;
export function initClickSfx() {
  if (typeof document === 'undefined' || clickSfxBound) return;
  clickSfxBound = true;
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null;
      const hit = target?.closest('button, a[href], [role="button"]');
      if (!hit || hit.closest('[data-no-click-sfx]')) return;
      playSfx('click');
    },
    true,
  );
}

/** Play a one-shot effect. No-ops when muted, volume 0, or the file is absent. */
export function playSfx(id: SfxId) {
  if (typeof Audio === 'undefined') return;
  const def = SFX[id];
  if (!def) return;

  const { muted, volume } = useSettingsStore.getState();
  if (muted || volume <= 0) return;

  try {
    // A fresh element per play allows the same effect to overlap itself.
    const a = new Audio(def.url);
    a.volume = Math.min(1, Math.max(0, (volume / 100) * (def.gain ?? 1)));
    a.play().catch(() => {
      /* autoplay blocked or file missing — silent */
    });
  } catch {
    /* construction failed — silent */
  }
}
