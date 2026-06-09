import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Ambient from '../components/Ambient/Ambient';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import styles from './auth.module.css';

type Step = 'credentials' | 'confirm' | 'claim';

export default function Register() {
  const register = useAuthStore((s) => s.register);
  const confirmRegistration = useAuthStore((s) => s.confirmRegistration);
  const login = useAuthStore((s) => s.login);
  const claimGuestData = useAuthStore((s) => s.claimGuestData);
  const isGuest = useAuthStore((s) => s.isGuest);
  const accessToken = useAuthStore((s) => s.accessToken);
  const loading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);

  // If a guest started this registration, snapshot their access token before
  // we log into the new account (which replaces the session) — we need it to
  // claim their progress afterwards.
  const guestTokenRef = useRef<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwörter stimmen nicht überein'); return; }
    try {
      guestTokenRef.current = isGuest ? accessToken : null;
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
      // Upgrading from a guest: log straight into the new account so we hold a
      // real session, then offer to bring the guest's progress over.
      if (guestTokenRef.current) {
        await login(email, password);
        setStep('claim');
        return;
      }
      navigate('/login');
    } catch (err: any) {
      setError(err.message ?? 'Code ungültig');
    }
  }

  async function handleClaim() {
    const guestToken = guestTokenRef.current;
    if (!guestToken) { navigate('/'); return; }
    setClaiming(true);
    try {
      const migrated = await claimGuestData(guestToken);
      pushToast(
        migrated > 0
          ? `Fortschritt übernommen (${migrated} ${migrated === 1 ? 'Runde' : 'Runden'})`
          : 'Fortschritt übernommen',
        'info',
      );
    } catch {
      pushToast('Fortschritt konnte nicht übernommen werden', 'error');
    } finally {
      setClaiming(false);
      navigate('/');
    }
  }

  if (step === 'claim') {
    return (
      <main className={`page ${styles.page}`}>
        <Ambient />
        <div className={styles.card}>
          <h1 className={styles.title}>Fortschritt übernehmen?</h1>
          <p className={styles.hint}>
            Du hast als Gast gespielt. Sollen deine bisherigen Runden in dein
            neues Konto übernommen werden?
          </p>
          <button
            className={styles.btnPrimary}
            onClick={handleClaim}
            disabled={claiming}
          >
            {claiming ? '…' : 'Ja, übernehmen'}
          </button>
          <button
            className={styles.btnText}
            onClick={() => navigate('/')}
            disabled={claiming}
          >
            Nein, neu anfangen
          </button>
        </div>
      </main>
    );
  }

  if (step === 'confirm') {
    return (
      <main className={`page ${styles.page}`}>
        <Ambient />
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
      <Ambient />
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
