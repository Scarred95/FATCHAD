import { useRef, useState } from 'react';
import JSZip from 'jszip';
import { cardArraySchema } from '../schema';
import { decksOf, useStore } from '../store';
import { serializeDeck } from '../utils/jsonOrder';
import { slugify } from '../utils/slug';
import type { Card } from '../types';

type Policy = 'replace' | 'keep' | 'skip';

export function ImportExportBar() {
  const cards = useStore((s) => s.cards);
  const importCards = useStore((s) => s.importCards);
  const reset = useStore((s) => s.reset);
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
        const json = JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
        const parsed = cardArraySchema.safeParse(json);
        if (!parsed.success) {
          errCount++;
          console.error(`Schema errors in ${f.name}:`, parsed.error.issues);
          continue;
        }
        all.push(...(parsed.data as Card[]));
      } catch (e) {
        errCount++;
        console.error(`Could not parse ${f.name}`, e);
      }
    }
    if (errCount) setStatus(`${errCount} file(s) failed to parse — see console`);
    if (!all.length) return;
    const existingIds = new Set(cards.map((c) => c._id));
    const conflicts = all.filter((c) => existingIds.has(c._id)).length;
    if (conflicts === 0) {
      const r = importCards(all, 'skip');
      setStatus(`Imported ${r.added} card(s)`);
    } else {
      setPending({ incoming: all, conflicts });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const resolveConflicts = (policy: Policy) => {
    if (!pending) return;
    const r = importCards(pending.incoming, policy);
    setStatus(`Imported: +${r.added} new · ${r.replaced} replaced · ${r.skipped} skipped`);
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
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button onClick={() => fileRef.current?.click()} className="btn-secondary">Import JSON…</button>
      <button onClick={exportAll} className="btn-secondary" disabled={!cards.length}>Export all (zip)</button>
      <button
        onClick={() => {
          if (confirm('Reset all data? This cannot be undone.')) reset();
        }}
        className="btn-danger"
        disabled={!cards.length}
      >Reset</button>
      {status && <span className="text-xs text-zinc-400">{status}</span>}

      {pending && (
        <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
          <div className="panel p-5 max-w-md w-full space-y-3">
            <div className="text-lg font-semibold">Conflicting _ids</div>
            <p className="text-sm text-zinc-300">
              {pending.conflicts} incoming card(s) share an <code>_id</code> with existing cards. How should they be resolved?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPending(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => resolveConflicts('skip')} className="btn-secondary">Skip</button>
              <button onClick={() => resolveConflicts('keep')} className="btn-secondary">Keep existing</button>
              <button onClick={() => resolveConflicts('replace')} className="btn-primary">Replace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
