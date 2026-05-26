import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Card, Choice, DeckAddition, StatHint, StatKey } from '../types';
import { KNOWN_ENDINGS, STAT_DOMAIN, STAT_KEYS, STAT_LABELS } from '../types';
import { TagInput } from './TagInput';
import { CardPicker } from './CardPicker';

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
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-zinc-800">
        {value.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`px-3 py-1.5 text-sm border-b-2 -mb-px ${
              active === i ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Choice {i + 1}
            {value.length > 2 && active === i && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); removeChoice(i); }}
                className="ml-2 text-zinc-500 hover:text-red-300"
              >×</span>
            )}
          </button>
        ))}
        {value.length < 3 && (
          <button
            type="button"
            onClick={addChoice}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
          >+ choice</button>
        )}
      </div>

      {ch && (
        <div className="space-y-4">
          <div>
            <div className="field-label">Text</div>
            <input
              value={ch.text}
              onChange={(e) => patchChoice(active, { text: e.target.value })}
              className="field-input"
              placeholder="Choice button label"
              maxLength={120}
            />
            <div className="text-[10px] text-zinc-500 mt-1">{ch.text.length}/60 recommended</div>
          </div>

          <div>
            <div className="field-label mb-1.5">Effects & hints</div>
            <div className="space-y-1.5">
              {STAT_KEYS.map((k) => {
                const dom = STAT_DOMAIN[k];
                const eff = ch.effects?.[k] ?? '';
                const hint = ch.hints?.[k] ?? '';
                return (
                  <div key={k} className="grid grid-cols-[5rem_1fr_8rem] items-center gap-2 text-xs">
                    <span className="text-zinc-400">{STAT_LABELS[k]}</span>
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
                      className="field-input"
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
                      className="field-input"
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
            <div className="field-label">triggers_ending</div>
            <input
              list="known-endings"
              value={ch.triggers_ending ?? ''}
              onChange={(e) => patchChoice(active, { triggers_ending: e.target.value || null })}
              className="field-input"
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
      <div className="flex items-center justify-between mb-1.5">
        <div className="field-label">adds_to_deck</div>
        <button type="button" onClick={add} className="text-xs text-zinc-400 hover:text-zinc-100">+ add</button>
      </div>
      {value.length === 0 && <div className="text-xs text-zinc-600">No additions.</div>}
      <div className="space-y-1.5">
        {value.map((d, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_5rem_2rem_auto] gap-1.5 items-start">
            <CardPicker
              value={d.card_id}
              onChange={(id) => patch(i, { card_id: id })}
              cards={allCards}
              placeholder="card_id"
            />
            <select
              value={d.position ?? 'shuffle'}
              onChange={(e) => patch(i, { position: e.target.value as DeckAddition['position'] })}
              className="field-input"
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
              className="field-input"
            />
            <Link
              to={`/cards/${encodeURIComponent(d.card_id)}`}
              title="Open target"
              className="self-center text-zinc-400 hover:text-zinc-100 text-sm px-1"
            >→</Link>
            <button
              type="button"
              onClick={() => remove(i)}
              className="self-center text-zinc-500 hover:text-red-300 text-sm px-1"
              title="Remove"
            >×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
