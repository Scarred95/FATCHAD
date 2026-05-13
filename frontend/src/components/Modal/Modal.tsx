import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import styles from './Modal.module.css';

interface Action {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
}

interface Props {
  open: boolean;
  title: string;
  body?: string;
  actions: Action[];
  onClose?: () => void;
}

export default function Modal({ open, title, body, actions, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={`display ${styles.title}`}>{title}</h2>
            {body && <p className={styles.body}>{body}</p>}
            <div className={styles.actions}>
              {actions.map((a, i) => (
                <button
                  key={i}
                  className={styles.action}
                  data-variant={a.variant ?? 'ghost'}
                  onClick={a.onClick}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
