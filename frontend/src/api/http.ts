/**
 * Shared HTTP transport for the gameplay and admin API clients.
 *
 * `http()` is the pure fetch core — no base URL, no auth, no WIP handling.
 * The gameplay (`client.ts`) and admin (`admin.ts`) clients wrap it with
 * their own concerns (base URL, WIP short-circuit, bearer token, 401 retry).
 */

/** Thrown by every API call on a non-2xx response or a network failure.
 *  `status === 0` means the request never reached the server. */
export class ApiError extends Error {
  status: number;
  detail: string;
  /** The parsed response body, kept intact so callers can read a structured
   *  `detail` (e.g. the 409 leaderboard-full payload) that `detail` flattens
   *  to a string. Null on a network failure or an empty/non-JSON body. */
  data: unknown;
  constructor(status: number, detail: string, data: unknown = null) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.data = data;
  }
}

function detailFrom(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const d = (data as { detail?: unknown }).detail;
    if (typeof d === 'string') return d;
  }
  return `HTTP ${status}`;
}

/** Pure fetch wrapper: resolves parsed JSON (or `undefined` for 204),
 *  throws `ApiError` on a network failure or a non-2xx status. */
export async function http<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Server nicht erreichbar');
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) throw new ApiError(res.status, detailFrom(data, res.status), data);
  return data as T;
}

/** Normalize any thrown value into a user-facing message, falling back to
 *  `fallback` when the error carries nothing useful. */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return fallback;
}
