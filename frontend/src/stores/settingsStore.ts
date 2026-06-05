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
}

const DEFAULTS: PersistedSettings = {
  reducedMotion: false,
  disableGlitch: false,
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
}));

/** Apply the persisted preferences to <html> on app boot. */
export function initSettings() {
  apply(useSettingsStore.getState());
}
