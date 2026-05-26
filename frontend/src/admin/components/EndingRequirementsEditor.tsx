/**
 * Stat + flag predicate editor for Ending docs.
 *
 * Forked from RequirementsEditor (cards) deliberately: the two predicate
 * shapes are byte-identical today, but cards' stat ranges are clamped to
 * STAT_DOMAIN while endings' thresholds are intentionally unbounded
 * (an ending may fire at moneten >= 200, for example). Keeping the editors
 * separate gives endings the freedom to diverge without dragging card
 * validation along.
 */
import type { EndingRequirements, StatKey } from '../types';
import { STAT_KEYS, STAT_LABELS } from '../types';
import { TagInput } from './TagInput';
import admin from '../admin.module.css';
import styles from './RequirementsEditor.module.css';

interface Props {
  value: EndingRequirements;
  onChange: (next: EndingRequirements) => void;
  flagSuggestions: string[];
}

export function EndingRequirementsEditor({ value, onChange, flagSuggestions }: Props) {
  const patch = (p: Partial<EndingRequirements>) => onChange({ ...value, ...p });

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
        <div className={admin.fieldLabel} style={{ marginBottom: '6px' }}>
          Stat-Schwellen <span style={{ opacity: 0.6 }}>(unbegrenzt — z.B. min: 200)</span>
        </div>
        <div className={styles.statsList}>
          {STAT_KEYS.map((k) => {
            const range = value.stats?.[k];
            return (
              <div key={k} className={styles.statRow}>
                <span className={styles.statKey}>{STAT_LABELS[k]}</span>
                <input
                  type="number"
                  step={1}
                  placeholder="min (≥)"
                  value={range?.min ?? ''}
                  onChange={(e) => setStat(k, 'min', e.target.value)}
                  className={admin.fieldInput}
                />
                <input
                  type="number"
                  step={1}
                  placeholder="max (≤)"
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
