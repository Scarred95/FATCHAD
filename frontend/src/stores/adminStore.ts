/**
 * Admin-mode token store.
 *
 * The admin surface (card CRUD, debug tools) is gated behind a single
 * shared bearer token that the backend reads from `ADMIN_TOKEN`. The
 * operator types the token once into a checkbox prompt on the Title
 * page; we keep it in localStorage so it survives reloads, and we
 * re-validate it on boot by pinging `/admin/auth/ping`.
 *
 * Lifecycle:
 *   1. App boots → `useAdminStore.getState().validateOnBoot()` runs
 *      from `main.tsx`. If a token is present, we hit /ping. A 200
 *      flips `isAdmin = true`; a 401 (or any failure) clears it.
 *   2. User toggles the checkbox on the Title page → we prompt for
 *      the token, call `enable(token)` which pings before committing.
 *   3. User unchecks → `disable()` wipes the token from memory and
 *      from localStorage.
 *   4. Any admin API call that returns 401 calls `disable()` so the
 *      UI flips back automatically (handled in api/admin.ts).
 *
 * No password hashing here — the token IS the secret. This mirrors the
 * placeholder backend auth and will be replaced when real user
 * accounts land.
 */
import { create } from 'zustand';

const STORAGE_KEY = 'fatchad_admin_token';

/** Reads the token straight from localStorage. Used by the API client
 *  on every admin request so we don't have to subscribe to the store
 *  from non-React code. */
export function getAdminToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

interface AdminStore {
  /** True when we have a token and the backend confirmed it works. */
  isAdmin: boolean;
  /** True while the boot ping is in flight — UI hides the checkbox
   *  state until we know whether the stored token is still valid. */
  validating: boolean;

  /** Try to enable admin mode with the given token. Pings /auth/ping;
   *  on success stores the token + flips isAdmin. On failure clears
   *  everything and returns false. */
  enable: (token: string) => Promise<boolean>;

  /** Wipe the token + flip isAdmin off. Safe to call anytime — used
   *  by the API client on 401 and by the checkbox on uncheck. */
  disable: () => void;

  /** Called once from main.tsx. If a token is in localStorage, ping
   *  the backend to confirm it's still valid. */
  validateOnBoot: () => Promise<void>;
}

async function pingAuth(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/auth/ping', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const useAdminStore = create<AdminStore>((set) => ({
  isAdmin: false,
  validating: false,

  async enable(token) {
    const trimmed = token.trim();
    if (!trimmed) return false;
    const ok = await pingAuth(trimmed);
    if (ok) {
      localStorage.setItem(STORAGE_KEY, trimmed);
      set({ isAdmin: true });
      return true;
    }
    localStorage.removeItem(STORAGE_KEY);
    set({ isAdmin: false });
    return false;
  },

  disable() {
    localStorage.removeItem(STORAGE_KEY);
    set({ isAdmin: false });
  },

  async validateOnBoot() {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return;
    set({ validating: true });
    const ok = await pingAuth(token);
    if (ok) {
      set({ isAdmin: true, validating: false });
    } else {
      localStorage.removeItem(STORAGE_KEY);
      set({ isAdmin: false, validating: false });
    }
  },
}));
