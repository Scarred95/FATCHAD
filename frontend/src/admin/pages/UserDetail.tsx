/**
 * User detail — admin aggregate view for one player: lifetime stats, every
 * run, and earned achievements. Runs deep-link into the Run-Inspektor for the
 * per-turn stat trail.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getUserDetail, type UserDetail as UserDetailData } from '../../api/admin';
import { errorMessage } from '../../api/http';
import admin from '../admin.module.css';
import styles from './UserDetail.module.css';

export function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<UserDetailData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    getUserDetail(userId)
      .then(setData)
      .catch((e) => { setData(null); setError(errorMessage(e, 'User konnte nicht geladen werden')); })
      .finally(() => setBusy(false));
  }, [userId]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/admin/users" className={admin.btnSecondary}>← Users</Link>
        <div>
          <h1 className={styles.heading}>{data?.display_name ?? 'User'}</h1>
          <p className={styles.sub}><code>{userId}</code></p>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {busy && <div className={styles.muted}>Lädt…</div>}

      {data && (
        <>
          <section className={styles.statsCard}>
            <Stat label="Punkte" value={data.current_points} />
            <Stat label="Runs gestartet" value={data.totals.runs_started} />
            <Stat label="Abgeschlossen" value={data.totals.runs_completed} />
            <Stat label="Abgebrochen" value={data.totals.runs_abandoned} />
            <Stat label="Achievements" value={data.totals.achievements_unlocked} />
          </section>

          <section className={styles.block}>
            <h2 className={styles.blockHeading}>
              Achievements ({data.achievements.length})
            </h2>
            {data.achievements.length === 0 ? (
              <div className={styles.muted}>Noch keine Achievements freigeschaltet.</div>
            ) : (
              <div className={styles.achList}>
                {data.achievements.map((a) => (
                  <div key={a.id} className={styles.achRow}>
                    <div className={styles.achMain}>
                      <span className={styles.achName}>
                        {a.name}
                        {a.orphaned && <span className={styles.tag}>gelöscht</span>}
                      </span>
                      <code className={styles.achId}>{a.id}</code>
                    </div>
                    {a.unlocks_deck && (
                      <span className={styles.achDeck}>↦ {a.unlocks_deck}</span>
                    )}
                    <span className={styles.achPts}>{a.points} P</span>
                    <span className={styles.achWhen}>{fmtDate(a.unlocked_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.block}>
            <h2 className={styles.blockHeading}>Runs ({data.runs.length})</h2>
            {data.runs.length === 0 ? (
              <div className={styles.muted}>Keine Runs.</div>
            ) : (
              <div className={styles.runList}>
                {data.runs.map((r) => (
                  <button
                    key={r.run_id}
                    type="button"
                    className={styles.runRow}
                    onClick={() => nav(`/admin/runs/${encodeURIComponent(data.user_id)}/${encodeURIComponent(r.run_id)}`)}
                    title="Im Run-Inspektor öffnen"
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
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statVal}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE');
}
