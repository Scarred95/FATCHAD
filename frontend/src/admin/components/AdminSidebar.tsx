/**
 * Left rail of the admin shell.
 *
 *   • Brand mark (FATCHAD · admin)
 *   • Two grouped nav blocks — Katalog (Decks/Endings/Graph) and Betrieb
 *     (placeholders for Runs/Users until their backends exist).
 *   • Publish panel pinned at the bottom.
 *   • Footer with Zum Spiel · Reload · Abmelden.
 *
 * Sections not yet built (Cards, Achievements, Runs, Users) will be added as
 * their dedicated PRs land — we deliberately don't show dead nav items now.
 */
import { Link, NavLink } from 'react-router-dom';
import { useAdminCardStore, deckNamesOf } from '../store';
import { useAdminEndingStore } from '../endingStore';
import { useAdminAchievementStore } from '../achievementStore';
import { PublishPanel } from './PublishPanel';
import admin from '../admin.module.css';
import styles from './AdminSidebar.module.css';

interface Props {
  onReload: () => void;
  onLogout: () => void;
}

export function AdminSidebar({ onReload, onLogout }: Props) {
  const cards = useAdminCardStore((s) => s.cards);
  const endings = useAdminEndingStore((s) => s.endings);
  const achievements = useAdminAchievementStore((s) => s.achievements);

  // Deck count = unique non-empty deck_name values. Matches the screenshot's
  // "Decks N" semantics — N is the number of distinct decks, not cards.
  const deckCount = deckNamesOf(cards).length;
  const endingCount = endings.length;
  const cardCount = cards.length;
  const achievementCount = achievements.length;

  const navItem = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.item} ${styles.itemActive}` : styles.item;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          FAT<b className={styles.brandAccent}>CHAD</b>
        </span>
        <span className={styles.brandTag}>admin</span>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Katalog</span>

        <NavLink to="/admin" end className={navItem}>
          <span className={styles.itemName}>Decks</span>
          <span className={styles.itemCount}>{deckCount}</span>
        </NavLink>

        <NavLink to="/admin/cards" className={navItem}>
          <span className={styles.itemName}>Cards</span>
          <span className={styles.itemCount}>{cardCount}</span>
        </NavLink>

        <NavLink to="/admin/endings" className={navItem}>
          <span className={styles.itemName}>Endings</span>
          <span className={styles.itemCount}>{endingCount}</span>
        </NavLink>

        <NavLink to="/admin/achievements" className={navItem}>
          <span className={styles.itemName}>Achievements</span>
          <span className={styles.itemCount}>{achievementCount}</span>
        </NavLink>

        <NavLink to="/admin/graph" className={navItem}>
          <span className={styles.itemName}>Graph</span>
        </NavLink>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Debug</span>

        <NavLink to="/admin/users" className={navItem}>
          <span className={styles.itemName}>Users</span>
        </NavLink>

        <NavLink to="/admin/runs" className={navItem}>
          <span className={styles.itemName}>Run-Inspektor</span>
        </NavLink>
      </div>

      <div className={styles.spacer} />

      <PublishPanel />

      <div className={styles.footer}>
        <Link to="/" className={styles.footerLink}>← Zum Spiel</Link>
        <div className={styles.footerBtnRow}>
          <button type="button" className={admin.btnSecondary} onClick={onReload}>
            Reload
          </button>
          <button type="button" className={admin.btnDanger} onClick={onLogout}>
            Abmelden
          </button>
        </div>
      </div>
    </aside>
  );
}
