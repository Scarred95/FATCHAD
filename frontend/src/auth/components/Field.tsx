import { InputHTMLAttributes } from 'react';
import styles from '../auth.module.css';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** Adds the error border when true. */
  invalid?: boolean;
}

/**
 * Labelled text input. Any extra props (type, value, onChange, placeholder,
 * autoComplete, autoFocus, …) are forwarded to the underlying <input>.
 */
export default function Field({ id, label, invalid = false, ...inputProps }: FieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`${styles.fieldInput}${invalid ? ` ${styles.invalid}` : ''}`}
        {...inputProps}
      />
    </div>
  );
}
