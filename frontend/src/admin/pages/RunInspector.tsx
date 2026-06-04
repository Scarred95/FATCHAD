/**
 * Run inspector (PR-A5) — read-only debugging view of a single run.
 *
 * Answers "why didn't this achievement fire?" by showing the full run state
 * plus the per-turn stat trail (history[].stats) that group-C predicates read
 * — the snapshot the player-facing history endpoint deliberately omits.
 *
 * A run row lives under USER#<uid> with no run_id GSI, so lookup needs both a
 * user id and a run id. To avoid typing opaque ids the page offers:
 *   1. a player search (from the points leaderboard) that resolves a name to
 *      a user_id — plus a manual user_id field for scoreless/guest accounts;
 *   2. a run-picker listing that user's runs, click to inspect.
 * The selection is mirrored into the URL (/admin/runs/:userId/:runId) so the
 * view stays linkable, and route params auto-load on mount.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getRunHistory, listPlayers, listUserRuns,
  type AdminRunView, type PlayerSummary, type RunSummaryRow,
} from '../../api/admin';
import { errorMessage } from '../../api/http';
import { STAT_KEYS, STAT_LABELS } from '../types';
import admin from '../admin.module.css';
import styles from './RunInspector.module.css';

export function RunInspector() {
  const { userId: routeUser, runId: routeRun } = useParams<{ userId: string; runId: string }>();
  const nav = useNavigate();

  // Player directory (leaderboard-sourced) + search.
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [manualId, setManualId] = useState('');

  // Selected user + their runs.
  const [selectedUser, setSelectedUser] = useState<string | null>(routeUser ?? null);
  const [runs, setRuns] = useState<RunSummaryRow[]>([]);
  const [runsBusy, setRunsBusy] = useState(false);

  // Loaded run history.
  const [run, setRun] = useState<AdminRunView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the player directory once.
  useEffect(() => {
    listPlayers()
      .then(setPlayers)
      .catch((e) => setError(errorMessage(e, 'Spielerliste konnte nicht geladen werden')));
  }, []);

  // When a user is selected, load their runs.
  useEffect(() => {
    if (!selectedUser) { setRuns([]); return; }
    setRunsBusy(true);
    listUserRuns(selectedUser)
      .then(setRuns)
      .catch((e) => setError(errorMessage(e, 'Runs konnten nicht geladen werden')))
      .finally(() => setRunsBusy(false));
  }, [selectedUser]);

  // Auto-load the full history when both ids are in the route.
  useEffect(() => {
    if (!routeUser || !routeRun) { setRun(null); return; }
    setBusy(true);
    setError(null);
    getRunHistory(routeUser, routeRun)
      .then(setRun)
      .catch((e) => { setRun(null); setError(errorMessage(e, 'Run konnte nicht geladen werden')); })
      .finally(() => setBusy(false));
  }, [routeUser, routeRun]);

  const displayName = useMemo(() => {
    if (!selectedUser) return null;
    return players.find((p) => p.user_id === selectedUser)?.display_name ?? null;
  }, [players, selectedUser]);

  const filteredPlayers = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    if (!q) return players.slice(0, 8);
    return players
      .filter((p) =>
        p.display_name.toLowerCase().includes(q) || p.user_id.toLowerCase().includes(q))
      .slice(0, 8);
  }, [players, playerQuery]);

  const pickUser = (uid: string) => {
    setError(null);
    setSelectedUser(uid);
    setRun(null);
    // Drop any run from the URL; keep the page on the picker for this user.
    nav(`/admin/runs`, { replace: true });
  };

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const uid = manualId.trim();
    if (uid) pickUser(uid);
  };

  const pickRun = (runId: string) => {
    if (!selectedUser) return;
    nav(`/admin/runs/${encodeURIComponent(selectedUser)}/${encodeURIComponent(runId)}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Run-Inspektor</h1>
        <p className={styles.sub}>
          Vollständiger Run-Zustand inkl. Stat-Verlauf pro Zug — zum Debuggen,
          warum ein Achievement (nicht) gefeuert hat.
        </p>
      </header>

      {/* ── Step 1: pick a player ─────────────────────────────── */}
      {!selectedUser ? (
        <section className={styles.pickerCard}>
          <label className={styles.fieldLabel}>Spieler suchen</label>
          <input
            className={styles.input}
            type="text"
            value={playerQuery}
            onChange={(e) => setPlayerQuery(e.target.value)}
            placeholder="Name oder User-ID…"
            spellCheck={false}
            autoFocus
          />
          <div className={styles.playerList}>
            {players.length === 0 ? (
              <span className={styles.muted}>Keine Spieler mit Punktestand gefunden.</span>
            ) : filteredPlayers.length === 0 ? (
              <span className={styles.muted}>Keine Treffer.</span>
            ) : (
              filteredPlayers.map((p) => (
                <button
                  key={p.user_id}
                  type="button"
                  className={styles.playerRow}
                  onClick={() => pickUser(p.user_id)}
                >
                  <span className={styles.playerName}>{p.display_name}</span>
                  <span className={styles.playerId}>{p.user_id}</span>
                  <span className={styles.playerPts}>{p.points} P</span>
                </button>
              ))
            )}
          </div>

          <form className={styles.manualRow} onSubmit={onManualSubmit}>
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
              Übernehmen
            </button>
          </form>
        </section>
      ) : (
        <div className={styles.selectedBar}>
          <div className={styles.selectedMeta}>
            <span className={styles.metaLabel}>Spieler</span>
            <span>
              {displayName ? <strong>{displayName}</strong> : null}
              <code className={styles.mono}>{selectedUser}</code>
            </span>
          </div>
          <button
            type="button"
            className={admin.btnSecondary}
            onClick={() => { setSelectedUser(null); setRun(null); nav('/admin/runs', { replace: true }); }}
          >
            Spieler wechseln
          </button>
        </div>
      )}

      {/* ── Step 2: pick a run ────────────────────────────────── */}
      {selectedUser && !run && (
        <section className={styles.pickerCard}>
          <label className={styles.fieldLabel}>Run wählen</label>
          {runsBusy ? (
            <span className={styles.muted}>Lädt…</span>
          ) : runs.length === 0 ? (
            <span className={styles.muted}>Keine Runs für diesen Spieler.</span>
          ) : (
            <div className={styles.runList}>
              {runs.map((r) => (
                <button
                  key={r.run_id}
                  type="button"
                  className={styles.runRow}
                  onClick={() => pickRun(r.run_id)}
                >
                  <code className={styles.mono}>{r.run_id}</code>
                  <span className={`${styles.badge} ${styles[`st_${r.status}`] ?? ''}`}>{r.status}</span>
                  <span className={styles.runMeta}>Zug {r.turn}</span>
                  <span className={styles.runMeta}>{r.ending ?? '—'}</span>
                  <span className={styles.runMeta}>{fmtDate(r.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {busy && <div className={styles.muted}>Run wird geladen…</div>}

      {/* ── Step 3: the run ───────────────────────────────────── */}
      {run && (
        <>
          <section className={styles.metaCard}>
            <div className={styles.metaGrid}>
              <Meta label="Run" value={run._id} mono />
              <Meta label="User" value={run.user_id} mono />
              <Meta label="Status" value={run.status} />
              <Meta label="Züge" value={String(run.turn)} />
              <Meta label="Ende" value={run.ending ?? '—'} mono />
              <Meta label="Erstellt" value={fmtDate(run.created_at)} />
              <Meta label="Aktualisiert" value={fmtDate(run.updated_at)} />
            </div>

            <div className={styles.statRow}>
              {STAT_KEYS.map((s) => (
                <div key={s} className={styles.statChip}>
                  <span className={styles.statName}>{STAT_LABELS[s]}</span>
                  <span className={styles.statVal}>{run.stats[s]}</span>
                </div>
              ))}
            </div>

            {run.flags.length > 0 && (
              <div className={styles.flags}>
                <span className={styles.metaLabel}>Flags</span>
                <div className={styles.flagList}>
                  {run.flags.map((f) => <code key={f} className={styles.flag}>{f}</code>)}
                </div>
              </div>
            )}

            <div className={styles.flags}>
              <span className={styles.metaLabel}>Freigeschaltet</span>
              <div className={styles.flagList}>
                {run.newly_unlocked.length === 0
                  ? <span className={styles.muted}>—</span>
                  : run.newly_unlocked.map((a) => <code key={a} className={styles.flag}>{a}</code>)}
              </div>
            </div>
          </section>

          <h2 className={styles.trailHeading}>Stat-Verlauf ({run.history.length} Züge)</h2>
          {run.history.length === 0 ? (
            <div className={styles.muted}>Keine History-Einträge.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.num}>Zug</th>
                    <th>Karte</th>
                    <th className={styles.num}>Wahl</th>
                    {STAT_KEYS.map((s) => (
                      <th key={s} className={styles.num}>{STAT_LABELS[s]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {run.history.map((h, i) => (
                    <tr key={i}>
                      <td className={styles.num}>{h.turn}</td>
                      <td className={styles.mono}>{h.event_id}</td>
                      <td className={styles.num}>{h.choice}</td>
                      {STAT_KEYS.map((s) => (
                        <td key={s} className={styles.num}>
                          {h.stats ? h.stats[s] : <span className={styles.muted}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.meta}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={mono ? styles.mono : undefined}>{value}</span>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE');
}
