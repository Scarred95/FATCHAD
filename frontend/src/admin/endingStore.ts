/**
 * Admin ending store — server-synced mirror of the backend's endings collection.
 *
 * Sibling of `useAdminCardStore`. Same optimistic-update / rollback /
 * toast contract; kept separate because endings and cards have independent
 * lifecycles and the cards store is already large.
 *
 * Behavior:
 *   - `loadFromServer()` populates the store via `listEndings({ limit: 1000 })`.
 *   - Mutating actions (`upsertEnding`, `removeEnding`, `setEndingEnabled`,
 *     `setEndingDefault`) apply optimistically, then push to the server.
 *     On failure they roll back and surface a toast.
 *   - `saved` tracks whether the ending exists server-side. Newly created
 *     ones start unsaved and flip to saved on a successful POST.
 *   - `importEndings` bulk-upserts to the server, returning per-policy
 *     counts + a `failed` count for partial-failure summaries.
 *   - `clearLocal()` resets the in-memory store but does NOT touch the
 *     server.
 */
import { create } from 'zustand';
import {
  createEnding, deleteEnding, listEndings, patchEnding, replaceEnding,
} from '../api/admin';
import { errorMessage } from '../api/http';
import { adminToast as toast } from './utils/toast';
import type { Ending } from './types';

export interface EndingImportResult {
  added: number;
  replaced: number;
  skipped: number;
  failed: number;
}

interface State {
  endings: Ending[];
  /** True once we've completed at least one successful loadFromServer(). */
  loaded: boolean;
  /** True iff the ending is known to exist on the server. */
  saved: Record<string, true>;

  loadFromServer: () => Promise<void>;

  /** Save (create or replace) on the server, optimistic local update. */
  upsertEnding: (ending: Ending) => Promise<boolean>;
  /** Delete on the server, optimistic local update. */
  removeEnding: (id: string) => Promise<boolean>;
  /** Flip the `enabled` flag for a single ending via PATCH. Optimistic. */
  setEndingEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  /** Flip the `default` flag for a single ending via PATCH. Optimistic. */
  setEndingDefault: (id: string, isDefault: boolean) => Promise<boolean>;

  /** Bulk upsert from imported JSON. Hits the server once per ending. */
  importEndings: (incoming: Ending[], policy: 'replace' | 'keep' | 'skip') => Promise<EndingImportResult>;

  /** Wipe local state only. Does NOT touch the server. */
  clearLocal: () => void;
}

