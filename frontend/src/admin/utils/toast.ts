/** Push an admin toast. Thin wrapper so stores don't each re-wire toastStore. */
import { useToastStore } from '../../stores/toastStore';

export type ToastVariant = 'info' | 'warning' | 'error';

export function adminToast(msg: string, variant: ToastVariant = 'info'): void {
  useToastStore.getState().push(msg, variant);
}
