/**
 * Users — admin directory. Search a player (leaderboard-sourced) and open
 * their detail view; or jump straight to any user_id (guests not on the
 * leaderboard). The detail page (UserDetail) shows stats, runs and
 * achievements; individual runs deep-link into the Run-Inspektor.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPlayers, type PlayerSummary } from '../../api/admin';
import { errorMessage } from '../../api/http';
import admin from '../admin.module.css';
import styles from './UsersIndex.module.css';

export function UsersIndex() {
  const nav = useNavigate();
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [query, setQuery] = useState('');
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listPlayers()
      .then(setPlayers)
      .catch((e) => setError(errorMessage(e, 'Spielerliste konnte nicht geladen werden')))
      .finally(() => setLoaded(true));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? players
      : players.filter((p) =>
          p.display_name.toLowerCase().includes(q) || p.user_id.toLowerCase().includes(q));
    return list.slice(0, 50);
  }, [players, query]);

  const open = (uid: string) => nav(`/admin/users/${encodeURIComponent(uid)}`);

  const onManual = (e: FormEvent) => {
    e.preventDefault();
    const uid = manualId.trim();
    if (uid) open(uid);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Users</h1>
        <p className={styles.sub}>
          Spieler suchen und Profil, Runs &amp; Achievements einsehen.
          Liste stammt aus der Punkte-Bestenliste — Spieler ohne Punktestand
          per User-ID direkt öffnen.
        </p>
      </header>

      <section className={styles.card}>
        <label className={styles.fieldLabel}>Spieler suchen</label>
        <input
          className={styles.input}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name oder User-ID…"
          spellCheck={false}
          autoFocus
        />

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.list}>
          {!loaded ? (
            <span className={styles.muted}>Lädt…</span>
          ) : players.length === 0 ? (
            <span className={styles.muted}>Keine Spieler mit Punktestand gefunden.</span>
          ) : filtered.length === 0 ? (
            <span className={styles.muted}>Keine Treffer.</span>
          ) : (
            filtered.map((p) => (
              <button
                key={p.user_id}
                type="button"
                className={styles.row}
                onClick={() => open(p.user_id)}
              >
                <span className={styles.name}>{p.display_name}</span>
                <span className={styles.id}>{p.user_id}</span>
                <span className={styles.pts}>{p.points} P</span>
              </button>
            ))
          )}
        </div>

        <form className={styles.manualRow} onSubmit={onManual}>
          <div className={styles.manualField}>
            <label className={styles.fieldLabel}>…oder User-ID direkt (Gäste o. ä.)</label>
            <input
              className={styles.input}
              type="text"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="cognito-sub oder guest_…"
              spellCheck={false}
            />
          </div>
          <button type="submit" className={admin.btnSecondary} disabled={!manualId.trim()}>
            Öffnen
          </button>
        </form>
      </section>
    </div>
  );
}
