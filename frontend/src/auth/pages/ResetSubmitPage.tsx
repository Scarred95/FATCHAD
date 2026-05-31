import { FormEvent, useState } from 'react';
import AuthShell from '../AuthShell';
import Field from '../components/Field';
import styles from '../auth.module.css';

const MIN_PASSWORD_LENGTH = 8;

interface ResetSubmitPageProps {
  /** Pre-filled username (carried over from <ResetRequestPage />). */
  username?: string;
  /** Fired after the backend accepts the new password. */
  onReset?: (username: string) => void;
  /** "Abbrechen" → leave the flow / back to login. */
  onBack?: () => void;
  /** Hook the real backend here. Throw an Error to surface server messages. */
  onSubmit?: (args: { username: string; code: string; newPassword: string }) => Promise<void>;
}

/**
 * Step 2 of forgot-password: user enters the code they received plus a new
 * password. On success → caller routes back to <LoginPage />.
 */
export default function ResetSubmitPage({
  username: initialUsername = '',
  onReset,
  onBack,
  onSubmit,
}: ResetSubmitPageProps) {
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError('Benutzername fehlt.');
    if (!/^\d{6}$/.test(code.trim())) return setError('Gib den 6-stelligen Code ein.');
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return setError(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
    }
    if (!/\d/.test(newPassword)) return setError('Passwort muss mindestens eine Ziffer enthalten.');
    if (newPassword !== confirmPw) return setError('Passwörter stimmen nicht überein.');

    setError('');
    setBusy(true);
    try {
      const args = { username: username.trim(), code: code.trim(), newPassword };
      if (onSubmit) await onSubmit(args);
      onReset?.(args.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passwort konnte nicht zurückgesetzt werden.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className={styles.authIntro}>
        <span className={styles.eyebrow}>Letzter Schritt</span>
        <h2>Neues Passwort setzen</h2>
      </div>

      <form className={styles.authForm} onSubmit={submit}>
        <Field
          id="reset-submit-user"
          label="Benutzername"
          autoComplete="username"
          value={username}
          invalid={!!error && !username.trim()}
          onChange={(e) => setUsername(e.target.value)}
          readOnly={!!initialUsername}
        />
        <Field
          id="reset-submit-code"
          label="Code aus der E-Mail"
          autoFocus={!!initialUsername}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="6-stellig"
          value={code}
          invalid={!!error && !/^\d{6}$/.test(code.trim())}
          onChange={(e) => setCode(e.target.value)}
        />
        <Field
          id="reset-submit-pass"
          label="Neues Passwort"
          type="password"
          autoComplete="new-password"
          placeholder="mind. 8 Zeichen, eine Ziffer"
          value={newPassword}
          invalid={!!error && newPassword.length < MIN_PASSWORD_LENGTH}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Field
          id="reset-submit-confirm"
          label="Passwort bestätigen"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPw}
          invalid={!!error && confirmPw !== newPassword}
          onChange={(e) => setConfirmPw(e.target.value)}
        />

        <div className={styles.authError} role="alert">{error}</div>

        <div className={styles.authActions}>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? 'Wird gespeichert…' : 'Passwort setzen'}
          </button>
          <button type="button" className={styles.btnText} onClick={onBack}>
            Abbrechen
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
