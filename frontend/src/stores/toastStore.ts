/**
 * Lightweight toast queue. Auto-dismisses after a TTL.
 */
import { create } from 'zustand';

export type ToastVariant = 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant, ttlMs?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push(message, variant = 'info', ttlMs = 3000) {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, variant }] });
    setTimeout(() => get().dismiss(id), ttlMs);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
