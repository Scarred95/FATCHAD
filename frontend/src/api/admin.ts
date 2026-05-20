/**
 * Typed admin API client. Every call goes through `/api/admin/*`,
 * which the backend gates behind the bearer token configured in
 * `adminStore`.
 *
 * Every request below automatically:
 *   - reads the token from localStorage (via getAdminToken)
 *   - attaches it as `Authorization: Bearer <token>`
 *   - on a 401, calls `useAdminStore.getState().disable()` so the
 *     UI flips back to non-admin mode and the operator is prompted
 *     to re-enter the token
 *
 * Card shapes mirror the CardEditor types verbatim — when the editor
 * pages get ported into `src/admin/` they'll re-use these.
 */
import { getAdminToken, useAdminStore } from '../stores/adminStore';

const BASE = '/api/admin';

/* ─── Types (mirror backend Pydantic + CardEditor) ─────────────── */

export type StatKey = 'moneten' | 'aura' | 'respekt' | 'rizz' | 'chaos';

export interface StatRange {
  min?: number | null;
  max?: number | null;
}

export interface Requirements {
  flags_all?: string[];
  flags_none?: string[];
  flags_any?: string[];
  stats?: Partial<Record<StatKey, StatRange>>;
}

export interface Effects {
  moneten?: number;
  aura?: number;
  respekt?: number;
  rizz?: number;
  chaos?: number;
}

export type StatHint = 'up' | 'down' | 'unknown' | 'hidden';
export type ChoiceHints = Partial<Record<StatKey, StatHint | null>>;

export interface DeckAddition {
  card_id: string;
  position?: 'top' | 'bottom' | 'shuffle';
  in_turns?: number | null;
}

export interface Choice {
  text: string;
  effects?: Effects;
  hints?: ChoiceHints;
  sets_flags?: string[];
  clears_flags?: string[];
  adds_to_deck?: DeckAddition[];
  triggers_ending?: string | null;
}

export interface AdminCard {
  _id: string;
  title: string;
  description: string;
  category: string;
  deck_name?: string | null;
  weight?: number;
  important?: boolean;
  /** Soft-toggle published state. Disabled cards stay in the DB but
   *  are skipped by the live gameplay deck loop. */
  enabled?: boolean;
  requires?: Requirements;
  choices: Choice[];
  image_url?: string | null;
}

/** Fields PATCH accepts — same as backend's PatchCardRequest. */
export type PatchCardPayload = Partial<
  Pick<AdminCard,
    'title' | 'description' | 'category' | 'weight' | 'image_url'
    | 'requires' | 'choices' | 'enabled' | 'important' | 'deck_name'
  >
>;

/** Result shape from POST /admin/cards/decks/:name/toggle */
export interface DeckToggleResult {
  matched: number;
  modified: number;
}

/* ─── Error type ───────────────────────────────────────────────── */

export class AdminApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

/* ─── Core request helper ──────────────────────────────────────── */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  // We don't bail on a missing token — let the backend respond 401
  // and use the same handling path. Keeps the client honest.

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new AdminApiError(0, 'Server nicht erreichbar');
  }

  // 401 = token rejected. Flip admin mode off so the UI re-prompts.
  if (res.status === 401) {
    useAdminStore.getState().disable();
    throw new AdminApiError(401, 'Admin-Token ungültig');
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data && typeof (data as { detail?: unknown }).detail === 'string'
        ? (data as { detail: string }).detail
        : `HTTP ${res.status}`;
    throw new AdminApiError(res.status, detail);
  }

  return data as T;
}

/* ─── Endpoints ────────────────────────────────────────────────── */

export const listCards = (opts: { category?: string; limit?: number; skip?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.category) q.set('category', opts.category);
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  if (opts.skip !== undefined) q.set('skip', String(opts.skip));
  const qs = q.toString();
  return request<AdminCard[]>(`/cards${qs ? `?${qs}` : ''}`);
};

export const getCard = (cardId: string) =>
  request<AdminCard>(`/cards/${encodeURIComponent(cardId)}`);

export const createCard = (card: AdminCard) =>
  request<AdminCard>('/cards', {
    method: 'POST',
    body: JSON.stringify(card),
  });

export const replaceCard = (cardId: string, card: AdminCard) =>
  request<AdminCard>(`/cards/${encodeURIComponent(cardId)}`, {
    method: 'PUT',
    body: JSON.stringify(card),
  });

export const patchCard = (cardId: string, payload: PatchCardPayload) =>
  request<AdminCard>(`/cards/${encodeURIComponent(cardId)}`, {
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

/** Quick re-validation against the same endpoint adminStore uses. */
export const adminPing = () => request<{ ok: boolean }>('/auth/ping');
