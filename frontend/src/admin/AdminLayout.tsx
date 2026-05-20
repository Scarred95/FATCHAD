/**
 * Top-level shell for the /admin/* surface.
 *
 * Loads the card catalogue from the server on first mount, then renders
 * the child route via <Outlet />. The "Reload" button re-fetches without
 * a full page refresh.
 */
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminCardStore } from './store';
import { useAdminStore } from '../stores/adminStore';
import { useToastStore } from '../stores/toastStore';
import admin from './admin.module.css';
import styles from './AdminLayout.module.css';

export function AdminLayout() {
  const loaded = useAdminCardStore((s) => s.loaded);
  const loadFromServer = useAdminCardStore((s) => s.loadFromServer);
  const clearLocal = useAdminCardStore((s) => s.clearLocal);
  const disableAdmin = useAdminStore((s) => s.disable);
  const pushToast = useToastStore((s) => s.push);
  const nav = useNavigate();

  useEffect(() => {
    if (!loaded) {
      void loadFromServer();
    }
    // Intentionally only on mount — explicit Reload re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logout: drop the cached cards (server-side data, not local edits)
  // and clear the bearer token. RequireAdmin will redirect us out of
  // /admin once isAdmin flips false — but we navigate explicitly so
  // the title screen is reached even if React Router lags behind.
  function onLogout() {
    clearLocal();
    disableAdmin();
    pushToast('Abgemeldet', 'info');
    nav('/');
  }

  // NavLink applies styles.navActive when the URL matches. `/admin` needs
  // `end` so it only lights up on the exact index — without it, every
  // sub-route ("/admin/endings" etc.) would also mark Decks as active.
  const navItem = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.navLink} ${styles.navActive}` : styles.navLink;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.back}>← Zurück zum Spiel</Link>
        <span className={styles.brand}>FATCHAD Admin</span>
        <nav className={styles.nav} aria-label="Admin-Navigation">
          <NavLink to="/admin" end className={navItem}>Decks</NavLink>
          <NavLink to="/admin/endings" className={navItem}>Endings</NavLink>
          <NavLink to="/admin/suggestions" className={navItem}>User suggested</NavLink>
          <NavLink to="/admin/categories" className={navItem}>Categories</NavLink>
        </nav>
        <div className={styles.spacer} />
        <button
          type="button"
          className={admin.btnSecondary}
          onClick={() => void loadFromServer()}
        >Reload</button>
        <button
          type="button"
          className={admin.btnDanger}
          onClick={onLogout}
        >Abmelden</button>
      </header>
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
