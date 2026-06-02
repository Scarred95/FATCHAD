/**
 * Public catalog store.
 *
 * Holds the player-safe catalog bundle pulled from `/catalog/current`
 * (which the gameplay Lambda proxies from the S3 catalog bucket — see
 * backend/gameplay_lambda/routes/catalog.py).
 *
 * Why a store and not a per-component fetch?
 *   The catalog is read by RunList, EndScreen, the in-run HUD, and the
 *   future deck-picker UI. Refetching on every mount would burn an S3
 *   round trip per cache-miss for no reason — the bundle is global and
 *   only changes on a publish. We cache it in memory + sessionStorage
 *   so a navigation between routes is instant, and a hard reload only
 *   pays the cost once per session.
 *
 * Staleness:
 *   The response embeds the catalog `version` string. After the cached
 *   bundle is older than `MAX_AGE_MS` we fire-and-forget a refetch in
 *   the background. The current cached copy stays visible until the
 *   new one arrives — no flash of empty UI.
 *
 *   When the eventual frontend deploy adds CloudFront in front of this
 *   endpoint, the 5-min `Cache-Control` header on the response will
 *   keep the bandwidth bill flat regardless of how aggressive
 *   `MAX_AGE_MS` is. For now we mirror the backend's cache window.
 */
import { create } from 'zustand';
import { getCurrentCatalog } from '../api/client';
import { errorMessage } from '../api/http';
import type { PublicCatalog } from '../api/types';

// Re-exported so existing `import { PublicCatalog } from '.../catalogStore'`
// call sites keep working — the type itself lives in `api/types`.
export type { PublicCatalog };

interface CachedBundle {
  catalog: PublicCatalog;
  fetchedAt: number;
}

const SESSION_KEY = 'fatchad_catalog_cache';
const MAX_AGE_MS = 5 * 60 * 1000; // mirror backend Cache-Control: max-age=300

function loadFromSession(): CachedBundle | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBundle;
    // Cheap shape check: refuse anything missing the core arrays.
    if (!parsed?.catalog?.cards || !parsed?.catalog?.version) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToSession(bundle: CachedBundle): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(bundle));
  } catch {
    // Quota or private-mode failure — fine. In-memory cache still works.
  }
}

interface CatalogStore {
  catalog: PublicCatalog | null;
  isLoading: boolean;
  error: string | null;

  /** Fetch the catalog. No-op if a fresh copy is already in memory unless
   *  `force` is set (used after a publish, or manual debug refresh). */
  ensureLoaded: (force?: boolean) => Promise<void>;

  /** Drop the cache. Useful for tests or after a known publish. */
  invalidate: () => void;
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  catalog: loadFromSession()?.catalog ?? null,
  isLoading: false,
  error: null,

  async ensureLoaded(force = false) {
    const cached = loadFromSession();
    const inMemory = get().catalog;
    const fresh = cached && Date.now() - cached.fetchedAt < MAX_AGE_MS;

    if (!force && inMemory && fresh) return;

    // Already have something on screen? Don't block on the refetch — let
    // it happen in the background while the user keeps interacting.
    const optimistic = inMemory || cached?.catalog || null;
    set({
      catalog: optimistic,
      isLoading: optimistic === null,
      error: null,
    });

    try {
      const next = await getCurrentCatalog();
      saveToSession({ catalog: next, fetchedAt: Date.now() });
      set({ catalog: next, isLoading: false, error: null });
    } catch (e) {
      set({
        // Keep the previous catalog visible if we had one — partial UI
        // beats empty UI when the network blips.
        isLoading: false,
        error: errorMessage(e, 'Catalog konnte nicht geladen werden'),
      });
    }
  },

  invalidate() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    set({ catalog: null });
  },
}));
