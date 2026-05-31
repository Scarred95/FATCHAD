import { FormEvent, useState } from 'react';
import AuthShell from '../AuthShell';
import Logo from '../components/Logo';
import Field from '../components/Field';
import styles from '../auth.module.css';

/** Prototype demo credentials. Replace `validate` with a real check (e.g.
 *  Cognito via Amplify) in production. */
export const DEMO_USER = 'AurenAdmin';
export const DEMO_PASS = 'test123';

interface LoginPageProps {
  /** Fired with the cleaned username after a valid login. */
  onLogin?: (username: string) => void;
  /** Fired when the "Passwort zurücksetzen" button is tapped. */
  onReset?: () => void;
  /** Fired when "Konto erstellen" is tapped. */
  onSignup?: () => void;
  /** Override the default demo validator. Return true if credentials check out;
   *  throw an Error with a user-facing message to fail with custom copy. */
  validate?: (username: string, password: string) => boolean | Promise<boolean>;
  /** Show the "demo credentials" footnote (default true). */
  demoHint?: boolean;
}

export default function LoginPage({
  onLogin,
  onReset,
  onSignup,
  validate,
  demoHint = true,
}: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check =
    validate ??
    ((u: string, p: string) =>
      u.trim().toLowerCase() === DEMO_USER.toLowerCase() && p === DEMO_PASS);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError('Gib einen Benutzernamen ein.');
    if (!password) return setError('Gib ein Passwort ein.');
    setError('');
    setBusy(true);
    try {
      const ok = await check(username, password);
      if (!ok) {
        setError('Falscher Benutzername oder Passwort.');
        return;
      }
      onLogin?.(username.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Logo />

      <div className={styles.authIntro}>
        <span className={styles.eyebrow}>Willkommen zurück</span>
        <h2>Melde dich an</h2>
      </div>

      <form className={styles.authForm} onSubmit={submit}>
        <Field
          id="login-user"
          label="Benutzername"
          autoFocus
          autoComplete="username"
          placeholder="z. B. helmuth_v"
          value={username}
          invalid={!!error && !username.trim()}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          id="login-pass"
          label="Passwort"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          invalid={!!error && !password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className={styles.authError} role="alert">{error}</div>

        <div className={styles.authActions}>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? 'Einen Moment…' : 'Einloggen'}
          </button>
          <button type="button" className={styles.btnSecondary} onClick={onSignup}>
            Konto erstellen
          </button>
          <button type="button" className={styles.btnText} onClick={onReset}>
            Passwort zurücksetzen
          </button>
        </div>

        {demoHint && (
          <p className={styles.demoHint}>
            Demo-Login — <b>{DEMO_USER}</b> / <b>{DEMO_PASS}</b>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
