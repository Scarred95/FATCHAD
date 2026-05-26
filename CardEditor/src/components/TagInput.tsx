import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  label?: string;
}

export function TagInput({ value, onChange, suggestions = [], placeholder, label }: Props) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const filtered = (open ? suggestions : []).filter(
    (s) => s.toLowerCase().includes(draft.toLowerCase()) && !value.includes(s),
  ).slice(0, 8);

  useEffect(() => { setActiveIdx(0); }, [draft, open]);

  const add = (s: string) => {
    const v = s.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft('');
  };

  const remove = (s: string) => onChange(value.filter((x) => x !== s));

  // Close the dropdown when focus leaves the entire widget (and commit the draft).
  const onBlurCapture = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    if (draft.trim()) add(draft);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5" ref={wrapRef} onBlur={onBlurCapture}>
      {label && <div className="field-label">{label}</div>}
      <div
        onMouseDown={(e) => {
          // Clicking padding/chips area focuses the input without stealing focus
          // away from the input itself.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
        className="relative bg-zinc-900 border border-zinc-800 rounded-md p-1.5 flex flex-wrap gap-1.5 cursor-text focus-within:border-zinc-600"
      >
        {value.map((v) => (
          <span key={v} className="chip">
            <span>{v}</span>
            <button
              type="button"
              onClick={() => remove(v)}
              onMouseDown={(e) => e.preventDefault()}
              className="text-zinc-400 hover:text-white -mr-1 px-1"
              aria-label={`Remove ${v}`}
            >×</button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[140px]">
          <input
            ref={inputRef}
            value={draft}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && filtered.length > 0}
            aria-controls={listId}
            aria-activedescendant={open && filtered[activeIdx] ? `${listId}-${activeIdx}` : undefined}
            onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && filtered.length) {
                e.preventDefault();
                setActiveIdx((i) => (i + 1) % filtered.length);
              } else if (e.key === 'ArrowUp' && filtered.length) {
                e.preventDefault();
                setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
              } else if (e.key === 'Enter') {
                if (open && filtered[activeIdx]) {
                  e.preventDefault();
                  add(filtered[activeIdx]);
                } else if (draft.trim()) {
                  e.preventDefault();
                  add(draft);
                }
              } else if (e.key === ',') {
                if (draft.trim()) {
                  e.preventDefault();
                  add(draft);
                }
              } else if (e.key === 'Tab') {
                // Commit but let Tab move focus.
                if (draft.trim()) add(draft);
                setOpen(false);
              } else if (e.key === 'Escape') {
                if (open) { e.preventDefault(); setOpen(false); }
              } else if (e.key === 'Backspace' && !draft && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length ? '' : (placeholder ?? 'Add a flag, then Enter…')}
            className="w-full bg-transparent text-sm outline-none px-1 py-0.5 placeholder:text-zinc-600"
          />
          {open && filtered.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl max-h-48 overflow-auto"
            >
              {filtered.map((s, i) => (
                <li
                  key={s}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseDown={(e) => { e.preventDefault(); add(s); inputRef.current?.focus(); }}
                  className={`px-2 py-1 text-sm cursor-pointer ${
                    i === activeIdx ? 'bg-zinc-800 text-white' : 'text-zinc-200'
                  }`}
                >{s}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
