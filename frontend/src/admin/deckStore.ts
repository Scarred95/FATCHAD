/**
 * Admin deck store — server-synced mirror of the backend's deck records.
 *
 * Sibling of `useAdminCardStore` / `useAdminEndingStore`. Same optimistic
 * update + rollback + toast contract. Decks are small (catalog-sized),
 * `loadFromServer` pulls them all in one go.
 *
 * Notes:
 *   - Cards reference a deck by `deck_name`. The deck record may or may not
 *     exist server-side — a card with `deck_name: "Tutorial"` is valid even
 *     before anyone created the Tutorial deck record. `decksByNameOf()` lets
 *     callers ask "do we have a record for this name?"
 *   - We do NOT mirror the cards-side `setDeckEnabled` (bulk toggle every
 *     card's enabled flag). That's a card-store concern and still lives there.
 *     Toggling a *deck record's* enabled flag here cascades at publish-time
 *     via the backend's effective-enabled rule.
 */
import { create } from 'zustand';
import {
  createDeck, deleteDeck, listDecks, patchDeck, replaceDeck,
  type CreateDeckPayload, type PatchDeckPayload, type ReplaceDeckPayload,
} from '../api/admin';
import { errorMessage } from '../api/http';
import { adminToast as toast } from './utils/toast';
import type { Deck } from './types';

interface State {
  decks: Deck[];
  /** True once we've completed at least one successful loadFromServer(). */
  loaded: boolean;

  loadFromServer: () => Promise<void>;

  /** Create a new deck record on the server. Optimistic. */
  createDeck: (payload: CreateDeckPayload) => Promise<Deck | null>;
  /** Replace an existing deck record on the server. Optimistic. */
  replaceDeck: (name: string, payload: ReplaceDeckPayload) => Promise<Deck | null>;
  /** Partial update via PATCH. Optimistic. */
  patchDeck: (name: string, payload: PatchDeckPayload) => Promise<Deck | null>;
  /** Delete the deck record on the server. Optimistic. Does NOT touch cards. */
  removeDeck: (name: string) => Promise<boolean>;
  /** Convenience: flip enabled via PATCH. */
  setDeckRecordEnabled: (name: string, enabled: boolean) => Promise<boolean>;

  /** Wipe local state only. Does NOT touch the server. */
  clearLocal: () => void;
}

export const useAdminDeckStore = create<State>()((set, get) => ({
  decks: [],
  loaded: false,

  async loadFromServer() {
    try {
      const list = await listDecks({ limit: 1000 });
      set({ decks: list, loaded: true });
    } catch (e) {
      toast(`Decks konnten nicht geladen werden: ${errorMessage(e, String(e))}`, 'error');
    }
  },

  async createDeck(payload) {
    const before = get().decks;
    // Optimistic insert with a placeholder timestamp pair so the tile renders
    // immediately. Server response replaces these with the real values.
    const now = new Date().toISOString();
    const optimistic: Deck = {
      name: payload.name,
      description: payload.description ?? '',
      enabled: payload.enabled ?? true,
      unlock_rule: payload.unlock_rule ?? { kind: 'default' },
      created_at: now,
      updated_at: now,
    };
    set({ decks: [...before, optimistic] });
    try {
      const saved = await createDeck(payload);
      set({
        decks: get().decks.map((d) => (d.name === saved.name ? saved : d)),
      });
      toast('Deck erstellt', 'info');
      return saved;
    } catch (e) {
      set({ decks: before });
      toast(`Deck anlegen fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return null;
    }
  },

  async replaceDeck(name, payload) {
    const before = get().decks;
    const idx = before.findIndex((d) => d.name === name);
    if (idx < 0) {
      toast(`Unbekanntes Deck ${name}`, 'error');
      return null;
    }
    const optimistic: Deck = {
      ...before[idx],
      description: payload.description ?? '',
      enabled: payload.enabled ?? true,
      unlock_rule: payload.unlock_rule ?? { kind: 'default' },
      updated_at: new Date().toISOString(),
    };
    const next = before.slice();
    next[idx] = optimistic;
    set({ decks: next });
    try {
      const saved = await replaceDeck(name, payload);
      set({
        decks: get().decks.map((d) => (d.name === name ? saved : d)),
      });
      toast('Deck gespeichert', 'info');
      return saved;
    } catch (e) {
      set({ decks: before });
      toast(`Speichern fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return null;
    }
  },

  async patchDeck(name, payload) {
    const before = get().decks;
    const idx = before.findIndex((d) => d.name === name);
    if (idx < 0) return null;
    const optimistic: Deck = {
      ...before[idx],
      ...payload,
      updated_at: new Date().toISOString(),
    };
    const next = before.slice();
    next[idx] = optimistic;
    set({ decks: next });
    try {
      const saved = await patchDeck(name, payload);
      set({
        decks: get().decks.map((d) => (d.name === name ? saved : d)),
      });
      return saved;
    } catch (e) {
      set({ decks: before });
      toast(`Update fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return null;
    }
  },

  async removeDeck(name) {
    const before = get().decks;
    set({ decks: before.filter((d) => d.name !== name) });
    try {
      await deleteDeck(name);
      toast('Deck gelöscht', 'info');
      return true;
    } catch (e) {
      set({ decks: before });
      toast(`Löschen fehlgeschlagen: ${errorMessage(e, String(e))}`, 'error');
      return false;
    }
  },

  async setDeckRecordEnabled(name, enabled) {
    const result = await get().patchDeck(name, { enabled });
    if (result) toast(enabled ? 'Deck aktiviert' : 'Deck deaktiviert', 'info');
    return result !== null;
  },

  clearLocal: () => set({ decks: [], loaded: false }),
}));

// --- Derived helpers ---------------------------------------------------------

/** Build a name → Deck index. */
export function decksByNameOf(decks: Deck[]): Map<string, Deck> {
  return new Map(decks.map((d) => [d.name, d]));
}
