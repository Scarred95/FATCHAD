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
import { z } from 'zod';
import { useAdminEndingStore } from '../endingStore';
import { download } from './ImportExportBar';
import type { Ending } from '../types';
import admin from '../admin.module.css';
import styles from './ImportExportBar.module.css';

type Policy = 'replace' | 'keep' | 'skip';

// Tolerant schema: only id + title + description are mandatory; everything
// else has a server-side default and is allowed to be omitted from the file.
const endingSchema = z.object({
  _id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().optional(),
  default: z.boolean().optional(),
  enabled: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
  requires: z.object({
    flags_all: z.array(z.string()).optional(),
    flags_none: z.array(z.string()).optional(),
    flags_any: z.array(z.string()).optional(),
    stats: z.record(z.object({
      min: z.number().nullable().optional(),
      max: z.number().nullable().optional(),
    })).optional(),
  }).optional(),
});
const endingArraySchema = z.array(endingSchema);

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
        // Strip /* */ and // comments so .jsonc seed files parse too.
        const json = JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
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
