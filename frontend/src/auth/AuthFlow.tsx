import { useState } from 'react';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ConfirmEmailPage from './pages/ConfirmEmailPage';
import ResetRequestPage from './pages/ResetRequestPage';
import ResetSubmitPage from './pages/ResetSubmitPage';

/**
 * Backend-agnostic surface the flow needs. The default value is a demo
 * stub that does nothing — Cognito wiring lives upstream and gets injected
 * via the `backend` prop. The first concrete implementation will wrap
 * Amplify's `Auth.*` methods; this interface is what those methods need to
 * satisfy. Throw an Error with a user-facing message on failure.
 */
export interface AuthBackend {
  login(args: { username: string; password: string }): Promise<void>;
  signUp(args: { username: string; email: string; password: string }): Promise<void>;
  confirmSignUp(args: { username: string; code: string }): Promise<void>;
  resendConfirmCode(username: string): Promise<void>;
  forgotPassword(args: { username: string; email: string }): Promise<void>;
  forgotPasswordSubmit(args: { username: string; code: string; newPassword: string }): Promise<void>;
}

type Screen =
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'confirm'; username: string }
  | { name: 'resetRequest' }
  | { name: 'resetSubmit'; username: string };

interface AuthFlowProps {
  /** Real backend integration. If omitted, every page runs in demo mode. */
  backend?: AuthBackend;
  /** Called when login (or auto-login after a flow step) succeeds. */
  onAuthenticated: (username: string) => void;
  /** Show the "demo credentials" footnote on the login screen. */
  demoHint?: boolean;
}

/**
 * State machine that hands the user from one auth screen to the next.
 * No routing, no URL changes — the flow is a hard top-level gate that
 * occupies the whole viewport until `onAuthenticated` is invoked.
 */
export default function AuthFlow({ backend, onAuthenticated, demoHint = true }: AuthFlowProps) {
  const [screen, setScreen] = useState<Screen>({ name: 'login' });

  if (screen.name === 'login') {
    return (
      <LoginPage
        demoHint={demoHint}
        validate={
          backend
            ? async (username, password) => {
                await backend.login({ username, password });
                return true;
              }
            : undefined
        }
        onLogin={onAuthenticated}
        onSignup={() => setScreen({ name: 'signup' })}
        onReset={() => setScreen({ name: 'resetRequest' })}
      />
    );
  }

  if (screen.name === 'signup') {
    return (
      <SignupPage
        onSubmit={backend ? backend.signUp : undefined}
        onSignedUp={({ username }) => setScreen({ name: 'confirm', username })}
        onBackToLogin={() => setScreen({ name: 'login' })}
      />
    );
  }

  if (screen.name === 'confirm') {
    return (
      <ConfirmEmailPage
        username={screen.username}
        onSubmit={backend ? backend.confirmSignUp : undefined}
        onResend={backend ? backend.resendConfirmCode : undefined}
        onConfirmed={() => setScreen({ name: 'login' })}
        onBackToLogin={() => setScreen({ name: 'login' })}
      />
    );
  }

  if (screen.name === 'resetRequest') {
    return (
      <ResetRequestPage
        onRequestCode={
          backend
            ? async (args) => {
                await backend.forgotPassword(args);
                return null;
              }
            : undefined
        }
        onContinue={(username) => setScreen({ name: 'resetSubmit', username })}
        onBack={() => setScreen({ name: 'login' })}
      />
    );
  }

  // resetSubmit
  return (
    <ResetSubmitPage
      username={screen.username}
      onSubmit={backend ? backend.forgotPasswordSubmit : undefined}
      onReset={() => setScreen({ name: 'login' })}
      onBack={() => setScreen({ name: 'login' })}
    />
  );
}