export const useAdminEndingStore = create<State>()((set, get) => ({
  endings: [],
  loaded: false,
  saved: {},

  async loadFromServer() {
    try {
      const list = await listEndings({ limit: 1000 });
      const saved: Record<string, true> = {};
      for (const e of list) saved[e._id] = true;
      set({ endings: list, saved, loaded: true });
    } catch (e) {
      toast(`Endings konnten nicht geladen werden: ${errorMessage(e, String(e))}`, 'error');
    }
  },

  async upsertEnding(ending) {
    const before = get().endings;
    const beforeSaved = get().saved;
    const existsLocally = before.some((e) => e._id === ending._id);
    const existsOnServer = !!beforeSaved[ending._id];

    const nextEndings = existsLocally
      ? before.map((e) => (e._id === ending._id ? ending : e))
      : [...before, ending];
    set({ endings: nextEndings });

    try {
      if (existsOnServer) {
        await replaceEnding(ending._id, ending);
        toast('Ending gespeichert', 'info');
      } else {
        await createEnding(ending);
        toast('Ending erstellt', 'info');
      }
      set((s) => ({ saved: { ...s.saved, [ending._id]: true } }));
      return true;
    } catch (e) {
      set({ endings: before, saved: beforeSaved });
      toast(`Speichern fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async removeEnding(id) {
    const before = get().endings;
    const beforeSaved = get().saved;
    const existsOnServer = !!beforeSaved[id];

    set({
      endings: before.filter((e) => e._id !== id),
      saved: Object.fromEntries(Object.entries(beforeSaved).filter(([k]) => k !== id)),
    });

    if (!existsOnServer) {
      toast('Ending verworfen', 'info');
      return true;
    }

    try {
      await deleteEnding(id);
      toast('Ending gelöscht', 'info');
      return true;
    } catch (e) {
      set({ endings: before, saved: beforeSaved });
      toast(`Löschen fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async setEndingEnabled(id, enabled) {
    const before = get().endings;
    const idx = before.findIndex((e) => e._id === id);
    if (idx < 0) return false;

    const next = before.slice();
    next[idx] = { ...next[idx], enabled };
    set({ endings: next });

    try {
      await patchEnding(id, { enabled });
      toast(enabled ? 'Ending aktiviert' : 'Ending deaktiviert', 'info');
      return true;
    } catch (e) {
      set({ endings: before });
      toast(`Status konnte nicht geändert werden: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async setEndingDefault(id, isDefault) {
    const before = get().endings;
    const idx = before.findIndex((e) => e._id === id);
    if (idx < 0) return false;

    const next = before.slice();
    next[idx] = { ...next[idx], default: isDefault };
    set({ endings: next });

    try {
      await patchEnding(id, { default: isDefault });
      toast(isDefault ? 'Als Default markiert' : 'Default-Flag entfernt', 'info');
      return true;
    } catch (e) {
      set({ endings: before });
      toast(`Default-Flag konnte nicht geändert werden: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async importEndings(incoming, policy) {
    const before = get().endings;
    const beforeSaved = get().saved;
    const byId = new Map(before.map((e) => [e._id, e]));
    let added = 0, replaced = 0, skipped = 0, failed = 0;

    type Op =
      | { kind: 'create'; ending: Ending }
      | { kind: 'replace'; ending: Ending };
    const ops: Op[] = [];

    for (const e of incoming) {
      if (byId.has(e._id)) {
        if (policy === 'replace') {
          byId.set(e._id, e);
          ops.push({ kind: 'replace', ending: e });
          replaced++;
        } else {
          skipped++;
        }
      } else {
        byId.set(e._id, e);
        ops.push({ kind: 'create', ending: e });
        added++;
      }
    }

    set({ endings: [...byId.values()] });

    const savedUpdates: Record<string, true> = {};
    const failedIds: string[] = [];
    for (const op of ops) {
      try {
        if (op.kind === 'create') {
          await createEnding(op.ending);
        } else {
          await replaceEnding(op.ending._id, op.ending);
        }
        savedUpdates[op.ending._id] = true;
      } catch (e) {
        failed++;
        failedIds.push(op.ending._id);
        if (op.kind === 'create') added = Math.max(0, added - 1);
        else replaced = Math.max(0, replaced - 1);
        // eslint-disable-next-line no-console
        console.error(`Import: failed for ending ${op.ending._id}:`, e);
      }
    }

    if (failedIds.length > 0) {
      const failedSet = new Set(failedIds);
      const reconciled = get().endings
        .filter((e) => !(failedSet.has(e._id) && !beforeSaved[e._id]))
        .map((e) => (failedSet.has(e._id) ? before.find((b) => b._id === e._id) ?? e : e));
      set({
        endings: reconciled,
        saved: { ...beforeSaved, ...savedUpdates },
      });
      toast(`${failedIds.length} Ending(s) konnten nicht gespeichert werden`, 'error');
    } else {
      set({ saved: { ...beforeSaved, ...savedUpdates } });
      const parts: string[] = [];
      if (added) parts.push(`${added} neu`);
      if (replaced) parts.push(`${replaced} ersetzt`);
      if (skipped) parts.push(`${skipped} übersprungen`);
      if (parts.length) toast(`Import: ${parts.join(', ')}`, 'info');
    }

    return { added, replaced, skipped, failed };
  },

  clearLocal: () => set({ endings: [], saved: {} }),
}));

// --- Derived helpers ---------------------------------------------------------

export function endingsByIdOf(endings: Ending[]): Map<string, Ending> {
  return new Map(endings.map((e) => [e._id, e]));
}

export function defaultEndingsOf(endings: Ending[]): Ending[] {
  return endings.filter((e) => e.default);
}

/**
 * Count how many cards reference a given ending id across triggers/unlocks/removes.
 * Caller passes the cards list — keeps this module independent of the card store.
 */
export interface EndingRefCounts {
  triggers: number;
  unlocks: number;
  removes: number;
}

export function referencesToEnding(
  endingId: string,
  cards: { choices?: { triggers_ending?: string | null; unlocks_endings?: string[]; removes_endings?: string[] }[] }[],
): EndingRefCounts {
  const counts: EndingRefCounts = { triggers: 0, unlocks: 0, removes: 0 };
  for (const c of cards) {
    for (const ch of c.choices ?? []) {
      if (ch.triggers_ending === endingId) counts.triggers++;
      if (ch.unlocks_endings?.includes(endingId)) counts.unlocks++;
      if (ch.removes_endings?.includes(endingId)) counts.removes++;
    }
  }
  return counts;
}
