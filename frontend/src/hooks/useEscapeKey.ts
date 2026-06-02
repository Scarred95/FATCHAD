/** Calls `onClose` on Escape while `active`. No-op when inactive. */
import { useEffect } from 'react';

export function useEscapeKey(active: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}
