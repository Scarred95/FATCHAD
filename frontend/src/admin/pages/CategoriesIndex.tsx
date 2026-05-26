import { useMemo } from 'react';
import { useAdminCardStore } from '../store';
import admin from '../admin.module.css';
import styles from './StubPage.module.css';

/**
 * Stub for /admin/categories — first-class category management.
 * For now we just enumerate categories derived from cards as a sanity
 * preview; later this becomes the CRUD surface.
 */
export function CategoriesIndex() {
  const cards = useAdminCardStore((s) => s.cards);
  const rows = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cards) map.set(c.category, (map.get(c.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [cards]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Categories</h1>
          <p className={styles.sub}>
            {rows.length} Kategorie(n) aus {cards.length} Karten abgeleitet.
          </p>
        </div>
      </header>
      <div className={`${admin.panel} ${styles.empty}`}>
        <div className={styles.emptyTitle}>Read-only Vorschau.</div>
        <div className={styles.emptyHint}>
          Kategorien werden derzeit pro Karte als freier String gepflegt.
          Diese Seite wird der CRUD-Ort, sobald sie als eigenständige Entität
          existieren.
        </div>
      </div>
      <div className={`${admin.panel} ${styles.list}`}>
        {rows.map(([name, count]) => (
          <div key={name} className={styles.row}>
            <span className={styles.rowName}>{name}</span>
            <span className={styles.rowCount}>{count}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className={styles.emptyHint}>Keine Karten geladen.</div>
        )}
      </div>
    </div>
  );
}
