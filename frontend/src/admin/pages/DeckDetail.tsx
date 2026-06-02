import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cardsInDeck, useAdminCardStore } from '../store';
import { download } from '../utils/download';
import { serializeDeck } from '../utils/jsonOrder';
import { slugify } from '../utils/slug';
import { QuickAddDialog } from '../components/QuickAddDialog';
import admin from '../admin.module.css';
import styles from './DeckDetail.module.css';

type SortKey = '_id' | 'title' | 'category' | 'weight' | 'choices' | 'enabled';

export function DeckDetail() {
  const { name } = useParams<{ name: string }>();
  const deckKey = name ?? '';
  const isOrphan = deckKey === '__orphans__';
  const cards = useAdminCardStore((s) => s.cards);
  const setCardEnabled = useAdminCardStore((s) => s.setCardEnabled);
  const setDeckEnabled = useAdminCardStore((s) => s.setDeckEnabled);
  const list = useMemo(() => cardsInDeck(cards, deckKey), [cards, deckKey]);

  const enabledCount = useMemo(
    () => list.filter((c) => c.enabled !== false).length,
    [list],
  );
  const allEnabled = enabledCount === list.length && list.length > 0;
  const allDisabled = enabledCount === 0 && list.length > 0;

  const [sortKey, setSortKey] = useState<SortKey>('_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [quickAdd, setQuickAdd] = useState(false);
  const [busyDeck, setBusyDeck] = useState(false);

  const sorted = useMemo(() => {
    const arr = list.slice();
    arr.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case '_id': av = a._id; bv = b._id; break;
        case 'title': av = a.title; bv = b.title; break;
        case 'category': av = a.category; bv = b.category; break;
        case 'weight': av = a.weight ?? 10; bv = b.weight ?? 10; break;
        case 'choices': av = a.choices.length; bv = b.choices.length; break;
        case 'enabled': av = a.enabled === false ? 0 : 1; bv = b.enabled === false ? 0 : 1; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [list, sortKey, sortDir]);

  const onBulkToggle = async (enabled: boolean) => {
    if (busyDeck) return;
    setBusyDeck(true);
    // deckKey is already canonical ('__orphans__' for the orphan route).
    await setDeckEnabled(deckKey, enabled);
    setBusyDeck(false);
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const exportDeck = () => {
    const slug = isOrphan ? '_orphans' : slugify(deckKey);
    const blob = new Blob([serializeDeck(list)], { type: 'application/json' });
    download(blob, `${slug}.json`);
  };

  const heading = isOrphan ? 'Orphans (no deck_name)' : deckKey;

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link to="/admin" className={styles.crumbLink}>← All decks</Link>
      </div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>{heading}</h1>
          <p className={styles.sub}>
            {list.length} card(s) · {enabledCount} enabled
            {list.length > 0 && enabledCount < list.length && (
              <span className={styles.subDisabled}> · {list.length - enabledCount} disabled</span>
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            onClick={() => void onBulkToggle(true)}
            disabled={busyDeck || !list.length || allEnabled}
            className={admin.btnSecondary}
            title="Aktiviert jede Karte in diesem Deck"
          >Enable all</button>
          <button
            onClick={() => void onBulkToggle(false)}
            disabled={busyDeck || !list.length || allDisabled}
            className={admin.btnSecondary}
            title="Deaktiviert jede Karte in diesem Deck"
          >Disable all</button>
          <Link to="/admin/graph" className={admin.btnSecondary}>Graph view</Link>
          <button onClick={() => setQuickAdd(true)} className={admin.btnSecondary}>Quick add</button>
          <Link
            to={`/admin/cards/new?deck=${encodeURIComponent(isOrphan ? '' : deckKey)}`}
            className={admin.btnPrimary}
          >+ New card</Link>
          <button onClick={exportDeck} className={admin.btnSecondary} disabled={!list.length}>Export deck.json</button>
        </div>
      </div>

      <div className={`${admin.panel} ${styles.tableWrap}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th
                onClick={() => toggleSort('enabled')}
                className={styles.th}
                title="Sortieren nach aktiv/inaktiv"
              >on{sortKey === 'enabled' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</th>
              {(['_id', 'title', 'category', 'weight', 'choices'] as SortKey[]).map((k) => (
                <th
                  key={k}
                  onClick={() => toggleSort(k)}
                  className={styles.th}
                >
                  {k}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th className={styles.th}>flags</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const flagsTouched =
                (c.requires?.flags_all?.length ?? 0) +
                (c.requires?.flags_none?.length ?? 0) +
                (c.requires?.flags_any?.length ?? 0) +
                c.choices.reduce((n, ch) => n + (ch.sets_flags?.length ?? 0) + (ch.clears_flags?.length ?? 0), 0);
              const isEnabled = c.enabled !== false;
              return (
                <tr key={c._id} className={`${styles.row} ${!isEnabled ? styles.rowDisabled : ''}`}>
                  <td className={styles.tdToggle}>
                    <label
                      className={styles.switch}
                      onClick={(e) => e.stopPropagation()}
                      title={isEnabled ? 'Aktiv — wird vom Spiel gezogen' : 'Deaktiviert — wird übersprungen'}
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => void setCardEnabled(c._id, !isEnabled)}
                      />
                      <span className={styles.switchTrack} />
                    </label>
                  </td>
                  <td className={styles.tdId}>
                    <Link to={`/admin/cards/${encodeURIComponent(c._id)}`} className={styles.tdIdLink}>
                      {c._id}
                    </Link>
                  </td>
                  <td className={styles.td}>{c.title}</td>
                  <td className={styles.tdMuted}>{c.category}</td>
                  <td className={styles.tdNum}>{c.weight ?? 10}{c.important ? ' ★' : ''}</td>
                  <td className={styles.tdNum}>{c.choices.length}</td>
                  <td className={styles.tdFaint}>{flagsTouched}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className={styles.empty}>No cards in this deck.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {quickAdd && (
        <QuickAddDialog
          deckName={isOrphan ? null : deckKey}
          onClose={() => setQuickAdd(false)}
        />
      )}
    </div>
  );
}
