/**
 * Typed API client. All gameplay HTTP calls live here.
 * Components/stores call these helpers — never raw fetch.
 *
 * Base URL is `/api`, proxied to the FastAPI backend by Vite in dev.
 */
import type {
  CardResponse,
  EndSummary,
  GameState,
  HealthResponse,
  RunSummary,
  TurnResponse,
} from './types';

const BASE = '/api';

// VITE_WIP_MODE is set to "true" at build time by the deploy-frontend workflow
// for the S3 preview deploy, where the backend is not yet reachable. In that
// mode every API call short-circuits before the network and surfaces a toast.
const WIP_MODE = import.meta.env.VITE_WIP_MODE === 'true';
const WIP_TOAST_THROTTLE_MS = 1500;
let lastWipToastAt = 0;

class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

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

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    throw new ApiError(0, 'Server nicht erreichbar');
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
      (data && typeof data === 'object' && 'detail' in data && typeof (data as any).detail === 'string'
        ? (data as any).detail
        : null) ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, detail);
  }

  return data as T;
}

/* ─── Meta ─────────────────────────────────────────────────────── */

export const getHealth = () => request<HealthResponse>('/healthz');

/* ─── Run lifecycle ────────────────────────────────────────────── */

export const createRun = (user_id: string) =>
  request<TurnResponse>('/runs', {
    method: 'POST',
    body: JSON.stringify({ user_id }),
  });

export const listRuns = (user_id: string) =>
  request<RunSummary[]>(`/runs?user_id=${encodeURIComponent(user_id)}`);

export const getRun = (runId: string) =>
  request<GameState>(`/runs/${runId}`);

export const abandonRun = (runId: string) =>
  request<GameState>(`/runs/${runId}/abandon`, { method: 'POST' });

export const deleteRun = (runId: string, force = false) =>
  request<void>(`/runs/${runId}${force ? '?force=true' : ''}`, {
    method: 'DELETE',
  });

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

export { ApiError };
