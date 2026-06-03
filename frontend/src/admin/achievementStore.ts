/**
 * Admin achievement store — server-synced mirror of the catalogue's
 * achievements collection.
 *
 * Sibling of `useAdminEndingStore`. Same optimistic update + rollback +
 * toast contract. Achievements have no timestamps, so requests look like
 * endings: full document in, full document out.
 *
 * `saved` tracks server-existence: newly created achievements start
 * unsaved (POST) and flip to saved once the server responds.
 */
import { create } from 'zustand';
import {
  createAchievement, deleteAchievement, listAchievements,
  patchAchievement, replaceAchievement,
  type PatchAchievementPayload,
} from '../api/admin';
import { errorMessage } from '../api/http';
import { adminToast as toast } from './utils/toast';
import type { Achievement } from './types';

interface State {
  achievements: Achievement[];
  /** True once we've completed at least one successful loadFromServer(). */
  loaded: boolean;
  /** True iff the achievement is known to exist on the server. */
  saved: Record<string, true>;

  loadFromServer: () => Promise<void>;

  /** Save (create or replace) on the server, optimistic local update. */
  upsertAchievement: (ach: Achievement) => Promise<boolean>;
  /** Delete on the server, optimistic local update. */
  removeAchievement: (id: string) => Promise<boolean>;
  /** Partial update via PATCH. Optimistic. */
  patchAchievement: (id: string, payload: PatchAchievementPayload) => Promise<boolean>;
  /** Convenience: flip enabled via PATCH. */
  setAchievementEnabled: (id: string, enabled: boolean) => Promise<boolean>;

  /** Wipe local state only. Does NOT touch the server. */
  clearLocal: () => void;
}

export const useAdminAchievementStore = create<State>()((set, get) => ({
  achievements: [],
  loaded: false,
  saved: {},

  async loadFromServer() {
    try {
      const list = await listAchievements({ limit: 1000 });
      const saved: Record<string, true> = {};
      for (const a of list) saved[a._id] = true;
      set({ achievements: list, saved, loaded: true });
    } catch (e) {
      toast(`Achievements konnten nicht geladen werden: ${errorMessage(e, String(e))}`, 'error');
    }
  },

  async upsertAchievement(ach) {
    const before = get().achievements;
    const beforeSaved = get().saved;
    const existsLocally = before.some((a) => a._id === ach._id);
    const existsOnServer = !!beforeSaved[ach._id];

    const next = existsLocally
      ? before.map((a) => (a._id === ach._id ? ach : a))
      : [...before, ach];
    set({ achievements: next });

    try {
      if (existsOnServer) {
        await replaceAchievement(ach._id, ach);
        toast('Achievement gespeichert', 'info');
      } else {
        await createAchievement(ach);
        toast('Achievement erstellt', 'info');
      }
      set((s) => ({ saved: { ...s.saved, [ach._id]: true } }));
      return true;
    } catch (e) {
      set({ achievements: before, saved: beforeSaved });
      toast(`Speichern fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async removeAchievement(id) {
    const before = get().achievements;
    const beforeSaved = get().saved;
    const existsOnServer = !!beforeSaved[id];

    set({
      achievements: before.filter((a) => a._id !== id),
      saved: Object.fromEntries(Object.entries(beforeSaved).filter(([k]) => k !== id)),
    });

    if (!existsOnServer) {
      toast('Achievement verworfen', 'info');
      return true;
    }

    try {
      await deleteAchievement(id);
      toast('Achievement gelöscht', 'info');
      return true;
    } catch (e) {
      set({ achievements: before, saved: beforeSaved });
      toast(`Löschen fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async patchAchievement(id, payload) {
    const before = get().achievements;
    const idx = before.findIndex((a) => a._id === id);
    if (idx < 0) return false;

    const next = before.slice();
    next[idx] = { ...next[idx], ...payload } as Achievement;
    set({ achievements: next });

    try {
      const saved = await patchAchievement(id, payload);
      set({
        achievements: get().achievements.map((a) => (a._id === id ? saved : a)),
      });
      return true;
    } catch (e) {
      set({ achievements: before });
      toast(`Update fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async setAchievementEnabled(id, enabled) {
    const ok = await get().patchAchievement(id, { enabled });
    if (ok) toast(enabled ? 'Achievement aktiviert' : 'Achievement deaktiviert', 'info');
    return ok;
  },

  clearLocal: () => set({ achievements: [], loaded: false, saved: {} }),
}));
