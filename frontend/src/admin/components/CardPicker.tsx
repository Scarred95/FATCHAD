import { useMemo, useState } from 'react';
import type { Card } from '../types';
import admin from '../admin.module.css';
import styles from './CardPicker.module.css';

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
    <div className={styles.wrap}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className={admin.fieldInput}
        style={{ fontFamily: 'Menlo, Monaco, monospace', fontSize: 'var(--fs-body-xs)' }}
      />
      {open && (
        <div className={styles.dropdown}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No matches</div>
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
              className={styles.option}
            >
              <div className={styles.optionId}>{c._id}</div>
              <div className={styles.optionLabel}>{c.title}{c.deck_name ? ` — ${c.deck_name}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
