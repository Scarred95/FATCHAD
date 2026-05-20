import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Card, Choice, DeckAddition, StatHint } from '../types';
import { KNOWN_ENDINGS, STAT_DOMAIN, STAT_KEYS, STAT_LABELS } from '../types';
import { TagInput } from './TagInput';
import { CardPicker } from './CardPicker';
import admin from '../admin.module.css';
import styles from './ChoicesEditor.module.css';

interface Props {
  value: Choice[];
  onChange: (next: Choice[]) => void;
  allCards: Card[];
  flagSuggestions: string[];
}

const HINT_OPTIONS: (StatHint | '')[] = ['', 'up', 'down', 'unknown', 'hidden'];

export function ChoicesEditor({ value, onChange, allCards, flagSuggestions }: Props) {
  const [active, setActive] = useState(0);

  const patchChoice = (i: number, patch: Partial<Choice>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const addChoice = () => {
    if (value.length >= 3) return;
    onChange([...value, { text: '', effects: {}, hints: {}, sets_flags: [], clears_flags: [], adds_to_deck: [], triggers_ending: null }]);
    setActive(value.length);
  };
  const removeChoice = (i: number) => {
    if (value.length <= 2) return;
    const next = value.filter((_, idx) => idx !== i);
    onChange(next);
    setActive(Math.min(active, next.length - 1));
  };

  const ch = value[active];

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        {value.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={active === i ? styles.tabActive : styles.tab}
          >
            Choice {i + 1}
            {value.length > 2 && active === i && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); removeChoice(i); }}
                className={styles.tabRemove}
              >×</span>
            )}
          </button>
        ))}
        {value.length < 3 && (
          <button
            type="button"
            onClick={addChoice}
            className={styles.tabAdd}
          >+ choice</button>
        )}
      </div>

      {ch && (
        <div className={styles.body}>
          <div>
            <div className={admin.fieldLabel}>Text</div>
            <input
              value={ch.text}
              onChange={(e) => patchChoice(active, { text: e.target.value })}
              className={admin.fieldInput}
              placeholder="Choice button label"
              maxLength={120}
            />
            <div className={styles.charCount}>{ch.text.length}/60 recommended</div>
          </div>

          <div>
            <div className={admin.fieldLabel} style={{ marginBottom: '6px' }}>Effects & hints</div>
            <div className={styles.effectsList}>
              {STAT_KEYS.map((k) => {
                const dom = STAT_DOMAIN[k];
                const eff = ch.effects?.[k] ?? '';
                const hint = ch.hints?.[k] ?? '';
                return (
                  <div key={k} className={styles.effectRow}>
                    <span className={styles.effectKey}>{STAT_LABELS[k]}</span>
                    <input
                      type="number"
                      step={1}
                      min={-50}
                      max={50}
                      value={eff}
                      placeholder={`Δ in [${dom.min}..${dom.max}]`}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === '' ? undefined : Math.max(-50, Math.min(50, Number(raw)));
                        const next = { ...(ch.effects ?? {}) };
                        if (v === undefined) delete (next as Record<string, unknown>)[k];
                        else (next as Record<string, number>)[k] = v;
                        patchChoice(active, { effects: next });
                      }}
                      className={admin.fieldInput}
                    />
                    <select
                      value={hint ?? ''}
                      onChange={(e) => {
                        const v = e.target.value as StatHint | '';
                        const next = { ...(ch.hints ?? {}) };
                        if (v === '') delete (next as Record<string, unknown>)[k];
                        else (next as Record<string, StatHint>)[k] = v;
                        patchChoice(active, { hints: next });
                      }}
                      className={admin.fieldInput}
                    >
                      {HINT_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o === '' ? 'auto' : o}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <TagInput
            label="sets_flags"
            value={ch.sets_flags ?? []}
            onChange={(v) => patchChoice(active, { sets_flags: v })}
            suggestions={flagSuggestions}
          />
          <TagInput
            label="clears_flags"
            value={ch.clears_flags ?? []}
            onChange={(v) => patchChoice(active, { clears_flags: v })}
            suggestions={flagSuggestions}
          />

          <AddsToDeckEditor
            value={ch.adds_to_deck ?? []}
            onChange={(v) => patchChoice(active, { adds_to_deck: v })}
            allCards={allCards}
          />

          <div>
            <div className={admin.fieldLabel}>triggers_ending</div>
            <input
              list="known-endings"
              value={ch.triggers_ending ?? ''}
              onChange={(e) => patchChoice(active, { triggers_ending: e.target.value || null })}
              className={admin.fieldInput}
              placeholder="Ending ID (optional)"
            />
            <datalist id="known-endings">
              {KNOWN_ENDINGS.map((e) => <option key={e} value={e} />)}
            </datalist>
          </div>
        </div>
      )}
    </div>
  );
}

function AddsToDeckEditor({
  value, onChange, allCards,
}: {
  value: DeckAddition[];
  onChange: (next: DeckAddition[]) => void;
  allCards: Card[];
}) {
  const patch = (i: number, p: Partial<DeckAddition>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...p };
    onChange(next);
  };
  const add = () => onChange([...value, { card_id: '', position: 'shuffle', in_turns: null }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className={styles.addsHead}>
        <div className={admin.fieldLabel}>adds_to_deck</div>
        <button type="button" onClick={add} className={styles.addsAdd}>+ add</button>
      </div>
      {value.length === 0 && <div className={styles.addsEmpty}>No additions.</div>}
      <div className={styles.addsList}>
        {value.map((d, i) => (
          <div key={i} className={styles.addRow}>
            <CardPicker
              value={d.card_id}
              onChange={(id) => patch(i, { card_id: id })}
              cards={allCards}
              placeholder="card_id"
            />
            <select
              value={d.position ?? 'shuffle'}
              onChange={(e) => patch(i, { position: e.target.value as DeckAddition['position'] })}
              className={admin.fieldInput}
            >
              <option value="shuffle">shuffle</option>
              <option value="top">top</option>
              <option value="bottom">bottom</option>
            </select>
            <input
              type="number"
              min={0}
              step={1}
              value={d.in_turns ?? ''}
              placeholder="in_turns"
              onChange={(e) => patch(i, { in_turns: e.target.value === '' ? null : Number(e.target.value) })}
              className={admin.fieldInput}
            />
            <Link
              to={`/admin/cards/${encodeURIComponent(d.card_id)}`}
              title="Open target"
              className={styles.addLink}
            >→</Link>
            <button
              type="button"
              onClick={() => remove(i)}
              className={styles.addRemove}
              title="Remove"
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
