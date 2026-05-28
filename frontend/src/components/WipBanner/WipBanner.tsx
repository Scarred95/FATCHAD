import styles from './WipBanner.module.css';

/**
 * Top-of-page banner shown only in WIP (preview) deploys, where the backend
 * is not reachable. Controlled by VITE_WIP_MODE at build time.
 */
export default function WipBanner() {
  if (import.meta.env.VITE_WIP_MODE !== 'true') return null;

  const version = import.meta.env.VITE_APP_VERSION ?? 'dev';

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <strong>WIP preview</strong>
      <span className={styles.dot}>·</span>
      <span>
        Frontend-only build. Anything that calls the API will show a notice —
        nothing is saved.
      </span>
      <span className={styles.version}>{version}</span>
    </div>
  );
}
