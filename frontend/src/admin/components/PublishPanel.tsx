/**
 * Publish panel — bottom-left sidebar control for snapshotting the working
 * catalog into a versioned bundle that gameplay clients load.
 *
 * Flow:
 *   1. On mount, fetch the current pointer (the live version).
 *   2. "Veröffentlichen" opens a confirm modal — clicking through POSTs to
 *      /admin/publish, then refreshes the pointer.
 *   3. Toast on success/error; button is disabled while a request is in flight.
 *
 * No draft layer: every catalog edit is already in the working copy, so this
 * publishes the catalog "as is right now". The confirm dialog wording reflects
 * that — players will see the new version immediately.
 */
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal/Modal';
import { getCurrentPointer, publishCatalog, type CatalogPointer } from '../../api/admin';
import { useToastStore } from '../../stores/toastStore';
import styles from './PublishPanel.module.css';

function formatPublishedAt(iso: string): string {
  // The pointer is shown in a tight sidebar slot — keep it short. We render
  // the relative-ish label "vor 3 Min." for recent publishes and fall back to
  // a date string for older ones.
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function PublishPanel() {
  const [pointer, setPointer] = useState<CatalogPointer | null>(null);
  const [pointerLoaded, setPointerLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await getCurrentPointer();
        if (!cancelled) setPointer(p);
      } catch {
        // Pointer fetch failing isn't critical — the publish button still works.
        // We just show "unbekannt" in the status line.
      } finally {
        if (!cancelled) setPointerLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onConfirmPublish() {
    setConfirmOpen(false);
    setPublishing(true);
    try {
      const next = await publishCatalog();
      setPointer(next);
      pushToast(`Veröffentlicht: ${next.version}`, 'info');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Veröffentlichung fehlgeschlagen';
      pushToast(msg, 'error');
    } finally {
      setPublishing(false);
    }
  }

  const statusLine = !pointerLoaded
    ? 'lade…'
    : pointer
      ? `${pointer.version} · ${formatPublishedAt(pointer.published_at)}`
      : 'noch nie veröffentlicht';

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.label}>Live</div>
        <div className={styles.status} title={pointer?.version ?? undefined}>
          {statusLine}
        </div>
        <button
          type="button"
          className={styles.publishBtn}
          onClick={() => setConfirmOpen(true)}
          disabled={publishing}
        >
          {publishing ? 'Veröffentliche…' : 'Veröffentlichen'}
        </button>
      </div>

      <Modal
        open={confirmOpen}
        title="Katalog veröffentlichen?"
        body="Der gesamte Katalog wird als neue Version veröffentlicht. Spieler-Clients laden ab sofort diese Version."
        onClose={() => setConfirmOpen(false)}
        actions={[
          { label: 'Abbrechen', variant: 'ghost', onClick: () => setConfirmOpen(false) },
          { label: 'Veröffentlichen', variant: 'primary', onClick: onConfirmPublish },
        ]}
      />
    </>
  );
}
