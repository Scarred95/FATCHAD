/**
 * Typed API client. All gameplay HTTP calls live here.
 * Components/stores call these helpers — never raw fetch.
 *
 * Base URL resolution:
 *   - `VITE_API_BASE_URL` (set by the deploy workflow from the FatchadApiStack
 *     output) — used in CI builds against the deployed HTTP API.
 *   - falls back to `/api` for local dev, which the Vite proxy rewrites to
 *     `http://127.0.0.1:8000` (see vite.config.ts).
 *
 * Identity travels in the Cognito JWT, not the URL. `request()` attaches
 * `Authorization: Bearer <accessToken>` on every call and the backend derives
 * `user_id` from the token's `sub` claim — so endpoints take no `user_id` arg.
 */
import { getAccessToken } from '../stores/authStore';
import type {
  AchievementView,
  CardResponse,
  DeckOption,
  EndSummary,
  GameState,
  HealthResponse,
  HistoryDetailEntry,
  PublicCatalog,
  RunSummary,
  TurnResponse,
  UnlockedAchievementView,
} from './types';
import { ApiError, http } from './http';
import { API_BASE } from './config';

// VITE_WIP_MODE is set to "true" at build time by the deploy-frontend workflow
// for the S3 preview deploy, where the backend is not yet reachable. In that
// mode every API call short-circuits before the network and surfaces a toast.
const WIP_MODE = import.meta.env.VITE_WIP_MODE === 'true';
const WIP_TOAST_THROTTLE_MS = 1500;
let lastWipToastAt = 0;

function notifyWip() {
  const now = Date.now();
  if (now - lastWipToastAt < WIP_TOAST_THROTTLE_MS) return;
  lastWipToastAt = now;
  // Dynamic import to avoid a static cycle (toastStore -> api -> toastStore).
  void import('../stores/toastStore').then(({ useToastStore }) => {
    useToastStore.getState().push(
      'Backend nicht verfügbar — Preview-Build.',
      'warning',
      2400,
    );
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (WIP_MODE) {
    notifyWip();
    throw new ApiError(0, 'WIP — Backend nicht verfügbar');
  }
  const token = getAccessToken();
  return http<T>(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

/* ─── Meta ─────────────────────────────────────────────────────── */

export const getHealth = () => request<HealthResponse>('/healthz');

/* ─── Guest sessions ───────────────────────────────────────────── */

/** Mint a throwaway guest account. Unauthenticated — the backend creates a
 *  Cognito user in the `guest` group and returns its credentials so the client
 *  can sign in via the normal SRP flow. */
export const createGuestSession = () =>
  request<{ email: string; password: string }>('/guest', {
    method: 'POST',
  });

/** Absorb a guest's progress into the currently signed-in real account.
 *  Authenticated as the real account; the guest is proven by its own token. */
export const claimGuestAccount = (guestAccessToken: string) =>
  request<{ migrated_runs: number }>('/account/claim', {
    method: 'POST',
    body: JSON.stringify({ guest_access_token: guestAccessToken }),
  });

/* ─── Catalog ──────────────────────────────────────────────────── */

/** Public catalog bundle — fed from S3, gateway-proxied. Shape mirrors
 *  `publisher.py`'s `_dump_*_public` output (see `PublicCatalog`). */
export const getCurrentCatalog = () =>
  request<PublicCatalog>('/catalog/current');

/* ─── Decks ────────────────────────────────────────────────────── */

/** Decks this player may pick on the new-run screen — default-unlocked plus the
 *  caller's achievement-unlocked decks (Tutorial excluded). Per-user. */
export const listDecks = () =>
  request<DeckOption[]>('/decks');

/* ─── Achievements ─────────────────────────────────────────────── */

/** Client achievement catalog — every non-hidden achievement with its hint. */
export const listAchievements = () =>
  request<AchievementView[]>('/achievements');

/** Achievements this caller has earned, with unlocked_at (hidden-but-earned
 *  included). */
export const listUnlockedAchievements = () =>
  request<UnlockedAchievementView[]>('/achievements/unlocked');

/* ─── Run lifecycle ────────────────────────────────────────────── */

/** Start a run. `tutorial` plays the scripted intro; `deck_ids` picks the decks
 *  to draw from (omit/empty → backend's default-unlocked set). */
export const createRun = (opts: { tutorial?: boolean; deck_ids?: string[] } = {}) =>
  request<TurnResponse>('/runs', {
    method: 'POST',
    body: JSON.stringify({
      tutorial: opts.tutorial ?? true,
      ...(opts.deck_ids && opts.deck_ids.length ? { deck_ids: opts.deck_ids } : {}),
    }),
  });

export const listRuns = () =>
  request<RunSummary[]>('/runs');

export const getRun = (runId: string) =>
  request<GameState>(`/runs/${runId}`);

export const abandonRun = (runId: string) =>
  request<GameState>(`/runs/${runId}/abandon`, {
    method: 'POST',
  });

export const deleteRun = (runId: string, force = false) =>
  request<void>(
    `/runs/${runId}${force ? '?force=true' : ''}`,
    { method: 'DELETE' },
  );

/* ─── Gameplay ─────────────────────────────────────────────────── */

export const getCurrentCard = (runId: string) =>
  request<CardResponse>(`/runs/${runId}/card`);

export const submitChoice = (
  runId: string,
  choice_index: number,
  expected_turn?: number,
) =>
  request<TurnResponse>(`/runs/${runId}/choice`, {
    method: 'POST',
    body: JSON.stringify({ choice_index, expected_turn }),
  });

export const getEndSummary = (runId: string) =>
  request<EndSummary>(`/runs/${runId}/summary`);

export const getHistory = (runId: string) =>
  request<HistoryDetailEntry[]>(`/runs/${runId}/history`);

/* ─── Achievements ─────────────────────────────────────────────── */

export const getEarnedAchievements = () =>
  request<EarnedAchievement[]>('/achievements/earned');

export { ApiError };
