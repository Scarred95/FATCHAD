/**
 * Typed admin API client. Every call goes through `/api/admin/*`,
 * which the backend gates behind the caller's Cognito `admin` group.
 *
 * Every request below automatically:
 *   - reads the Cognito access token (via getAccessToken)
 *   - attaches it as `Authorization: Bearer <jwt>`
 *   - on a 401, logs the session out so the user is bounced to /login
 *     (a 401 means the token is missing/expired; group checks 403)
 *
 * Domain shapes (Card, Ending, ...) live in `src/admin/types.ts` — the
 * single source of truth the whole admin surface imports. This client
 * only adds the request/response types specific to the HTTP layer.
 */
import { getAccessToken, useAuthStore } from '../stores/authStore';
import { ApiError, http } from './http';
import { ADMIN_API_BASE } from './config';
import type { Achievement, AchievementCriteria, Card, Deck, DeckUnlockRule, Ending } from '../admin/types';
import type { GameStatus, Stats } from './types';

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
  const token = getAccessToken();
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
    // 401 = token missing/expired. End the session so the guard bounces
    // the user to /login. (403 = valid token, not in the admin group.)
    if (e instanceof ApiError && e.status === 401) {
      useAuthStore.getState().logout();
      throw new ApiError(401, 'Sitzung abgelaufen — bitte neu anmelden');
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

/** Quick re-validation of the caller's admin group against the backend. */
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

/* ─── Deck endpoints ───────────────────────────────────────────── */

/** Create payload — timestamps minted server-side. Backend matches
 *  `CreateDeckRequest` in `admin_lambda/routes/decks.py`. */
export interface CreateDeckPayload {
  name: string;
  description?: string;
  enabled?: boolean;
  unlock_rule?: DeckUnlockRule;
}

/** Replace payload — `name` comes from the URL, timestamps are stamped. */
export interface ReplaceDeckPayload {
  description?: string;
  enabled?: boolean;
  unlock_rule?: DeckUnlockRule;
}

/** PATCH payload — partial update; updated_at refreshes any time. */
export type PatchDeckPayload = Partial<ReplaceDeckPayload>;

export const listDecks = (opts: { limit?: number; skip?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  if (opts.skip !== undefined) q.set('skip', String(opts.skip));
  const qs = q.toString();
  return request<Deck[]>(`/decks${qs ? `?${qs}` : ''}`);
};

export const getDeck = (deckName: string) =>
  request<Deck>(`/decks/${encodeURIComponent(deckName)}`);

export const createDeck = (payload: CreateDeckPayload) =>
  request<Deck>('/decks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const replaceDeck = (deckName: string, payload: ReplaceDeckPayload) =>
  request<Deck>(`/decks/${encodeURIComponent(deckName)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const patchDeck = (deckName: string, payload: PatchDeckPayload) =>
  request<Deck>(`/decks/${encodeURIComponent(deckName)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteDeck = (deckName: string) =>
  request<void>(`/decks/${encodeURIComponent(deckName)}`, {
    method: 'DELETE',
  });

/* ─── Achievement endpoints ────────────────────────────────────── */

/** Fields PATCH accepts — same as backend's PatchAchievementRequest. */
export type PatchAchievementPayload = Partial<
  Pick<Achievement,
    'name' | 'description' | 'criteria' | 'points'
    | 'unlocks_deck' | 'enabled' | 'image_url'
  >
>;

export const listAchievements = (opts: { limit?: number; skip?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  if (opts.skip !== undefined) q.set('skip', String(opts.skip));
  const qs = q.toString();
  return request<Achievement[]>(`/achievements${qs ? `?${qs}` : ''}`);
};

export const getAchievement = (achId: string) =>
  request<Achievement>(`/achievements/${encodeURIComponent(achId)}`);

export const createAchievement = (ach: Achievement) =>
  request<Achievement>('/achievements', {
    method: 'POST',
    body: JSON.stringify(ach),
  });

export const replaceAchievement = (achId: string, ach: Achievement) =>
  request<Achievement>(`/achievements/${encodeURIComponent(achId)}`, {
    method: 'PUT',
    body: JSON.stringify(ach),
  });

export const patchAchievement = (achId: string, payload: PatchAchievementPayload) =>
  request<Achievement>(`/achievements/${encodeURIComponent(achId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteAchievement = (achId: string) =>
  request<void>(`/achievements/${encodeURIComponent(achId)}`, {
    method: 'DELETE',
  });

// Re-export so consumers can import the criteria shape from the API barrel
// when they're already pulling other types from here.
export type { AchievementCriteria };

/* ─── Run inspection (debug) endpoints ─────────────────────────── */

/** One history row from the admin run view. Unlike the player-facing
 *  `HistoryEntry`, this carries the per-turn post-effect stat snapshot
 *  (`stats`) used by group-C achievement predicates. `null` for turns
 *  recorded before the snapshot field existed. */
export interface AdminRunHistoryEntry {
  event_id: string;
  choice: number;
  turn: number;
  stats: Stats | null;
}

/** Full run document as returned by GET /admin/runs/:user/:run/history.
 *  Read-only debugging view — mirrors backend GameState. */
export interface AdminRunView {
  _id: string;
  user_id: string;
  deck: string[];
  flags: string[];
  stats: Stats;
  history: AdminRunHistoryEntry[];
  turn: number;
  status: GameStatus;
  ending: string | null;
  active_endings: string[];
  /** Achievement ids this run granted at finalize. Empty for active runs. */
  newly_unlocked: string[];
  created_at: string;
  updated_at: string;
}

/** Fetch a run's full state + per-turn stat trail for debugging. Needs the
 *  owning user id (run rows are partitioned under USER#<uid>; no run_id GSI). */
export const getRunHistory = (userId: string, runId: string) =>
  request<AdminRunView>(
    `/runs/${encodeURIComponent(userId)}/${encodeURIComponent(runId)}/history`,
  );

/* ─── Publish endpoints ────────────────────────────────────────── */

/** Mirrors backend `CatalogPointer` — the "what is currently live?" item.
 *  `null` from getCurrentPointer means no publish has happened yet. */
export interface CatalogPointer {
  version: string;
  /** ISO 8601 timestamp string from the backend. */
  published_at: string;
}

/** Returns the currently live catalog pointer, or null before the first publish. */
export const getCurrentPointer = () =>
  request<CatalogPointer | null>('/publish/current');

/** Snapshots the working catalog as a new published version.
 *  `version` is optional — backend mints a UTC timestamp when omitted. */
export const publishCatalog = (version?: string) =>
  request<CatalogPointer>('/publish', {
    method: 'POST',
    body: JSON.stringify(version ? { version } : {}),
  });
