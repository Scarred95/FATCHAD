import { FormEvent, useState } from 'react';
import AuthShell from '../AuthShell';
import Logo from '../components/Logo';
import Field from '../components/Field';
import styles from '../auth.module.css';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

interface SignupPageProps {
  /** Fired after Cognito accepts the signup. Receives the new username +
   *  email so the confirm screen can pre-fill the username. */
  onSignedUp?: (args: { username: string; email: string }) => void;
  /** "Schon ein Konto?" → back to login. */
  onBackToLogin?: () => void;
  /** Hook the real backend here. Throw an Error with a user-facing message to
   *  surface validation/cognito errors. Resolve with no value on success. */
  onSubmit?: (args: { username: string; email: string; password: string }) => Promise<void>;
}

/**
 * Step 1 of the signup flow. Collects username + email + password.
 * On success → caller routes to <ConfirmEmailPage />.
 */
export default function SignupPage({ onSignedUp, onBackToLogin, onSubmit }: SignupPageProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError('Gib einen Benutzernamen ein.');
    if (!EMAIL_RE.test(email.trim())) return setError('Gib eine gültige E-Mail-Adresse ein.');
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
    }
    if (!/\d/.test(password)) return setError('Passwort muss mindestens eine Ziffer enthalten.');
    if (password !== confirmPw) return setError('Passwörter stimmen nicht überein.');

    setError('');
    setBusy(true);
    try {
      const args = { username: username.trim(), email: email.trim(), password };
      // Defer to the caller (Cognito wiring lives upstream). When no handler is
      // passed we behave like the demo: pretend it worked and advance.
      if (onSubmit) await onSubmit(args);
      onSignedUp?.({ username: args.username, email: args.email });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Logo />

      <div className={styles.authIntro}>
        <span className={styles.eyebrow}>Neu hier?</span>
        <h2>Konto erstellen</h2>
      </div>

      <form className={styles.authForm} onSubmit={submit}>
        <Field
          id="signup-user"
          label="Benutzername"
          autoFocus
          autoComplete="username"
          placeholder="z. B. helmuth_v"
          value={username}
          invalid={!!error && !username.trim()}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          id="signup-email"
          label="E-Mail"
          type="email"
          autoComplete="email"
          placeholder="du@beispiel.de"
          value={email}
          invalid={!!error && !EMAIL_RE.test(email.trim())}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="signup-pass"
          label="Passwort"
          type="password"
          autoComplete="new-password"
          placeholder="mind. 8 Zeichen, eine Ziffer"
          value={password}
          invalid={!!error && password.length < MIN_PASSWORD_LENGTH}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          id="signup-pass-confirm"
          label="Passwort bestätigen"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPw}
          invalid={!!error && confirmPw !== password}
          onChange={(e) => setConfirmPw(e.target.value)}
        />

        <div className={styles.authError} role="alert">{error}</div>

        <div className={styles.authActions}>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? 'Wird erstellt…' : 'Registrieren'}
          </button>
          <button type="button" className={styles.btnText} onClick={onBackToLogin}>
            Schon ein Konto? Zum Login
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
