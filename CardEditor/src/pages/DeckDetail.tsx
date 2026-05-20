import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { serializeDeck } from '../utils/jsonOrder';
import { slugify } from '../utils/slug';
import { download } from '../components/ImportExportBar';
import { QuickAddDialog } from '../components/QuickAddDialog';

type SortKey = '_id' | 'title' | 'category' | 'weight' | 'choices';

export function DeckDetail() {
  const { name } = useParams<{ name: string }>();
  const deckKey = name ?? '';
  const isOrphan = deckKey === '__orphans__';
  const cards = useStore((s) => s.cards);
  const list = useMemo(() => {
    return cards.filter((c) => isOrphan ? !c.deck_name : c.deck_name === deckKey);
  }, [cards, deckKey, isOrphan]);

  const [sortKey, setSortKey] = useState<SortKey>('_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [quickAdd, setQuickAdd] = useState(false);

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
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [list, sortKey, sortDir]);

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100">← All decks</Link>
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-zinc-400">{list.length} card(s)</p>
        </div>
        <div className="flex gap-2">
          <Link to="/graph" className="btn-secondary">Graph view</Link>
          <button onClick={() => setQuickAdd(true)} className="btn-secondary">Quick add</button>
          <Link
            to={`/cards/new?deck=${encodeURIComponent(isOrphan ? '' : deckKey)}`}
            className="btn-primary"
          >+ New card</Link>
          <button onClick={exportDeck} className="btn-secondary" disabled={!list.length}>Export deck.json</button>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              {(['_id', 'title', 'category', 'weight', 'choices'] as SortKey[]).map((k) => (
                <th
                  key={k}
                  onClick={() => toggleSort(k)}
                  className="text-left px-3 py-2 cursor-pointer hover:text-zinc-100 select-none"
                >
                  {k}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th className="px-3 py-2 text-left">flags</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const flagsTouched =
                (c.requires?.flags_all?.length ?? 0) +
                (c.requires?.flags_none?.length ?? 0) +
                (c.requires?.flags_any?.length ?? 0) +
                c.choices.reduce((n, ch) => n + (ch.sets_flags?.length ?? 0) + (ch.clears_flags?.length ?? 0), 0);
              return (
                <tr key={c._id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link to={`/cards/${encodeURIComponent(c._id)}`} className="text-zinc-200 hover:underline">
                      {c._id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{c.title}</td>
                  <td className="px-3 py-2 text-zinc-400">{c.category}</td>
                  <td className="px-3 py-2 tabular-nums">{c.weight ?? 10}{c.important ? ' ★' : ''}</td>
                  <td className="px-3 py-2 tabular-nums">{c.choices.length}</td>
                  <td className="px-3 py-2 text-zinc-500">{flagsTouched}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-500">No cards in this deck.</td></tr>
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
