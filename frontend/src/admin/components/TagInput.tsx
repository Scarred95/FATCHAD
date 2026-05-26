import { useEffect, useId, useRef, useState } from 'react';
import admin from '../admin.module.css';
import styles from './TagInput.module.css';

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

  const onBlurCapture = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    if (draft.trim()) add(draft);
    setOpen(false);
  };

  return (
    <div className={styles.wrap} ref={wrapRef} onBlur={onBlurCapture}>
      {label && <div className={admin.fieldLabel}>{label}</div>}
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
        className={styles.box}
      >
        {value.map((v) => (
          <span key={v} className={admin.chip}>
            <span>{v}</span>
            <button
              type="button"
              onClick={() => remove(v)}
              onMouseDown={(e) => e.preventDefault()}
              className={styles.chipRemove}
              aria-label={`Remove ${v}`}
            >×</button>
          </span>
        ))}
        <div className={styles.inputWrap}>
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
                if (draft.trim()) add(draft);
                setOpen(false);
              } else if (e.key === 'Escape') {
                if (open) { e.preventDefault(); setOpen(false); }
              } else if (e.key === 'Backspace' && !draft && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length ? '' : (placeholder ?? 'Add a flag, then Enter…')}
            className={styles.input}
          />
          {open && filtered.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              className={styles.list}
            >
              {filtered.map((s, i) => (
                <li
                  key={s}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseDown={(e) => { e.preventDefault(); add(s); inputRef.current?.focus(); }}
                  className={i === activeIdx ? styles.optionActive : styles.option}
                >{s}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
