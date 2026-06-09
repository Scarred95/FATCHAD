/**
 * Background-music loop — a single, app-wide soundtrack.
 *
 * Unlike sfx.ts (fire-and-forget one-shots), music is ONE persistent element
 * that loops for the whole session, so it lives as a module singleton rather
 * than inside any component (a component would restart the track on every
 * route change / remount).
 *
 * Autoplay: browsers block audio until a user gesture, so `startMusic()` must
 * be called from within a real interaction (e.g. the login submit). It's
 * idempotent — safe to call repeatedly; only the first successful play sticks.
 *
 * Robustness: a MISSING FILE (or a still-blocked autoplay) is a silent no-op,
 * so this is safe to ship before the soundtrack asset exists under /audio.
 *
 * Volume/mute are read live from the settings store and kept in sync via a
 * subscription, so the Sound wheel's Musik slider controls real output.
 */
import { useSettingsStore } from '../stores/settingsStore';

const TRACK_URL = '/audio/soundtrack.mp3';
// Master trim so music sits comfortably under the SFX even at slider max.
const MUSIC_GAIN = 0.6;

let el: HTMLAudioElement | null = null;
let started = false;

function computeVolume(): number {
  const { muted, musicVolume } = useSettingsStore.getState();
  if (muted) return 0;
  return Math.min(1, Math.max(0, (musicVolume / 100) * MUSIC_GAIN));
}

function ensureEl(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (el) return el;
  const a = new Audio(TRACK_URL);
  a.loop = true;
  a.preload = 'auto';
  a.volume = computeVolume();
  a.addEventListener('error', () => {
    /* track not present yet — stays a no-op */
  });
  // Keep output in sync with the Sound wheel (mute + Musik slider) live.
  useSettingsStore.subscribe(() => {
    if (el) el.volume = computeVolume();
  });
  el = a;
  return el;
}

/**
 * Start (or resume) the loop. Idempotent. MUST be called from a user gesture
 * the first time, or the browser's autoplay policy will reject playback.
 */
export function startMusic() {
  if (started) return;
  const a = ensureEl();
  if (!a) return;
  started = true;
  a.volume = computeVolume();
  a.play().catch(() => {
    // Autoplay still blocked or file missing — allow a later gesture to retry.
    started = false;
  });
}

/**
 * Fallback autostart: kick the loop off on the FIRST user gesture anywhere,
 * then unbind. This covers sessions that never hit the login submit — mock
 * mode and already-authenticated reloads. Idempotent and harmless alongside
 * the explicit startMusic() on login (startMusic itself is idempotent).
 */
let autostartBound = false;
export function initMusicAutostart() {
  if (typeof document === 'undefined' || autostartBound) return;
  autostartBound = true;
  const kick = () => {
    startMusic();
    document.removeEventListener('pointerdown', kick);
    document.removeEventListener('keydown', kick);
  };
  document.addEventListener('pointerdown', kick);
  document.addEventListener('keydown', kick);
}

/** Stop the loop and rewind. */
export function stopMusic() {
  if (el) {
    el.pause();
    el.currentTime = 0;
  }
  started = false;
}
