import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import styles from './auth.module.css';

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const userId = useAuthStore((s) => s.userId);
  const initializing = useAuthStore((s) => s.initializing);
  const navigate = useNavigate();

  // Session still being restored from localStorage — render nothing to
  // avoid flashing the login form before a potential redirect.
  if (initializing) return null;

  // Already logged in — skip the login page entirely.
  if (userId) return <Navigate to="/" replace />;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Anmeldung fehlgeschlagen');
    }
  }

  return (
    <main className={`page ${styles.page}`}>
      <div className={styles.card}>
        <h1 className={styles.title}>Anmelden</h1>

        <form className={styles.form} onSubmit={handleSubmit}>
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
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? '…' : 'Anmelden'}
          </button>
        </form>

        <div className={styles.links}>
          <Link to="/forgot-password" className={styles.btnText}>
            Passwort vergessen?
          </Link>
          <Link to="/register" className={styles.btnText}>
            Noch kein Konto? Registrieren
          </Link>
        </div>
      </div>
    </main>
  );
}
