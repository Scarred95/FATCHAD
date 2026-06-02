/**
 * Typed admin API client. Every call goes through `/api/admin/*`,
 * which the backend gates behind the bearer token configured in
 * `adminAuthStore`.
 *
 * Every request below automatically:
 *   - reads the token from localStorage (via getAdminToken)
 *   - attaches it as `Authorization: Bearer <token>`
 *   - on a 401, calls `useAdminStore.getState().disable()` so the
 *     UI flips back to non-admin mode and the operator is prompted
 *     to re-enter the token
 *
 * Domain shapes (Card, Ending, ...) live in `src/admin/types.ts` — the
 * single source of truth the whole admin surface imports. This client
 * only adds the request/response types specific to the HTTP layer.
 */
import { getAdminToken, useAdminStore } from '../stores/adminAuthStore';
import { ApiError, http } from './http';
import { ADMIN_API_BASE } from './config';
import type { Card, Ending } from '../admin/types';

/* ─── Request/response types (HTTP-layer only) ─────────────────── */

/** Fields PATCH accepts — same as backend's PatchCardRequest. */
export type PatchCardPayload = Partial<
  Pick<Card,
    'title' | 'description' | 'category' | 'weight' | 'image_url'
    | 'requires' | 'choices' | 'enabled' | 'important' | 'deck_name'
  >
>;

/** Fields PATCH accepts — same as backend's PatchEndingRequest. */
export type PatchEndingPayload = Partial<
  Pick<Ending,
    'title' | 'description' | 'priority' | 'requires'
    | 'default' | 'enabled' | 'image_url'
  >
>;

/** Result shape from POST /admin/cards/decks/:name/toggle */
export interface DeckToggleResult {
  matched: number;
  modified: number;
}

/* ─── Core request helper ──────────────────────────────────────── */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  // We don't bail on a missing token — let the backend respond 401 and
  // use the same handling path below. Keeps the client honest.
  try {
    return await http<T>(`${ADMIN_API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // 401 = token rejected. Flip admin mode off so the UI re-prompts.
    if (e instanceof ApiError && e.status === 401) {
      useAdminStore.getState().disable();
      throw new ApiError(401, 'Admin-Token ungültig');
    }
    throw e;
  }
}

/* ─── Card endpoints ───────────────────────────────────────────── */

export const listCards = (opts: { category?: string; limit?: number; skip?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.category) q.set('category', opts.category);
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  if (opts.skip !== undefined) q.set('skip', String(opts.skip));
  const qs = q.toString();
  return request<Card[]>(`/cards${qs ? `?${qs}` : ''}`);
};

export const getCard = (cardId: string) =>
  request<Card>(`/cards/${encodeURIComponent(cardId)}`);

export const createCard = (card: Card) =>
  request<Card>('/cards', {
    method: 'POST',
    body: JSON.stringify(card),
  });

export const replaceCard = (cardId: string, card: Card) =>
  request<Card>(`/cards/${encodeURIComponent(cardId)}`, {
    method: 'PUT',
    body: JSON.stringify(card),
  });

export const patchCard = (cardId: string, payload: PatchCardPayload) =>
  request<Card>(`/cards/${encodeURIComponent(cardId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteCard = (cardId: string) =>
  request<void>(`/cards/${encodeURIComponent(cardId)}`, {
    method: 'DELETE',
  });

/** Bulk-toggle `enabled` on every card in a deck. Use `'__orphans__'`
 *  to target cards with no deck_name. */
export const toggleDeck = (deckName: string, enabled: boolean) =>
  request<DeckToggleResult>(
    `/cards/decks/${encodeURIComponent(deckName)}/toggle`,
    { method: 'POST', body: JSON.stringify({ enabled }) },
  );

/** Quick re-validation against the same endpoint adminAuthStore uses. */
export const adminPing = () => request<{ ok: boolean }>('/auth/ping');

/* ─── Ending endpoints ─────────────────────────────────────────── */

export const listEndings = (opts: { limit?: number; skip?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  if (opts.skip !== undefined) q.set('skip', String(opts.skip));
  const qs = q.toString();
  return request<Ending[]>(`/endings${qs ? `?${qs}` : ''}`);
};

export const getEnding = (endingId: string) =>
  request<Ending>(`/endings/${encodeURIComponent(endingId)}`);

export const createEnding = (ending: Ending) =>
  request<Ending>('/endings', {
    method: 'POST',
    body: JSON.stringify(ending),
  });

export const replaceEnding = (endingId: string, ending: Ending) =>
  request<Ending>(`/endings/${encodeURIComponent(endingId)}`, {
    method: 'PUT',
    body: JSON.stringify(ending),
  });

export const patchEnding = (endingId: string, payload: PatchEndingPayload) =>
  request<Ending>(`/endings/${encodeURIComponent(endingId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteEnding = (endingId: string) =>
  request<void>(`/endings/${encodeURIComponent(endingId)}`, {
    method: 'DELETE',
  });
