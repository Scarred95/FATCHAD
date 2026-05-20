/**
 * Admin card store — server-synced mirror of the backend's card catalogue.
 *
 * The original standalone CardEditor was an offline tool: it stored
 * everything in localStorage so a refresh wouldn't drop your work. Inside
 * the FATCHAD website, the backend (MongoDB via `/api/admin`) is the
 * single source of truth.
 *
 * Behavior:
 *   - `loadFromServer()` populates the store via `listCards({ limit: 1000 })`.
 *   - Mutating actions (`upsertCard`, `removeCard`, `duplicateCard`) apply
 *     an optimistic local update, then push to the server. On failure they
 *     roll back and surface a toast via `useToastStore`.
 *   - `saved` tracks whether the card exists server-side. Newly created
 *     cards start unsaved and flip to saved on a successful POST.
 *   - `nodePositions` is the only thing persisted to localStorage (under
 *     `fatchad-admin-node-positions`) — it's pure UI state.
 *   - `importCards` bulk-upserts to the server, returning per-policy
 *     counts plus a `failed` count for partial-failure summaries.
 *   - `clearLocal()` resets the in-memory store but does NOT touch the
 *     server.
 */
import { create } from 'zustand';
import {
  createCard, deleteCard, listCards, patchCard, replaceCard, toggleDeck,
  AdminApiError, type AdminCard,
} from '../api/admin';
import { useToastStore } from '../stores/toastStore';
import { dropRecent, markRecent } from './utils/recents';
import { ORPHAN_DECK, type Card } from './types';

const NODE_POSITIONS_KEY = 'fatchad-admin-node-positions';

function loadNodePositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(NODE_POSITIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, { x: number; y: number }>;
  } catch {
    return {};
  }
}

