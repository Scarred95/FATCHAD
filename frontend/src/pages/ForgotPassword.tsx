import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import styles from './auth.module.css';

type Step = 'email' | 'reset';

export default function ForgotPassword() {
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const confirmNewPassword = useAuthStore((s) => s.confirmNewPassword);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep('reset');
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Senden des Codes');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmNewPassword(email, code, newPassword);
      navigate('/login');
    } catch (err: any) {
      setError(err.message ?? 'Code ungültig oder Passwort zu schwach');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'reset') {
    return (
      <main className={`page ${styles.page}`}>
        <div className={styles.card}>
          <h1 className={styles.title}>Neues Passwort</h1>
          <p className={styles.hint}>
            Code wurde an <strong>{email}</strong> gesendet.
          </p>
          <form className={styles.form} onSubmit={handleReset}>
            <input
              className={styles.input}
              type="text"
              placeholder="Reset-Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
            <input
              className={styles.input}
              type="password"
              placeholder="Neues Passwort"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? '…' : 'Passwort setzen'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className={`page ${styles.page}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>Passwort vergessen</h1>
        <p className={styles.hint}>
          Gib deine E-Mail ein — wir schicken dir einen Reset-Code.
        </p>
        <form className={styles.form} onSubmit={handleSendCode}>
          <input
            className={styles.input}
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? '…' : 'Code senden'}
          </button>
        </form>

        <div className={styles.links}>
          <Link to="/login" className={styles.btnText}>
            Zurück zur Anmeldung
          </Link>
        </div>
      </div>
    </main>
  );
}
