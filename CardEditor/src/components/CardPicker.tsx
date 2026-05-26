import { useMemo, useState } from 'react';
import type { Card } from '../types';

interface Props {
  value: string;
  onChange: (id: string) => void;
  cards: Card[];
  placeholder?: string;
}

export function CardPicker({ value, onChange, cards, placeholder = 'Card id…' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards.slice(0, 12);
    return cards
      .filter((c) =>
        c._id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.deck_name ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, cards]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className="field-input font-mono text-xs"
      />
      {open && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl max-h-64 overflow-auto">
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-zinc-500">No matches</div>
          )}
          {filtered.map((c) => (
            <button
              key={c._id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c._id);
                setQuery(c._id);
                setOpen(false);
              }}
              className="block w-full text-left px-2 py-1.5 text-xs hover:bg-zinc-800"
            >
              <div className="font-mono text-zinc-300">{c._id}</div>
              <div className="text-zinc-500">{c.title}{c.deck_name ? ` — ${c.deck_name}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
