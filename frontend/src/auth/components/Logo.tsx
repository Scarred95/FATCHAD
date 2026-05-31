import styles from '../auth.module.css';

interface LogoProps {
  className?: string;
}

/**
 * FATCHAD wordmark with the two glitching "A"s. Pairs with the global
 * `.display` headline class (from globals.css) for the base type styles.
 */
export default function Logo({ className = '' }: LogoProps) {
  return (
    <div className={`${styles.logoBlock} ${className}`}>
      <h1 className={`display ${styles.logo}`}>
        F<span className={styles.glitchA}>A</span>TCH<span className={styles.glitchA2}>A</span>D
      </h1>
    </div>
  );
}
