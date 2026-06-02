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
 * `user_id` is a required parameter on every single-run endpoint. The
 * backend no longer derives it from a session — passing it explicitly
 * keeps the seams visible until the Cognito migration lands, at which
 * point this argument becomes "derive from token" inside `request()`.
 */
import type {
  CardResponse,
  EndSummary,
  GameState,
  HealthResponse,
  HistoryDetailEntry,
  PublicCatalog,
  RunSummary,
  TurnResponse,
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
  return http<T>(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/** URL-encode a `user_id` into a `?user_id=` query string. */
function uidQuery(user_id: string): string {
  return `?user_id=${encodeURIComponent(user_id)}`;
}

/* ─── Meta ─────────────────────────────────────────────────────── */

export const getHealth = () => request<HealthResponse>('/healthz');

/* ─── Catalog ──────────────────────────────────────────────────── */

/** Public catalog bundle — fed from S3, gateway-proxied. Shape mirrors
 *  `publisher.py`'s `_dump_*_public` output (see `PublicCatalog`). */
export const getCurrentCatalog = () =>
  request<PublicCatalog>('/catalog/current');

/* ─── Run lifecycle ────────────────────────────────────────────── */

export const createRun = (user_id: string) =>
  request<TurnResponse>('/runs', {
    method: 'POST',
    body: JSON.stringify({ user_id }),
  });

export const listRuns = (user_id: string) =>
  request<RunSummary[]>(`/runs${uidQuery(user_id)}`);

export const getRun = (runId: string, user_id: string) =>
  request<GameState>(`/runs/${runId}${uidQuery(user_id)}`);

export const abandonRun = (runId: string, user_id: string) =>
  request<GameState>(`/runs/${runId}/abandon${uidQuery(user_id)}`, {
    method: 'POST',
  });

export const deleteRun = (runId: string, user_id: string, force = false) =>
  request<void>(
    `/runs/${runId}${uidQuery(user_id)}${force ? '&force=true' : ''}`,
    { method: 'DELETE' },
  );

/* ─── Gameplay ─────────────────────────────────────────────────── */

export const getCurrentCard = (runId: string, user_id: string) =>
  request<CardResponse>(`/runs/${runId}/card${uidQuery(user_id)}`);

export const submitChoice = (
  runId: string,
  user_id: string,
  choice_index: number,
  expected_turn?: number,
) =>
  request<TurnResponse>(`/runs/${runId}/choice${uidQuery(user_id)}`, {
    method: 'POST',
    body: JSON.stringify({ choice_index, expected_turn }),
  });

export const getEndSummary = (runId: string, user_id: string) =>
  request<EndSummary>(`/runs/${runId}/summary${uidQuery(user_id)}`);

export const getHistory = (runId: string, user_id: string) =>
  request<HistoryDetailEntry[]>(`/runs/${runId}/history${uidQuery(user_id)}`);

export { ApiError };
