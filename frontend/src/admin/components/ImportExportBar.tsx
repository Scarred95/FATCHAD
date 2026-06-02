import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { cardArraySchema } from '../schema';
import { decksOf, useAdminCardStore } from '../store';
import { download } from '../utils/download';
import { stripJsonComments } from '../utils/jsonc';
import { serializeDeck } from '../utils/jsonOrder';
import { slugify } from '../utils/slug';
import type { Card } from '../types';
import admin from '../admin.module.css';
import styles from './ImportExportBar.module.css';

type Policy = 'replace' | 'keep' | 'skip';

export function ImportExportBar() {
  const cards = useAdminCardStore((s) => s.cards);
  const importCards = useAdminCardStore((s) => s.importCards);
  const clearLocal = useAdminCardStore((s) => s.clearLocal);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<{ incoming: Card[]; conflicts: number } | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const all: Card[] = [];
    let errCount = 0;
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const json = JSON.parse(stripJsonComments(text));
        const parsed = cardArraySchema.safeParse(json);
        if (!parsed.success) {
          errCount++;
          // eslint-disable-next-line no-console
          console.error(`Schema errors in ${f.name}:`, parsed.error.issues);
          continue;
        }
        all.push(...(parsed.data as Card[]));
      } catch (e) {
        errCount++;
        // eslint-disable-next-line no-console
        console.error(`Could not parse ${f.name}`, e);
      }
    }
    if (errCount) setStatus(`${errCount} file(s) failed to parse — see console`);
    if (!all.length) return;
    const existingIds = new Set(cards.map((c) => c._id));
    const conflicts = all.filter((c) => existingIds.has(c._id)).length;
    if (conflicts === 0) {
      const r = await importCards(all, 'skip');
      setStatus(`Imported ${r.added} card(s)${r.failed ? ` · ${r.failed} failed` : ''}`);
    } else {
      setPending({ incoming: all, conflicts });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const resolveConflicts = async (policy: Policy) => {
    if (!pending) return;
    const r = await importCards(pending.incoming, policy);
    setStatus(
      `Imported: +${r.added} new · ${r.replaced} replaced · ${r.skipped} skipped${r.failed ? ` · ${r.failed} failed` : ''}`,
    );
    setPending(null);
  };

  const exportAll = async () => {
    const zip = new JSZip();
    const groups = decksOf(cards);
    for (const [name, list] of groups) {
      const slug = name ? slugify(name) : '_orphans';
      zip.file(`${slug}.json`, serializeDeck(list));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    download(blob, 'fatchad-cards.zip');
  };

  return (
    <div className={styles.bar}>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        multiple
        className={styles.hiddenFile}
        onChange={(e) => void onFiles(e.target.files)}
      />
      <button onClick={() => fileRef.current?.click()} className={admin.btnSecondary}>Import JSON…</button>
      <button onClick={() => void exportAll()} className={admin.btnSecondary} disabled={!cards.length}>Export all (zip)</button>
      <button
        onClick={() => {
          if (confirm('Clear local view? (Does NOT touch the server — use Reload to refetch.)')) clearLocal();
        }}
        className={admin.btnDanger}
        disabled={!cards.length}
      >Clear local</button>
      {status && <span className={styles.status}>{status}</span>}

      {pending && (
        <div className={admin.modalBackdrop}>
          <div className={`${admin.panel} ${styles.modal}`}>
            <div className={styles.modalTitle}>Conflicting _ids</div>
            <p className={styles.modalText}>
              {pending.conflicts} incoming card(s) share an <code>_id</code> with existing cards. How should they be resolved?
            </p>
            <div className={styles.modalActions}>
              <button onClick={() => setPending(null)} className={admin.btnSecondary}>Cancel</button>
              <button onClick={() => void resolveConflicts('skip')} className={admin.btnSecondary}>Skip</button>
              <button onClick={() => void resolveConflicts('keep')} className={admin.btnSecondary}>Keep existing</button>
              <button onClick={() => void resolveConflicts('replace')} className={admin.btnPrimary}>Replace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
