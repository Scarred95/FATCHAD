/**
 * Endings import / export bar.
 *
 * Format mirrors the seed file (`backend/events/basic_endings.json`):
 * a single JSON array of Ending objects. That way an admin export can be
 * dropped straight into `backend/events/*_endings.json` for `seed_events.py`
 * to pick up — round-trip-safe.
 *
 * Conflict resolution mirrors ImportExportBar (cards): if any incoming id
 * already exists, prompt for replace / keep / skip.
 */
import { useRef, useState } from 'react';
import { endingArraySchema } from '../schema';
import { useAdminEndingStore } from '../endingStore';
import { download } from '../utils/download';
import { stripJsonComments } from '../utils/jsonc';
import type { Ending } from '../types';
import admin from '../admin.module.css';
import styles from './ImportExportBar.module.css';

type Policy = 'replace' | 'keep' | 'skip';

export function EndingsImportExportBar() {
  const endings = useAdminEndingStore((s) => s.endings);
  const importEndings = useAdminEndingStore((s) => s.importEndings);
  const clearLocal = useAdminEndingStore((s) => s.clearLocal);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<{ incoming: Ending[]; conflicts: number } | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const all: Ending[] = [];
    let errCount = 0;
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const json = JSON.parse(stripJsonComments(text));
        const parsed = endingArraySchema.safeParse(json);
        if (!parsed.success) {
          errCount++;
          // eslint-disable-next-line no-console
          console.error(`Schema errors in ${f.name}:`, parsed.error.issues);
          continue;
        }
        all.push(...(parsed.data as Ending[]));
      } catch (e) {
        errCount++;
        // eslint-disable-next-line no-console
        console.error(`Could not parse ${f.name}`, e);
      }
    }
    if (errCount) setStatus(`${errCount} Datei(en) konnten nicht geparst werden — siehe Konsole`);
    if (!all.length) return;

    const existingIds = new Set(endings.map((e) => e._id));
    const conflicts = all.filter((e) => existingIds.has(e._id)).length;
    if (conflicts === 0) {
      const r = await importEndings(all, 'skip');
      setStatus(`Importiert: ${r.added}${r.failed ? ` · ${r.failed} fehlgeschlagen` : ''}`);
    } else {
      setPending({ incoming: all, conflicts });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const resolveConflicts = async (policy: Policy) => {
    if (!pending) return;
    const r = await importEndings(pending.incoming, policy);
    setStatus(
      `Importiert: +${r.added} neu · ${r.replaced} ersetzt · ${r.skipped} übersprungen${r.failed ? ` · ${r.failed} fehlgeschlagen` : ''}`,
    );
    setPending(null);
  };

  const exportAll = () => {
    // Match the seed file shape: array of full Ending docs, 2-space indent.
    const blob = new Blob([JSON.stringify(endings, null, 2) + '\n'], { type: 'application/json' });
    download(blob, 'endings_export.json');
  };

  return (
    <div className={styles.bar}>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.jsonc,application/json"
        multiple
        className={styles.hiddenFile}
        onChange={(e) => void onFiles(e.target.files)}
      />
      <button onClick={() => fileRef.current?.click()} className={admin.btnSecondary}>
        Import JSON…
      </button>
      <button
        onClick={exportAll}
        className={admin.btnSecondary}
        disabled={!endings.length}
      >
        Export all (.json)
      </button>
      <button
        onClick={() => {
          if (confirm('Lokale Ansicht leeren? (Server bleibt unangetastet — Reload holt sie zurück.)')) clearLocal();
        }}
        className={admin.btnDanger}
        disabled={!endings.length}
      >
        Clear local
      </button>
      {status && <span className={styles.status}>{status}</span>}

      {pending && (
        <div className={admin.modalBackdrop}>
          <div className={`${admin.panel} ${styles.modal}`}>
            <div className={styles.modalTitle}>Konflikt: gleiche IDs</div>
            <p className={styles.modalText}>
              {pending.conflicts} Ending(s) im Import teilen sich eine <code>_id</code> mit existierenden. Wie auflösen?
            </p>
            <div className={styles.modalActions}>
              <button onClick={() => setPending(null)} className={admin.btnSecondary}>Abbrechen</button>
              <button onClick={() => void resolveConflicts('skip')} className={admin.btnSecondary}>Überspringen</button>
              <button onClick={() => void resolveConflicts('keep')} className={admin.btnSecondary}>Behalten</button>
              <button onClick={() => void resolveConflicts('replace')} className={admin.btnPrimary}>Ersetzen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
