/**
 * Active-run store. Holds the current GameState, current card, and the
 * pre-fetched next card. Components dispatch actions, never call the API
 * directly.
 */
import { create } from 'zustand';
import * as api from '../api/client';
import type { CardResponse, GameState, Stats } from '../api/types';
import { getUserId } from './userStore';

export interface StatDelta {
  stat: keyof Stats;
  amount: number;
}

interface RunStore {
  state: GameState | null;
  currentCard: CardResponse | null;
  /** Set briefly between submitChoice and the next card render so animations can fire. */
  lastDeltas: StatDelta[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;

  loadRun: (runId: string) => Promise<void>;
  createRun: () => Promise<string>;
  submitChoice: (index: number) => Promise<GameState | null>;
  abandonRun: () => Promise<void>;
  exitRun: () => void;
  clearDeltas: () => void;
}

function diffStats(prev: Stats, next: Stats): StatDelta[] {
  const keys: (keyof Stats)[] = ['moneten', 'aura', 'respekt', 'rizz', 'chaos'];
  return keys
    .map((k) => ({ stat: k, amount: next[k] - prev[k] }))
    .filter((d) => d.amount !== 0);
}

export const useRunStore = create<RunStore>((set, get) => ({
  state: null,
  currentCard: null,
  lastDeltas: [],
  isLoading: false,
  isSubmitting: false,
  error: null,

  async loadRun(runId) {
    set({ isLoading: true, error: null });
    try {
      const state = await api.getRun(runId);
      let currentCard: CardResponse | null = null;
      if (state.status === 'active') {
        try {
          currentCard = await api.getCurrentCard(runId);
        } catch (e) {
          // Softlock — state will already be marked lost on the server.
          // Re-fetch to pick up the new status.
          const refreshed = await api.getRun(runId);
          set({ state: refreshed, currentCard: null, isLoading: false });
          return;
        }
      }
      set({ state, currentCard, isLoading: false });
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
    }
  },

  async createRun() {
    set({ isLoading: true, error: null });
    try {
      const { state, next_card } = await api.createRun(getUserId());
      set({
        state,
        currentCard: next_card,
        lastDeltas: [],
        isLoading: false,
      });
      return state._id;
    } catch (e) {
      set({ error: errorMessage(e), isLoading: false });
      throw e;
    }
  },

  async submitChoice(index) {
    const { state } = get();
    if (!state) return null;
    set({ isSubmitting: true, error: null });
    try {
      const prevStats = state.stats;
      const { state: next, next_card } = await api.submitChoice(
        state._id,
        index,
        state.turn,
      );
      set({
        state: next,
        currentCard: next_card,
        lastDeltas: diffStats(prevStats, next.stats),
        isSubmitting: false,
      });
      return next;
    } catch (e) {
      set({ error: errorMessage(e), isSubmitting: false });
      return null;
    }
  },

  async abandonRun() {
    const { state } = get();
    if (!state) return;
    try {
      const next = await api.abandonRun(state._id);
      set({ state: next, currentCard: null });
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  exitRun() {
    set({ state: null, currentCard: null, lastDeltas: [], error: null });
  },

  clearDeltas() {
    set({ lastDeltas: [] });
  },
}));

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'detail' in e) return String((e as any).detail);
  if (e instanceof Error) return e.message;
  return 'Etwas ist schiefgegangen';
}
