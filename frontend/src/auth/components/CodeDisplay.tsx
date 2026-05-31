import styles from '../auth.module.css';

interface CodeDisplayProps {
  code: string | number;
}

/**
 * Renders a numeric code as a row of glowing digit chips.
 */
export default function CodeDisplay({ code }: CodeDisplayProps) {
  const digits = String(code).split('');
  return (
    <div className={styles.codeChip} aria-label={`Code ${code}`}>
      {digits.map((d, i) => <span key={i}>{d}</span>)}
    </div>
  );
}
