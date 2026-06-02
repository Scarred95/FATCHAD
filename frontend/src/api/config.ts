/**
 * API base URLs, resolved once.
 *
 * Both fall back to dev-proxy paths (`/api`, `/api/admin`) that Vite
 * rewrites to the local backend. CI builds inject the deployed hosts via
 * the `VITE_*` env vars. Admin is kept separate so it can route through a
 * different host (e.g. VPN-only) without touching gameplay traffic.
 *
 * Trailing slashes are stripped so callers can append `/path` freely.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');
export const ADMIN_API_BASE = (import.meta.env.VITE_ADMIN_API_BASE_URL ?? '/api/admin').replace(/\/+$/, '');
