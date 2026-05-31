/**
 * Single entry point that picks the auth backend at app startup.
 *
 * Selection rule (decided at build time by Vite):
 *   - VITE_USE_DEMO_AUTH === 'true'  → in-process demoBackend (AurenAdmin/test123)
 *   - anything else                  → cognitoBackend (real Amplify, throws until wired)
 *
 * Why a module-level singleton instead of React context?
 *   The choice is fixed at build time and never changes during a session.
 *   A context would require a Provider + extra re-renders for a value that's
 *   effectively a constant. `bootAuth()` runs once in main.tsx before render;
 *   `getAuthBackend()` returns the same instance everywhere.
 */
import type { AuthBackend } from './AuthFlow';
import { demoBackend } from './demoBackend';
import { cognitoBackend, configureAmplify } from './cognitoBackend';
import { useAuthStore } from './authStore';

let _backend: AuthBackend | null = null;
let _isDemo = false;

/**
 * Call once at app startup, before rendering. Idempotent — safe under
 * React.StrictMode's double-invoke in dev.
 */
export function bootAuth(): AuthBackend {
  if (_backend) return _backend;

  const useDemo = import.meta.env.VITE_USE_DEMO_AUTH === 'true';

  if (useDemo) {
    // Demo mode has no async session to hydrate — flip loading off immediately
    // so App.tsx stops showing the splash and renders the login screen.
    useAuthStore.getState().setLoading(false);
    _backend = demoBackend;
    _isDemo = true;
  } else {
    // Cognito path: configureAmplify() subscribes to Hub events and calls
    // setLoading(false) once getCurrentUser() resolves (or rejects).
    configureAmplify();
    _backend = cognitoBackend;
    _isDemo = false;
  }

  return _backend;
}

export function getAuthBackend(): AuthBackend {
  if (!_backend) {
    throw new Error('getAuthBackend() called before bootAuth(). Call bootAuth() in main.tsx.');
  }
  return _backend;
}

/** Useful for UI hints — e.g. showing the "demo credentials" footnote. */
export function isDemoAuth(): boolean {
  return _isDemo;
}
