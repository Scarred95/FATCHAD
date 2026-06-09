/**
 * Client-local display preferences. There's no backend for these — they live
 * in localStorage and are applied as data-attributes on <html>, which global
 * CSS in globals.css keys off. Call `initSettings()` once on app boot so the
 * attributes are set before first paint.
 */
import { create } from 'zustand';

const STORAGE_KEY = 'fatchad:settings';

interface PersistedSettings {
  /** Kill animations + transitions app-wide (accessibility / low-power). */
  reducedMotion: boolean;
  /** Disable the glitch/CRT decorative effects without killing all motion. */
  disableGlitch: boolean;
  /** Master mute — silences both SFX and the background music loop. */
  muted: boolean;
  /** Sound-effect volume 0–100 (consumed by audio/sfx.ts). */
  volume: number;
  /** Background-music volume 0–100 (consumed by audio/music.ts). */
  musicVolume: number;
  /** CRT scanline overlay (vault66-crt-effect `enableScanlines`). */
  crtScanlines: boolean;
  /** CRT scanline opacity 0–1 (vault66-crt-effect `scanlineOpacity`). */
  crtScanlineOpacity: number;
  /** CRT sweep animation (vault66-crt-effect `enableSweep`). */
  crtSweep: boolean;
  /** CRT edge glow (vault66-crt-effect `enableEdgeGlow`). */
  crtGlow: boolean;
}

const DEFAULTS: PersistedSettings = {
  reducedMotion: false,
  disableGlitch: false,
  muted: false,
  volume: 80,
  musicVolume: 45,
  crtScanlines: true,
  crtScanlineOpacity: 0.1,
  crtSweep: true,
  crtGlow: true,
};

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PersistedSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

function apply(s: PersistedSettings) {
  const root = document.documentElement;
  root.dataset.reducedMotion = String(s.reducedMotion);
  root.dataset.noGlitch = String(s.disableGlitch);
}

function persist(s: PersistedSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / disabled — preference just won't survive reload */
  }
}

interface SettingsStore extends PersistedSettings {
  setReducedMotion: (value: boolean) => void;
  setDisableGlitch: (value: boolean) => void;
  setMuted: (value: boolean) => void;
  setVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setCrtScanlines: (value: boolean) => void;
  setCrtScanlineOpacity: (value: number) => void;
  setCrtSweep: (value: boolean) => void;
  setCrtGlow: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...load(),

  setReducedMotion(value) {
    set({ reducedMotion: value });
    const next = get();
    apply(next);
    persist(next);
  },

  setDisableGlitch(value) {
    set({ disableGlitch: value });
    const next = get();
    apply(next);
    persist(next);
  },

  setMuted(value) {
    set({ muted: value });
    persist(get());
  },

  setVolume(value) {
    set({ volume: value });
    persist(get());
  },

  setMusicVolume(value) {
    set({ musicVolume: value });
    persist(get());
  },

  setCrtScanlines(value) {
    set({ crtScanlines: value });
    persist(get());
  },

  setCrtScanlineOpacity(value) {
    set({ crtScanlineOpacity: value });
    persist(get());
  },

  setCrtSweep(value) {
    set({ crtSweep: value });
    persist(get());
  },

  setCrtGlow(value) {
    set({ crtGlow: value });
    persist(get());
  },
}));

/** Apply the persisted preferences to <html> on app boot. */
export function initSettings() {
  apply(useSettingsStore.getState());
}
