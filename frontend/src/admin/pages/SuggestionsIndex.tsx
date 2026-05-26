import admin from '../admin.module.css';
import styles from './StubPage.module.css';

/**
 * Stub for /admin/suggestions — moderation queue for user-submitted cards.
 * Wire to the suggestions endpoint once it exists.
 */
export function SuggestionsIndex() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>User-suggested cards</h1>
          <p className={styles.sub}>
            Eingereichte Karten prüfen, annehmen oder ablehnen.
          </p>
        </div>
      </header>
      <div className={`${admin.panel} ${styles.empty}`}>
        <div className={styles.emptyTitle}>Noch keine Einreichungen.</div>
        <div className={styles.emptyHint}>
          Sobald der Spieler-Vorschlag-Endpoint live ist, landen hier alle
          eingehenden Vorschläge zur Moderation. Übernommene Vorschläge
          werden in ein Deck verschoben und auf die Karten-Schema-Form
          normalisiert.
        </div>
      </div>
    </div>
  );
}
