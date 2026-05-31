/**
 * Cognito `AuthBackend` — wraps Amplify Auth so `<AuthFlow />` can drive a
 * real User Pool.
 *
 * --- NOT WIRED YET ---
 * Amplify is intentionally not installed yet (we have no User Pool to point
 * at). The implementation below is the final shape — uncomment the import
 * + bodies once:
 *   1. `npm install aws-amplify`
 *   2. FatchadAuthStack is deployed and we have UserPoolId + ClientId
 *   3. deploy-frontend.yml reads those CFN outputs into VITE_USER_POOL_ID
 *      / VITE_USER_POOL_CLIENT_ID at build time
 *
 * Calling any method on this stub throws — main.tsx selects the demo
 * backend whenever VITE_USE_DEMO_AUTH=true (the default in dev), so this
 * path is unreachable until you flip the flag.
 */
import type { AuthBackend } from './AuthFlow';
// import { Amplify } from 'aws-amplify';
// import { Auth, Hub } from 'aws-amplify';
// import { fetchUserAttributes } from 'aws-amplify/auth';
// import { useAuthStore } from './authStore';

/**
 * Call once at app startup, before any auth UI renders.
 * Reads pool config from Vite env vars baked at build time.
 */
export function configureAmplify(): void {
  const userPoolId = import.meta.env.VITE_USER_POOL_ID;
  const userPoolClientId = import.meta.env.VITE_USER_POOL_CLIENT_ID;
  const region = import.meta.env.VITE_AWS_REGION ?? 'eu-central-1';

  if (!userPoolId || !userPoolClientId) {
    throw new Error(
      'Cognito backend selected but VITE_USER_POOL_ID / VITE_USER_POOL_CLIENT_ID are unset. ' +
      'Set VITE_USE_DEMO_AUTH=true to use the demo backend instead.',
    );
  }

  // Amplify.configure({
  //   Auth: {
  //     Cognito: {
  //       userPoolId,
  //       userPoolClientId,
  //       region,
  //     },
  //   },
  // });
  //
  // // Mirror Amplify session changes into our Zustand store. We also pull
  // // the `email` attribute (set at signUp via userAttributes.email) so the
  // // UI can show a masked hint in the reset flow. Cognito uses that same
  // // attribute to deliver the password-recovery code.
  // Hub.listen('auth', async ({ payload }) => {
  //   const store = useAuthStore.getState();
  //   if (payload.event === 'signedIn' || payload.event === 'tokenRefresh') {
  //     try {
  //       const u = await Auth.getCurrentUser();
  //       const attrs = await fetchUserAttributes();
  //       store.setUser({ id: u.userId, username: u.username, email: attrs.email });
  //     } catch {
  //       store.setUser(null);
  //     }
  //   }
  //   if (payload.event === 'signedOut' || payload.event === 'tokenRefresh_failure') {
  //     store.setUser(null);
  //   }
  // });
  //
  // // Hydrate on cold app load.
  // (async () => {
  //   try {
  //     const u = await Auth.getCurrentUser();
  //     const attrs = await fetchUserAttributes();
  //     useAuthStore.getState().setUser({ id: u.userId, username: u.username, email: attrs.email });
  //   } catch {
  //     useAuthStore.getState().setUser(null);
  //   } finally {
  //     useAuthStore.getState().setLoading(false);
  //   }
  // })();
  void userPoolId; void userPoolClientId; void region;   // silence "unused" until uncommented
  throw new Error('cognitoBackend.configureAmplify(): Amplify not installed yet.');
}

export const cognitoBackend: AuthBackend = {
  async login(/* { username, password } */) {
    // await Auth.signIn({ username, password });
    throw new Error('cognitoBackend.login(): not wired yet.');
  },

  async signUp(/* { username, email, password } */) {
    // await Auth.signUp({
    //   username,
    //   password,
    //   options: { userAttributes: { email } },
    // });
    throw new Error('cognitoBackend.signUp(): not wired yet.');
  },

  async confirmSignUp(/* { username, code } */) {
    // await Auth.confirmSignUp({ username, confirmationCode: code });
    throw new Error('cognitoBackend.confirmSignUp(): not wired yet.');
  },

  async resendConfirmCode(/* username */) {
    // await Auth.resendSignUpCode({ username });
    throw new Error('cognitoBackend.resendConfirmCode(): not wired yet.');
  },

  async forgotPassword(/* { username } */) {
    // await Auth.resetPassword({ username });
    throw new Error('cognitoBackend.forgotPassword(): not wired yet.');
  },

  async forgotPasswordSubmit(/* { username, code, newPassword } */) {
    // await Auth.confirmResetPassword({ username, confirmationCode: code, newPassword });
    throw new Error('cognitoBackend.forgotPasswordSubmit(): not wired yet.');
  },
};
