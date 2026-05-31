/**
 * Demo `AuthBackend` for local development.
 *
 * Accepts the hardcoded `AurenAdmin` / `test123` credentials and lets the
 * user "sign up" / "confirm" / "reset" freely without ever calling Cognito.
 * Used whenever VITE_USE_DEMO_AUTH=true (default in `npm run dev`).
 *
 * Side effect: on a successful `login` it writes the user into the auth
 * store so the rest of the app behaves identically to the Cognito path.
 */
import type { AuthBackend } from './AuthFlow';
import { useAuthStore } from './authStore';

export const DEMO_USERNAME = 'AurenAdmin';
export const DEMO_PASSWORD = 'test123';
/** Hardcoded email for the built-in demo user so reset-flow displays something. */
const DEMO_EMAIL = 'auren@fatchad.local';

/** Stable fake `sub` so DDB writes during dev round-trip to the same partition. */
const DEMO_USER_ID = 'demo-00000000-0000-0000-0000-000000000001';

/** Tiny delay to make the spinner visible — feels more realistic in dev. */
const DEMO_DELAY_MS = 250;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * In-memory map of usernames → email captured during demo signups. Mirrors
 * what Cognito stores server-side as the `email` user attribute — kept here
 * so login() / forgotPassword() can populate `AuthUser.email` realistically
 * in dev. Resets on page reload (no persistence in demo mode).
 */
const demoEmails = new Map<string, string>([
  [DEMO_USERNAME.toLowerCase(), DEMO_EMAIL],
]);

export const demoBackend: AuthBackend = {
  async login({ username, password }) {
    await sleep(DEMO_DELAY_MS);
    if (
      username.trim().toLowerCase() !== DEMO_USERNAME.toLowerCase() ||
      password !== DEMO_PASSWORD
    ) {
      throw new Error('Falscher Benutzername oder Passwort.');
    }
    const u = username.trim();
    useAuthStore.getState().setUser({
      id: DEMO_USER_ID,
      username: u,
      email: demoEmails.get(u.toLowerCase()),
    });
  },

  async signUp({ username, email }) {
    await sleep(DEMO_DELAY_MS);
    // Remember the email so the (post-confirm) login + forgot-password
    // flows can show a realistic masked address — Cognito does this
    // server-side via the `email` user attribute.
    demoEmails.set(username.trim().toLowerCase(), email.trim());
  },

  async confirmSignUp({ code }) {
    await sleep(DEMO_DELAY_MS);
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Code muss 6 Ziffern sein.');
    }
  },

  async resendConfirmCode() {
    await sleep(DEMO_DELAY_MS);
  },

  async forgotPassword() {
    await sleep(DEMO_DELAY_MS);
  },

  async forgotPasswordSubmit({ code }) {
    await sleep(DEMO_DELAY_MS);
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Code muss 6 Ziffern sein.');
    }
  },
};
