import { FormEvent, useState } from 'react';
import AuthShell from '../AuthShell';
import Field from '../components/Field';
import styles from '../auth.module.css';

interface ConfirmEmailPageProps {
  /** Pre-filled username (carried over from <SignupPage />). */
  username?: string;
  /** Fired after Cognito accepts the confirmation code. */
  onConfirmed?: (username: string) => void;
  /** "Zurück zum Login" → drop the unconfirmed account, go back. */
  onBackToLogin?: () => void;
  /** Hook the real backend here. Throw an Error to surface server messages. */
  onSubmit?: (args: { username: string; code: string }) => Promise<void>;
  /** Optional resend handler. If omitted the resend button is hidden. */
  onResend?: (username: string) => Promise<void>;
}

/**
 * Step 2 of the signup flow. The user pastes the 6-digit code they got
 * via email; we hand it to Cognito (or the demo handler).
 */
export default function ConfirmEmailPage({
  username: initialUsername = '',
  onConfirmed,
  onBackToLogin,
  onSubmit,
  onResend,
}: ConfirmEmailPageProps) {
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError('Benutzername fehlt.');
    if (!/^\d{6}$/.test(code.trim())) return setError('Gib den 6-stelligen Code ein.');

    setError('');
    setResendNotice('');
    setBusy(true);
    try {
      const args = { username: username.trim(), code: code.trim() };
      if (onSubmit) await onSubmit(args);
      onConfirmed?.(args.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bestätigung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!username.trim() || !onResend) return;
    setError('');
    setBusy(true);
    try {
      await onResend(username.trim());
      setResendNotice('Neuer Code wurde gesendet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konnte Code nicht erneut senden.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className={styles.authIntro}>
        <span className={styles.eyebrow}>Letzter Schritt</span>
        <h2>E-Mail bestätigen</h2>
      </div>

      <form className={styles.authForm} onSubmit={submit}>
        <Field
          id="confirm-user"
          label="Benutzername"
          autoComplete="username"
          value={username}
          invalid={!!error && !username.trim()}
          onChange={(e) => setUsername(e.target.value)}
          readOnly={!!initialUsername}
        />
        <Field
          id="confirm-code"
          label="Code aus der E-Mail"
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="6-stellig"
          value={code}
          invalid={!!error && !/^\d{6}$/.test(code.trim())}
          onChange={(e) => setCode(e.target.value)}
        />

        <div className={styles.authError} role="alert">{error || resendNotice}</div>

        <div className={styles.authActions}>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? 'Wird geprüft…' : 'Konto bestätigen'}
          </button>
          {onResend && (
            <button type="button" className={styles.btnSecondary} onClick={resend} disabled={busy}>
              Code erneut senden
            </button>
          )}
          <button type="button" className={styles.btnText} onClick={onBackToLogin}>
            Zurück zum Login
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
