import type { ValidationIssue } from '../utils/validate';
import admin from '../admin.module.css';
import styles from './ValidationPanel.module.css';

export function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  if (!issues.length) {
    return (
      <div className={`${admin.panel} ${styles.ok}`}>
        ✓ No issues
      </div>
    );
  }
  return (
    <div className={`${admin.panel} ${styles.wrap}`}>
      {errors.length > 0 && (
        <div>
          <div className={styles.errLabel}>{errors.length} error(s)</div>
          <ul className={styles.list}>
            {errors.map((e, i) => (
              <li key={i} className={styles.errItem}>
                <span className={styles.bulletErr}>●</span> {e.message}
                {e.path && <span className={styles.path}>@{e.path}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <div className={styles.warnLabel}>{warnings.length} warning(s)</div>
          <ul className={styles.list}>
            {warnings.map((w, i) => (
              <li key={i} className={styles.warnItem}>
                <span className={styles.bulletWarn}>●</span> {w.message}
                {w.path && <span className={styles.path}>@{w.path}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
