import { ReactNode } from 'react';
import styles from './auth.module.css';

interface AuthShellProps {
  /** Optional node rendered above the body (e.g. a back button). */
  header?: ReactNode;
  children: ReactNode;
}

/**
 * Page shell shared by every auth screen: full-height centered column,
 * ambient radial glow, and an optional `header` slot. Composes with the
 * global `.page` shell from globals.css.
 */
export default function AuthShell({ header = null, children }: AuthShellProps) {
  return (
    <main className={`page ${styles.authPage}`}>
      <div className={styles.titleAmbient} aria-hidden="true" />
      {header}
      {children}
    </main>
  );
}
