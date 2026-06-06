/**
 * Top-level shell for the /admin/* surface.
 *
 * Loads the card + ending catalogues on first mount, then renders the child
 * route via <Outlet />. The chrome is the left rail (brand + nav + Publish
 * panel + footer); pages render full-bleed into the main column.
 */
import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAdminCardStore } from './store';
import { useAdminEndingStore } from './endingStore';
import { useAdminDeckStore } from './deckStore';
import { useAdminAchievementStore } from './achievementStore';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { AdminSidebar } from './components/AdminSidebar';
import styles from './AdminLayout.module.css';

export function AdminLayout() {
  const loaded = useAdminCardStore((s) => s.loaded);
  const loadFromServer = useAdminCardStore((s) => s.loadFromServer);
  const clearLocal = useAdminCardStore((s) => s.clearLocal);
  const endingsLoaded = useAdminEndingStore((s) => s.loaded);
  const loadEndings = useAdminEndingStore((s) => s.loadFromServer);
  const clearEndingsLocal = useAdminEndingStore((s) => s.clearLocal);
  const decksLoaded = useAdminDeckStore((s) => s.loaded);
  const loadDecks = useAdminDeckStore((s) => s.loadFromServer);
  const clearDecksLocal = useAdminDeckStore((s) => s.clearLocal);
  const achievementsLoaded = useAdminAchievementStore((s) => s.loaded);
  const loadAchievements = useAdminAchievementStore((s) => s.loadFromServer);
  const clearAchievementsLocal = useAdminAchievementStore((s) => s.clearLocal);
  const logout = useAuthStore((s) => s.logout);
  const pushToast = useToastStore((s) => s.push);
  const nav = useNavigate();

  useEffect(() => {
    if (!loaded) {
      void loadFromServer();
    }
    if (!endingsLoaded) {
      void loadEndings();
    }
    if (!decksLoaded) {
      void loadDecks();
    }
    if (!achievementsLoaded) {
      void loadAchievements();
    }
    // Intentionally only on mount — Reload re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onReload() {
    void loadFromServer();
    void loadEndings();
    void loadDecks();
    void loadAchievements();
  }

  // Logout drops both server-side caches (not local edits) and ends the
  // Cognito session. RequireAdmin will redirect us out of /admin once the
  // session clears — but we navigate explicitly so the title screen is
  // reached even if React Router lags behind.
  function onLogout() {
    clearLocal();
    clearEndingsLocal();
    clearDecksLocal();
    clearAchievementsLocal();
    logout();
    pushToast('Abgemeldet', 'info');
    nav('/');
  }

  return (
    <div className={styles.shell}>
      <AdminSidebar onReload={onReload} onLogout={onLogout} />
      <main className={styles.main}>
        {!loaded ? (
          <div className={styles.loading}>Lade Karten…</div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