function saveNodePositions(positions: Record<string, { x: number; y: number }>): void {
  try {
    localStorage.setItem(NODE_POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    /* quota / private mode — ignore */
  }
}

function toast(msg: string, variant: 'info' | 'warning' | 'error' = 'info'): void {
  useToastStore.getState().push(msg, variant);
}

function errMessage(e: unknown): string {
  if (e instanceof AdminApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return String(e);
}

export interface ImportResult {
  added: number;
  replaced: number;
  skipped: number;
  failed: number;
}

interface State {
  cards: Card[];
  /** True once we've completed at least one successful loadFromServer(). */
  loaded: boolean;
  /** True iff the card is known to exist on the server. */
  saved: Record<string, true>;
  /** Manual overrides for the graph view (set by drag) — persisted to localStorage. */
  nodePositions: Record<string, { x: number; y: number }>;

  loadFromServer: () => Promise<void>;

  setCards: (next: Card[]) => void;
  /** Local-only add (used by QuickAdd before it calls upsertCard). */
  addCard: (card: Card) => void;
  /** Save (create or replace) on the server, optimistic local update. */
  upsertCard: (card: Card) => Promise<boolean>;
  /** Delete on the server, optimistic local update. */
  removeCard: (id: string) => Promise<boolean>;
  /** Duplicate locally + create on server. */
  duplicateCard: (id: string, newId: string) => Promise<boolean>;
  /** Flip the `enabled` flag for a single card via PATCH. Optimistic. */
  setCardEnabled: (id: string, enabled: boolean) => Promise<boolean>;
  /** Bulk-toggle every card in a deck via the dedicated endpoint. */
  setDeckEnabled: (deckName: string, enabled: boolean) => Promise<boolean>;
  markSaved: (id: string) => void;

  setNodePosition: (id: string, pos: { x: number; y: number }) => void;
  clearNodePositions: () => void;

  /** Bulk upsert from imported JSON. Hits the server once per card. */
  importCards: (incoming: Card[], policy: 'replace' | 'keep' | 'skip') => Promise<ImportResult>;

  /** Wipe local state only. Does NOT touch the server. */
  clearLocal: () => void;
}

export const useAdminCardStore = create<State>()((set, get) => ({
  cards: [],
  loaded: false,
  saved: {},
  nodePositions: loadNodePositions(),

  async loadFromServer() {
    try {
      const list = await listCards({ limit: 1000 });
      const saved: Record<string, true> = {};
      for (const c of list) saved[c._id] = true;
      set({ cards: list as Card[], saved, loaded: true });
    } catch (e) {
      toast(`Karten konnten nicht geladen werden: ${errMessage(e)}`, 'error');
      // Keep loaded=false so callers can decide to retry.
    }
  },

  setCards: (next) => {
    const saved: Record<string, true> = {};
    for (const c of next) saved[c._id] = true;
    set({ cards: next, saved });
  },

  addCard: (card) => set((s) => ({
    cards: [...s.cards, card],
  })),

  async upsertCard(card) {
    const before = get().cards;
    const beforeSaved = get().saved;
    const existsLocally = before.some((c) => c._id === card._id);
    const existsOnServer = !!beforeSaved[card._id];

    // Optimistic update.
    const nextCards = existsLocally
      ? before.map((c) => (c._id === card._id ? card : c))
      : [...before, card];
    set({ cards: nextCards });

    try {
      if (existsOnServer) {
        await replaceCard(card._id, card as AdminCard);
        toast('Karte gespeichert', 'info');
      } else {
        await createCard(card as AdminCard);
        toast('Karte erstellt', 'info');
      }
      set((s) => ({ saved: { ...s.saved, [card._id]: true } }));
      markRecent(card._id);
      return true;
    } catch (e) {
      // Roll back the local change.
      set({ cards: before, saved: beforeSaved });
      toast(`Speichern fehlgeschlagen: ${errMessage(e)}`, 'error');
      return false;
    }
  },

  async removeCard(id) {
    const before = get().cards;
    const beforeSaved = get().saved;
    const existsOnServer = !!beforeSaved[id];

    set({
      cards: before.filter((c) => c._id !== id),
      saved: Object.fromEntries(Object.entries(beforeSaved).filter(([k]) => k !== id)),
    });

    if (!existsOnServer) {
      dropRecent(id);
      toast('Karte verworfen', 'info');
      return true;
    }

    try {
      await deleteCard(id);
      dropRecent(id);
      toast('Karte gelöscht', 'info');
      return true;
    } catch (e) {
      set({ cards: before, saved: beforeSaved });
      toast(`Löschen fehlgeschlagen: ${errMessage(e)}`, 'error');
      return false;
    }
  },

  async duplicateCard(id, newId) {
    const before = get().cards;
    const src = before.find((c) => c._id === id);
    if (!src) return false;
    const clone: Card = { ...JSON.parse(JSON.stringify(src)), _id: newId };

    // Optimistic local insert.
    set({ cards: [...before, clone] });

    try {
      await createCard(clone as AdminCard);
      set((s) => ({ saved: { ...s.saved, [newId]: true } }));
      markRecent(newId);
      toast('Karte dupliziert', 'info');
      return true;
    } catch (e) {
      set({ cards: before });
      toast(`Duplizieren fehlgeschlagen: ${errMessage(e)}`, 'error');
      return false;
    }
  },

  async setCardEnabled(id, enabled) {
    const before = get().cards;
    const idx = before.findIndex((c) => c._id === id);
    if (idx < 0) return false;

    // Optimistic update.
    const next = before.slice();
    next[idx] = { ...next[idx], enabled };
    set({ cards: next });

    try {
      await patchCard(id, { enabled });
      toast(enabled ? 'Karte aktiviert' : 'Karte deaktiviert', 'info');
      return true;
    } catch (e) {
      set({ cards: before });
      toast(`Status konnte nicht geändert werden: ${errMessage(e)}`, 'error');
      return false;
    }
  },

  async setDeckEnabled(deckName, enabled) {
    const before = get().cards;

    // Optimistic local sweep.
    const next = before.map((c) =>
      isInDeck(c, deckName) ? { ...c, enabled } : c,
    );
    set({ cards: next });

    try {
      const result = await toggleDeck(deckName, enabled);
      toast(
        enabled
          ? `${result.modified} Karte(n) aktiviert`
          : `${result.modified} Karte(n) deaktiviert`,
        'info',
      );
      return true;
    } catch (e) {
      set({ cards: before });
      toast(`Deck-Toggle fehlgeschlagen: ${errMessage(e)}`, 'error');
      return false;
    }
  },

  markSaved: (id) => set((s) => ({ saved: { ...s.saved, [id]: true } })),

  setNodePosition: (id, pos) => set((s) => {
    const next = { ...s.nodePositions, [id]: pos };
    saveNodePositions(next);
    return { nodePositions: next };
  }),

  clearNodePositions: () => {
    saveNodePositions({});
    set({ nodePositions: {} });
  },

  async importCards(incoming, policy) {
    const before = get().cards;
    const beforeSaved = get().saved;
    const byId = new Map(before.map((c) => [c._id, c]));
    let added = 0, replaced = 0, skipped = 0, failed = 0;

    type Op =
      | { kind: 'create'; card: Card }
      | { kind: 'replace'; card: Card };
    const ops: Op[] = [];

    for (const c of incoming) {
      if (byId.has(c._id)) {
        if (policy === 'replace') {
          byId.set(c._id, c);
          ops.push({ kind: 'replace', card: c });
          replaced++;
        } else {
          // keep / skip both leave existing in place
          skipped++;
        }
      } else {
        byId.set(c._id, c);
        ops.push({ kind: 'create', card: c });
        added++;
      }
    }

    // Optimistic local merge.
    set({ cards: [...byId.values()] });

    // Push to server one-by-one. Failures roll back the affected card.
    const savedUpdates: Record<string, true> = {};
    const failedIds: string[] = [];
    for (const op of ops) {
      try {
        if (op.kind === 'create') {
          await createCard(op.card as AdminCard);
        } else {
          await replaceCard(op.card._id, op.card as AdminCard);
        }
        savedUpdates[op.card._id] = true;
      } catch (e) {
        failed++;
        failedIds.push(op.card._id);
        if (op.kind === 'create') added = Math.max(0, added - 1);
        else replaced = Math.max(0, replaced - 1);
        // eslint-disable-next-line no-console
        console.error(`Import: failed for ${op.card._id}:`, e);
      }
    }

    if (failedIds.length > 0) {
      // Roll back the failed cards in the local store to their pre-import state
      // (or remove them entirely if they were new).
      const failedSet = new Set(failedIds);
      const reconciled = get().cards
        .filter((c) => !(failedSet.has(c._id) && !beforeSaved[c._id]))
        .map((c) => (failedSet.has(c._id) ? before.find((b) => b._id === c._id) ?? c : c));
      set({
        cards: reconciled,
        saved: { ...beforeSaved, ...savedUpdates },
      });
      toast(`${failedIds.length} Karte(n) konnten nicht gespeichert werden`, 'error');
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

  clearLocal: () => set({ cards: [], saved: {} }),
}));

// --- Derived helpers (computed outside the store to avoid stale subscriptions) ---

export function decksOf(cards: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const c of cards) {
    const key = c.deck_name ?? '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

/**
 * Does this card belong to the given deck?
 *
 * `deckKey` is canonical: a real deck_name OR the `ORPHAN_DECK` sentinel
 * (`'__orphans__'`). Empty string is also accepted as a synonym for the
 * orphan bucket so callers iterating `decksOf()` (which uses `''` keys)
 * don't have to normalize first.
 */
export function isInDeck(c: Card, deckKey: string): boolean {
  if (deckKey === ORPHAN_DECK || deckKey === '') return !c.deck_name;
  return c.deck_name === deckKey;
}

/** All cards in a given deck. See `isInDeck` for the deckKey contract. */
export function cardsInDeck(cards: Card[], deckKey: string): Card[] {
  return cards.filter((c) => isInDeck(c, deckKey));
}

export function deckNamesOf(cards: Card[]): string[] {
  const set = new Set<string>();
  for (const c of cards) if (c.deck_name) set.add(c.deck_name);
  return [...set].sort();
}

export function categoryNamesOf(cards: Card[]): string[] {
  const set = new Set<string>();
  for (const c of cards) if (c.category) set.add(c.category);
  return [...set].sort();
}

export function flagInventoryOf(cards: Card[]): string[] {
  const set = new Set<string>();
  for (const c of cards) {
    c.requires?.flags_all?.forEach((f) => set.add(f));
    c.requires?.flags_none?.forEach((f) => set.add(f));
    c.requires?.flags_any?.forEach((f) => set.add(f));
    for (const ch of c.choices ?? []) {
      ch.sets_flags?.forEach((f) => set.add(f));
      ch.clears_flags?.forEach((f) => set.add(f));
    }
  }
  return [...set].sort();
}

export function endingInventoryOf(cards: Card[]): string[] {
  const set = new Set<string>();
  for (const c of cards) {
    for (const ch of c.choices ?? []) {
      if (ch.triggers_ending) set.add(ch.triggers_ending);
    }
  }
  return [...set].sort();
}

// "Added by" — cards whose adds_to_deck references targetId.
export function referrersOf(cards: Card[], targetId: string): Card[] {
  return cards.filter((c) =>
    c.choices?.some((ch) =>
      ch.adds_to_deck?.some((d) => d.card_id === targetId),
    ),
  );
}
