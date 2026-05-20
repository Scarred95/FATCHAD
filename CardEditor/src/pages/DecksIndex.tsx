import { Link } from 'react-router-dom';
import { decksOf, useStore } from '../store';
import { ImportExportBar } from '../components/ImportExportBar';
import type { Card } from '../types';

function deckHas3Choice(cards: Card[]) {
  return cards.some((c) => c.choices.length === 3);
}
function deckHasQuestline(cards: Card[]) {
  return cards.some((c) =>
    c.choices.some((ch) => (ch.adds_to_deck?.length ?? 0) > 0)
    || c.important
    || (c.weight ?? 10) === 0,
  );
}
function categoryBreakdown(cards: Card[]) {
  const map = new Map<string, number>();
  for (const c of cards) map.set(c.category, (map.get(c.category) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function DecksIndex() {
  const cards = useStore((s) => s.cards);
  const decks = decksOf(cards);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">FATCHAD — Card Editor</h1>
          <p className="text-sm text-zinc-400">
            {cards.length} card(s) · {[...decks.keys()].filter(Boolean).length} deck(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/graph" className="btn-secondary">Graph view</Link>
          <ImportExportBar />
        </div>
      </header>

      {cards.length === 0 && (
        <div className="panel p-10 text-center text-zinc-400 space-y-3">
          <div className="text-lg">No cards loaded.</div>
          <div className="text-sm">Use <b>Import JSON…</b> to drop in an existing deck, or create one from scratch.</div>
          <Link to="/cards/new" className="btn-primary inline-flex">+ New card</Link>
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...decks.entries()]
          .sort(([a], [b]) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return a.localeCompare(b);
          })
          .map(([name, list]) => {
            const isOrphan = name === '';
            const key = isOrphan ? '__orphans__' : name;
            const breakdown = categoryBreakdown(list);
            return (
              <Link
                key={key}
                to={`/decks/${encodeURIComponent(key)}`}
                className="panel p-4 hover:border-zinc-700 transition block"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{isOrphan ? 'Orphans (no deck_name)' : name}</div>
                  <div className="flex gap-1">
                    {deckHasQuestline(list) && <span className="chip">questline</span>}
                    {deckHas3Choice(list) && <span className="chip">3-choice</span>}
                  </div>
                </div>
                <div className="mt-2 text-sm text-zinc-400">{list.length} card(s)</div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {breakdown.slice(0, 6).map(([cat, n]) => (
                    <span key={cat} className="chip">{cat} · {n}</span>
                  ))}
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
