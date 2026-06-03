/**
 * Run inspector (PR-A5) — read-only debugging view of a single run.
 *
 * Answers "why didn't this achievement fire?" by showing the full run state
 * plus the per-turn stat trail (history[].stats) that group-C predicates read
 * — the snapshot the player-facing history endpoint deliberately omits.
 *
 * A run row lives under USER#<uid> with no run_id GSI, so lookup needs both
 * the user id and the run id. The route accepts them as optional params
 * (/admin/runs/:userId/:runId) and otherwise falls back to a manual form.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRunHistory, type AdminRunView } from '../../api/admin';
import { errorMessage } from '../../api/http';
import { STAT_KEYS, STAT_LABELS } from '../types';
import admin from '../admin.module.css';
import styles from './RunInspector.module.css';

export function RunInspector() {
  const { userId: routeUser, runId: routeRun } = useParams<{ userId: string; runId: string }>();
  const nav = useNavigate();

  const [userId, setUserId] = useState(routeUser ?? '');
  const [runId, setRunId] = useState(routeRun ?? '');
  const [run, setRun] = useState<AdminRunView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (u: string, r: string) => {
    const uid = u.trim();
    const rid = r.trim();
    if (!uid || !rid) return;
    setBusy(true);
    setError(null);
    try {
      const data = await getRunHistory(uid, rid);
      setRun(data);
    } catch (e) {
      setRun(null);
      setError(errorMessage(e, 'Run konnte nicht geladen werden'));
    } finally {
      setBusy(false);
    }
  };

  // Auto-load when both ids arrive via the route.
  useEffect(() => {
    if (routeUser && routeRun) void load(routeUser, routeRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeUser, routeRun]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Push the ids into the URL so the view is linkable; the effect loads.
    nav(`/admin/runs/${encodeURIComponent(userId.trim())}/${encodeURIComponent(runId.trim())}`);
    void load(userId, runId);
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

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>User-ID</label>
          <input
            className={styles.input}
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="z.B. cognito-sub oder guest_…"
            spellCheck={false}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Run-ID</label>
          <input
            className={styles.input}
            type="text"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="run_…"
            spellCheck={false}
          />
        </div>
        <button
          type="submit"
          className={admin.btnPrimary}
          disabled={busy || !userId.trim() || !runId.trim()}
        >
          {busy ? 'Lädt…' : 'Laden'}
        </button>
      </form>

      {error && <div className={styles.error}>{error}</div>}

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
