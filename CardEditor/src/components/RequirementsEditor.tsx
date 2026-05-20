import type { Requirements, StatKey } from '../types';
import { STAT_DOMAIN, STAT_KEYS, STAT_LABELS } from '../types';
import { TagInput } from './TagInput';

interface Props {
  value: Requirements;
  onChange: (next: Requirements) => void;
  flagSuggestions: string[];
}

export function RequirementsEditor({ value, onChange, flagSuggestions }: Props) {
  const patch = (p: Partial<Requirements>) => onChange({ ...value, ...p });

  const setStat = (k: StatKey, side: 'min' | 'max', raw: string) => {
    const num = raw === '' ? null : Number(raw);
    const stats = { ...(value.stats ?? {}) };
    const existing = stats[k] ?? {};
    stats[k] = { ...existing, [side]: num === null ? null : num };
    onChange({ ...value, stats });
  };

  return (
    <div className="space-y-3">
      <TagInput
        label="flags_all (must all be set)"
        value={value.flags_all ?? []}
        onChange={(v) => patch({ flags_all: v })}
        suggestions={flagSuggestions}
      />
      <TagInput
        label="flags_none (must be unset)"
        value={value.flags_none ?? []}
        onChange={(v) => patch({ flags_none: v })}
        suggestions={flagSuggestions}
      />
      <TagInput
        label="flags_any (at least one)"
        value={value.flags_any ?? []}
        onChange={(v) => patch({ flags_any: v })}
        suggestions={flagSuggestions}
      />
      <div>
        <div className="field-label mb-1.5">Stat ranges</div>
        <div className="space-y-1.5">
          {STAT_KEYS.map((k) => {
            const dom = STAT_DOMAIN[k];
            const range = value.stats?.[k];
            return (
              <div key={k} className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2 text-xs">
                <span className="text-zinc-400">{STAT_LABELS[k]}</span>
                <input
                  type="number"
                  step={1}
                  placeholder={`min (${dom.min})`}
                  value={range?.min ?? ''}
                  onChange={(e) => setStat(k, 'min', e.target.value)}
                  className="field-input"
                />
                <input
                  type="number"
                  step={1}
                  placeholder={`max (${dom.max})`}
                  value={range?.max ?? ''}
                  onChange={(e) => setStat(k, 'max', e.target.value)}
                  className="field-input"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
