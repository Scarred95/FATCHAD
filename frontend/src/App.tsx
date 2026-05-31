import { Outlet } from 'react-router-dom';
import ToastViewport from './components/Toast/ToastViewport';
import WipBanner from './components/WipBanner/WipBanner';
import AuthFlow from './auth/AuthFlow';
import { useAuthStore } from './auth/authStore';
import { getAuthBackend, isDemoAuth } from './auth/bootAuth';

/**
 * Top-level layout. Also acts as the auth gate: until `useAuthStore.user`
 * is set, the router's child routes never render — `<AuthFlow>` occupies
 * the viewport instead. This means there is no `/login` URL; the URL the
 * user landed on is preserved and revealed once they authenticate.
 */
export default function App() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  // Cold-boot splash: Amplify is still resolving getCurrentUser(). Render
  // nothing rather than flashing the login screen to a user who is in fact
  // already signed in. Demo mode skips this — bootAuth() flips loading off
  // synchronously, so this branch is only reachable in the Cognito path.
  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <>
        <WipBanner />
        <AuthFlow
          backend={getAuthBackend()}
          demoHint={isDemoAuth()}
          // Both backends already write to useAuthStore on success
          // (demoBackend.login directly, cognitoBackend via Amplify Hub).
          // This callback is just a hook for analytics / side-effects.
          onAuthenticated={() => {}}
        />
        <ToastViewport />
      </>
    );
  }

  return (
    <>
      <WipBanner />
      <Outlet />
      <ToastViewport />
    </>
  );
}
