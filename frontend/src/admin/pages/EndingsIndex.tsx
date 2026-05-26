import admin from '../admin.module.css';
import styles from './StubPage.module.css';

/**
 * Stub for /admin/endings — game-end scripts / cinematic outros.
 * Wire data + editor once the schema lands.
 */
export function EndingsIndex() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Endings</h1>
          <p className={styles.sub}>Spielenden &amp; Abspann-Sequenzen verwalten.</p>
        </div>
      </header>
      <div className={`${admin.panel} ${styles.empty}`}>
        <div className={styles.emptyTitle}>Noch nicht implementiert.</div>
        <div className={styles.emptyHint}>
          Diese Ansicht ist ein Platzhalter. Sobald das Endings-Schema im Backend
          existiert, wird hier die Liste, Bearbeitung und Verknüpfung mit Karten
          gepflegt.
        </div>
      </div>
    </div>
  );
}
