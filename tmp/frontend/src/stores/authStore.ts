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

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
  ClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID as string,
});

function extractGroups(session: CognitoUserSession): string[] {
  try {
    return (session.getIdToken().decodePayload()['cognito:groups'] as string[]) ?? [];
  } catch {
    return [];
  }
}

function sessionToState(session: CognitoUserSession) {
  const payload = session.getIdToken().decodePayload();
  return {
    userId: payload.sub as string,
    accessToken: session.getAccessToken().getJwtToken(),
    isAdmin: extractGroups(session).includes('admin'),
  };
}

interface AuthStore {
  userId: string | null;
  accessToken: string | null;
  isAdmin: boolean;
  /** True while login / register is in flight. */
  loading: boolean;
  /** True while restoring session on boot — UI should wait before redirecting. */
  initializing: boolean;

  /** Restore session from localStorage on app boot. */
  initFromSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Step 1 of registration — Cognito sends a verification code to the email. */
  register: (email: string, password: string) => Promise<void>;
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
  loading: false,
  initializing: true,

  async initFromSession() {
    const user = userPool.getCurrentUser();
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
    const user = new CognitoUser({ Username: email, Pool: userPool });
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

  logout() {
    userPool.getCurrentUser()?.signOut();
    set({ userId: null, accessToken: null, isAdmin: false });
  },

  async register(email, password) {
    set({ loading: true });
    return new Promise<void>((resolve, reject) => {
      userPool.signUp(
        email,
        password,
        [new CognitoUserAttribute({ Name: 'email', Value: email })],
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
    const user = new CognitoUser({ Username: email, Pool: userPool });
    return new Promise<void>((resolve, reject) => {
      user.confirmRegistration(code, true, (err) => {
        if (err) { reject(err); return; }
        resolve();
      });
    });
  },

  async forgotPassword(email) {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    return new Promise<void>((resolve, reject) => {
      user.forgotPassword({
        onSuccess() { resolve(); },
        onFailure(err) { reject(err); },
      });
    });
  },

  async confirmNewPassword(email, code, newPassword) {
    const user = new CognitoUser({ Username: email, Pool: userPool });
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
