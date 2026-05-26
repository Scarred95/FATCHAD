import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Card } from './types';

interface State {
  cards: Card[];
  // True once the card has been saved at least once — locks _id.
  saved: Record<string, true>;
  // Manual overrides for the graph view (set by drag).
  nodePositions: Record<string, { x: number; y: number }>;
  setCards: (next: Card[]) => void;
  addCard: (card: Card) => void;
  upsertCard: (card: Card) => void;
  removeCard: (id: string) => void;
  duplicateCard: (id: string, newId: string) => void;
  markSaved: (id: string) => void;
  setNodePosition: (id: string, pos: { x: number; y: number }) => void;
  clearNodePositions: () => void;
  importCards: (incoming: Card[], policy: 'replace' | 'keep' | 'skip') => {
    added: number; replaced: number; skipped: number;
  };
  reset: () => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      cards: [],
      saved: {},
      nodePositions: {},
      setCards: (next) => set({ cards: next }),
      addCard: (card) => set((s) => ({ cards: [...s.cards, card] })),
      upsertCard: (card) => set((s) => {
        const i = s.cards.findIndex((c) => c._id === card._id);
        if (i === -1) return { cards: [...s.cards, card] };
        const cards = [...s.cards];
        cards[i] = card;
        return { cards };
      }),
      removeCard: (id) => set((s) => ({
        cards: s.cards.filter((c) => c._id !== id),
        saved: Object.fromEntries(Object.entries(s.saved).filter(([k]) => k !== id)),
      })),
      duplicateCard: (id, newId) => set((s) => {
        const src = s.cards.find((c) => c._id === id);
        if (!src) return {};
        return { cards: [...s.cards, { ...JSON.parse(JSON.stringify(src)), _id: newId }] };
      }),
      markSaved: (id) => set((s) => ({ saved: { ...s.saved, [id]: true } })),
      setNodePosition: (id, pos) => set((s) => ({
        nodePositions: { ...s.nodePositions, [id]: pos },
      })),
      clearNodePositions: () => set({ nodePositions: {} }),
      importCards: (incoming, policy) => {
        const before = get().cards;
        const byId = new Map(before.map((c) => [c._id, c]));
        let added = 0, replaced = 0, skipped = 0;
        for (const c of incoming) {
          if (byId.has(c._id)) {
            if (policy === 'replace') { byId.set(c._id, c); replaced++; }
            else if (policy === 'skip') { skipped++; }
            else { /* keep */ skipped++; }
          } else {
            byId.set(c._id, c);
            added++;
          }
        }
        set({ cards: [...byId.values()] });
        return { added, replaced, skipped };
      },
      reset: () => set({ cards: [], saved: {}, nodePositions: {} }),
    }),
    { name: 'fatchad-card-editor' },
  ),
);

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
