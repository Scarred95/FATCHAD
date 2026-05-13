import { ReactNode } from 'react';
import styles from './Header.module.css';

interface Props {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}

export default function Header({ left, center, right }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.slot}>{left}</div>
      <div className={styles.center}>{center}</div>
      <div className={styles.slot} data-align="end">{right}</div>
    </header>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
}

export function IconButton({ label, onClick, children }: IconButtonProps) {
  return (
    <button className={styles.iconBtn} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export function MenuDots() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
