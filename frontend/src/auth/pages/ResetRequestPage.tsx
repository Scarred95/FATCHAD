import { FormEvent, ReactNode, useState } from 'react';
import AuthShell from '../AuthShell';
import Field from '../components/Field';
import CodeDisplay from '../components/CodeDisplay';
import styles from '../auth.module.css';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface ResetRequestPageProps {
  /** "Abbrechen" → leave the flow / back to login. */
  onBack?: () => void;
  /** "Code eingeben" after the code has been sent → ResetSubmitPage. */
  onContinue?: (username: string) => void;
  /** Optional header slot (e.g. a back button). */
  header?: ReactNode;
  /** Hook the real backend here. Return a string to display the code
   *  (demo only), or null/undefined to just show the "sent" confirmation. */
  onRequestCode?: (args: { username: string; email: string }) => Promise<string | null | void>;
}

/**
 * Step 1 of forgot-password: user enters username + email; we ask the
 * backend to send a reset code. Step 2 (entering the code + new password)
 * lives in <ResetSubmitPage />.
 */
export default function ResetRequestPage({
  onBack,
  onContinue,
  header = null,
  onRequestCode,
}: ResetRequestPageProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return setError('Gib deinen Benutzernamen ein.');
    if (!EMAIL_RE.test(email.trim())) return setError('Gib eine gültige E-Mail-Adresse ein.');

    setError('');
    setBusy(true);
    try {
      const fresh = onRequestCode
        ? await onRequestCode({ username: username.trim(), email: email.trim() })
        : String(Math.floor(100000 + Math.random() * 900000));
      setCode(typeof fresh === 'string' ? fresh : '');
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code konnte nicht gesendet werden.');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell header={header}>
        <div className={styles.resetSent}>
          <h2>Code gesendet</h2>
          <p>
            Wir haben einen Reset-Code an <b>{sentTo}</b> geschickt. Gib ihn auf
            der nächsten Seite ein, um ein neues Passwort zu setzen.
          </p>
          {code && <CodeDisplay code={code} />}
          {code && (
            <p className={styles.demoNote}>
              Demo-Modus — der Code wird hier direkt angezeigt.
            </p>
          )}
          <div className={styles.authActions} style={{ width: '100%' }}>
            <button
              className={styles.btnPrimary}
              onClick={() => onContinue?.(username.trim())}
            >
              Code eingeben
            </button>
            <button className={styles.btnSecondary} onClick={onBack}>
              Zurück zum Login
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell header={header}>
      <div className={styles.authIntro}>
        <span className={styles.eyebrow}>Keine Panik</span>
        <h2>Code anfordern</h2>
      </div>

      <form className={styles.authForm} onSubmit={submit}>
        <Field
          id="reset-user"
          label="Benutzername"
          autoFocus
          autoComplete="username"
          placeholder="z. B. helmuth_v"
          value={username}
          invalid={!!error && !username.trim()}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          id="reset-email"
          label="E-Mail"
          type="email"
          autoComplete="email"
          placeholder="du@beispiel.de"
          value={email}
          invalid={!!error && !email.trim()}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className={styles.authError} role="alert">{error}</div>

        <div className={styles.authActions}>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? 'Wird gesendet…' : 'Code senden'}
          </button>
          <button type="button" className={styles.btnText} onClick={onBack}>
            Abbrechen
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
