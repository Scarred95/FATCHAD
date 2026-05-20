import type { Requirements, StatKey } from '../types';
import { STAT_DOMAIN, STAT_KEYS, STAT_LABELS } from '../types';
import { TagInput } from './TagInput';
import admin from '../admin.module.css';
import styles from './RequirementsEditor.module.css';

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
    <div className={styles.wrap}>
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
        <div className={admin.fieldLabel} style={{ marginBottom: '6px' }}>Stat ranges</div>
        <div className={styles.statsList}>
          {STAT_KEYS.map((k) => {
            const dom = STAT_DOMAIN[k];
            const range = value.stats?.[k];
            return (
              <div key={k} className={styles.statRow}>
                <span className={styles.statKey}>{STAT_LABELS[k]}</span>
                <input
                  type="number"
                  step={1}
                  placeholder={`min (${dom.min})`}
                  value={range?.min ?? ''}
                  onChange={(e) => setStat(k, 'min', e.target.value)}
                  className={admin.fieldInput}
                />
                <input
                  type="number"
                  step={1}
                  placeholder={`max (${dom.max})`}
                  value={range?.max ?? ''}
                  onChange={(e) => setStat(k, 'max', e.target.value)}
                  className={admin.fieldInput}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
