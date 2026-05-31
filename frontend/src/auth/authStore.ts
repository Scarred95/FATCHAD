/**
 * Auth session store — mirrors Amplify's Auth state into React-readable form.
 *
 * Why a store at all?
 *   Amplify owns the real session (tokens in localStorage, refresh on a
 *   timer, persistence across tabs). React components can't read those
 *   directly. This store subscribes to Amplify's Hub event bus and copies
 *   the current user/loading state into a Zustand store, so any component
 *   can do `useAuthStore(s => s.user)` without touching Amplify directly.
 *
 *   In demo mode (no Amplify) the same store is driven by the dev backend's
 *   imperative `setUser` calls. The shape is identical so consumers don't
 *   care which one is live.
 */
import { create } from 'zustand';

export interface AuthUser {
  /** Cognito `sub` — stable opaque UUID. Becomes USER#<id> in DynamoDB. */
  id: string;
  /** Username (what the user logs in with). */
  username: string;
  /**
   * Email address captured at signup. Stored on the Cognito user record as
   * the `email` attribute — that is the address Cognito uses to deliver
   * the password-reset code, so it MUST be present for recovery to work.
   * Mirrored here so the UI can display a masked hint (e.g. "j***@x.de").
   * Undefined only for legacy/imported users without an email on file.
   */
  email?: string;
}

interface AuthStore {
  /** null = signed out. */
  user: AuthUser | null;
  /** True while the initial session check is in flight (cold app load). */
  loading: boolean;

  /** Internal setters — backends call these; UI components should not. */
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));

/** Imperative escape hatch for non-React code (api clients, event handlers). */
export function getCurrentUser(): AuthUser | null {
  return useAuthStore.getState().user;
}
