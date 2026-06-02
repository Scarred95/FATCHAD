/**
 * Cognito-backed auth store.
 *
 * Replaces the old userStore (random ID) and adminStore (hardcoded token)
 * with real user identities from AWS Cognito.
 *
 * userId    → Cognito `sub` claim — stable unique ID per user
 * accessToken → JWT sent as `Authorization: Bearer <token>` on every API call
 * isAdmin   → true when the user belongs to the Cognito `admin` group
 *
 * Session is persisted in localStorage by amazon-cognito-identity-js
 * automatically. Call `initFromSession()` once on app boot to restore it.
 */
import { create } from 'zustand';
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const CLIENT_ID = import.meta.env.VITE_COGNITO_APP_CLIENT_ID as string | undefined;

/** True when the build was given both Cognito IDs. When false, the auth
 *  methods reject with a clear error instead of the whole app white-screening
 *  on a top-level `new CognitoUserPool(...)` throw. */
export const authConfigured = Boolean(POOL_ID && CLIENT_ID);

// Lazily constructed so a missing config doesn't throw at module load (which
// would crash the SPA before any route — including the login screen — renders).
let _userPool: CognitoUserPool | null = null;
function getUserPool(): CognitoUserPool {
  if (!POOL_ID || !CLIENT_ID) {
    throw new Error(
      'Cognito is not configured: VITE_COGNITO_USER_POOL_ID / ' +
        'VITE_COGNITO_APP_CLIENT_ID were empty at build time.',
    );
  }
  if (!_userPool) {
    _userPool = new CognitoUserPool({ UserPoolId: POOL_ID, ClientId: CLIENT_ID });
  }
  return _userPool;
}

function extractGroups(session: CognitoUserSession): string[] {
  try {
    return (session.getIdToken().decodePayload()['cognito:groups'] as string[]) ?? [];
  } catch {
    return [];
  }
}

function sessionToState(session: CognitoUserSession) {
  const payload = session.getIdToken().decodePayload();
  const groups = extractGroups(session);
  return {
    userId: payload.sub as string,
    accessToken: session.getAccessToken().getJwtToken(),
    isAdmin: groups.includes('admin'),
    isGuest: groups.includes('guest'),
  };
}

interface AuthStore {
  userId: string | null;
  accessToken: string | null;
  isAdmin: boolean;
  /** True when the session belongs to a throwaway guest account. */
  isGuest: boolean;
  /** True while login / register is in flight. */
  loading: boolean;
  /** True while restoring session on boot — UI should wait before redirecting. */
  initializing: boolean;

  /** Restore session from localStorage on app boot. */
  initFromSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  /** Mint a throwaway guest account on the backend, then sign in as it.
   *  The guest gets a real Cognito session (SDK-managed, like any user), so
   *  runs persist and can later be claimed by a real account on register. */
  loginAsGuest: () => Promise<void>;
  /** Migrate a guest's runs + profile totals onto the currently signed-in real
   *  account, then delete the guest. `guestAccessToken` is the guest session's
   *  token, captured before logging into the new account. */
  claimGuestData: (guestAccessToken: string) => Promise<number>;
  logout: () => void;
  /** Step 1 of registration — Cognito sends a verification code to the email.
   *  `displayName` is stored as the Cognito `name` attribute and copied into
   *  the DynamoDB profile by the PostConfirmation trigger. */
  register: (email: string, password: string, displayName: string) => Promise<void>;
  /** Step 2 of registration — confirm with the code from the email. */
  confirmRegistration: (email: string, code: string) => Promise<void>;
  /** Step 1 of password reset — Cognito sends a reset code to the email. */
  forgotPassword: (email: string) => Promise<void>;
  /** Step 2 of password reset — set a new password using the code. */
  confirmNewPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  userId: null,
  accessToken: null,
  isAdmin: false,
  isGuest: false,
  loading: false,
  initializing: true,

  async initFromSession() {
    if (!authConfigured) { set({ initializing: false }); return; }
    const user = getUserPool().getCurrentUser();
    if (!user) { set({ initializing: false }); return; }
    return new Promise<void>((resolve) => {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session?.isValid()) {
          set({ initializing: false });
          resolve();
          return;
        }
        set({ ...sessionToState(session), initializing: false });
        resolve();
      });
    });
  },

  async login(email, password) {
    set({ loading: true });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    const user = new CognitoUser({ Username: email, Pool: getUserPool() });
    return new Promise<void>((resolve, reject) => {
      user.authenticateUser(authDetails, {
        onSuccess(session) {
          set({ ...sessionToState(session), loading: false });
          resolve();
        },
        onFailure(err) {
          set({ loading: false });
          reject(err);
        },
      });
    });
  },

  async loginAsGuest() {
    set({ loading: true });
    try {
      // Dynamic import avoids a static cycle (api/client imports getAccessToken
      // from this module).
      const { createGuestSession } = await import('../api/client');
      const { email, password } = await createGuestSession();
      // Reuse the normal SRP login so the guest session is SDK-managed
      // (persisted + refreshed + restored on reload) like any other user.
      await useAuthStore.getState().login(email, password);
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  async claimGuestData(guestAccessToken) {
    const { claimGuestAccount } = await import('../api/client');
    const { migrated_runs } = await claimGuestAccount(guestAccessToken);
    return migrated_runs;
  },

  logout() {
    if (authConfigured) getUserPool().getCurrentUser()?.signOut();
    set({ userId: null, accessToken: null, isAdmin: false, isGuest: false });
  },

  async register(email, password, displayName) {
    set({ loading: true });
    return new Promise<void>((resolve, reject) => {
      getUserPool().signUp(
        email,
        password,
        [
          new CognitoUserAttribute({ Name: 'email', Value: email }),
          new CognitoUserAttribute({ Name: 'name', Value: displayName }),
        ],
        [],
        (err) => {
          set({ loading: false });
          if (err) { reject(err); return; }
          resolve();
        },
      );
    });
  },

  async confirmRegistration(email, code) {
    const user = new CognitoUser({ Username: email, Pool: getUserPool() });
    return new Promise<void>((resolve, reject) => {
      user.confirmRegistration(code, true, (err) => {
        if (err) { reject(err); return; }
        resolve();
      });
    });
  },

  async forgotPassword(email) {
    const user = new CognitoUser({ Username: email, Pool: getUserPool() });
    return new Promise<void>((resolve, reject) => {
      user.forgotPassword({
        onSuccess() { resolve(); },
        onFailure(err) { reject(err); },
      });
    });
  },

  async confirmNewPassword(email, code, newPassword) {
    const user = new CognitoUser({ Username: email, Pool: getUserPool() });
    return new Promise<void>((resolve, reject) => {
      user.confirmPassword(code, newPassword, {
        onSuccess() { resolve(); },
        onFailure(err) { reject(err); },
      });
    });
  },
}));

/** Read the current access token outside of React (e.g. in API clients). */
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}
