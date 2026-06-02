import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import styles from './auth.module.css';

type Step = 'credentials' | 'confirm';

export default function Register() {
  const register = useAuthStore((s) => s.register);
  const confirmRegistration = useAuthStore((s) => s.confirmRegistration);
  const loading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwörter stimmen nicht überein'); return; }
    try {
      await register(email, password, displayName.trim());
      setStep('confirm');
    } catch (err: any) {
      setError(err.message ?? 'Registrierung fehlgeschlagen');
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await confirmRegistration(email, code);
      navigate('/login');
    } catch (err: any) {
      setError(err.message ?? 'Code ungültig');
    }
  }

  if (step === 'confirm') {
    return (
      <main className={`page ${styles.page}`}>
        <div className={styles.card}>
          <h1 className={styles.title}>E-Mail bestätigen</h1>
          <p className={styles.hint}>
            Wir haben einen Code an <strong>{email}</strong> geschickt.
          </p>
          <form className={styles.form} onSubmit={handleConfirm}>
            <input
              className={styles.input}
              type="text"
              placeholder="Bestätigungscode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? '…' : 'Bestätigen'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className={`page ${styles.page}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>Registrieren</h1>

        <form className={styles.form} onSubmit={handleRegister}>
          <input
            className={styles.input}
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className={styles.input}
            type="text"
            placeholder="Anzeigename"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <input
            className={styles.input}
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            className={styles.input}
            type="password"
            placeholder="Passwort wiederholen"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? '…' : 'Konto erstellen'}
          </button>
        </form>

        <div className={styles.links}>
          <Link to="/login" className={styles.btnText}>
            Bereits ein Konto? Anmelden
          </Link>
        </div>
      </div>
    </main>
  );
}
