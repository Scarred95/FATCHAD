/**
 * Human-readable per-field diff between two Card snapshots.
 *
 * Used by CardEditor's save-confirm modal so an author can see what's
 * about to land before pressing Save. Intentionally coarse: choice text,
 * stat effects, flag sets, requirements changes — not a JSON diff.
 */
import type { Card, Choice, Requirements } from '../types';
import { STAT_KEYS } from '../types';

export interface DiffEntry {
  /** Path-ish key, e.g. "title", "choices[0].text", "requires.flags_all" */
  path: string;
  /** Short human label of what kind of change happened */
  label: string;
  before?: string;
  after?: string;
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === '') return '∅';
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  if (Array.isArray(v)) return v.length === 0 ? '[]' : `[${v.join(', ')}]`;
  return JSON.stringify(v);
}

function diffStringSet(
  path: string,
  before: string[] | undefined,
  after: string[] | undefined,
  out: DiffEntry[],
): void {
  const a = new Set(before ?? []);
  const b = new Set(after ?? []);
  const added = [...b].filter((x) => !a.has(x));
  const removed = [...a].filter((x) => !b.has(x));
  if (added.length === 0 && removed.length === 0) return;
  const parts: string[] = [];
  if (added.length) parts.push(`+${added.join(', +')}`);
  if (removed.length) parts.push(`−${removed.join(', −')}`);
  out.push({ path, label: parts.join(' / ') });
}

function diffChoice(idx: number, a: Choice, b: Choice, out: DiffEntry[]): void {
  if (a.text !== b.text) {
    out.push({
      path: `choices[${idx}].text`,
      label: 'choice text',
      before: fmt(a.text),
      after: fmt(b.text),
    });
  }
  for (const k of STAT_KEYS) {
    const av = a.effects?.[k] ?? 0;
    const bv = b.effects?.[k] ?? 0;
    if (av !== bv) {
      out.push({
        path: `choices[${idx}].effects.${k}`,
        label: `${k} effect`,
        before: String(av),
        after: String(bv),
      });
    }
  }
  diffStringSet(`choices[${idx}].sets_flags`, a.sets_flags, b.sets_flags, out);
  diffStringSet(`choices[${idx}].clears_flags`, a.clears_flags, b.clears_flags, out);
  if (!eq(a.adds_to_deck, b.adds_to_deck)) {
    const aIds = (a.adds_to_deck ?? []).map((x) => x.card_id);
    const bIds = (b.adds_to_deck ?? []).map((x) => x.card_id);
    out.push({
      path: `choices[${idx}].adds_to_deck`,
      label: 'adds',
      before: fmt(aIds),
      after: fmt(bIds),
    });
  }
  if ((a.triggers_ending ?? null) !== (b.triggers_ending ?? null)) {
    out.push({
      path: `choices[${idx}].triggers_ending`,
      label: 'ending trigger',
      before: fmt(a.triggers_ending),
      after: fmt(b.triggers_ending),
    });
  }
  if (!eq(a.hints, b.hints)) {
    out.push({
      path: `choices[${idx}].hints`,
      label: 'stat hints',
      before: fmt(a.hints),
      after: fmt(b.hints),
    });
  }
}

function diffRequirements(a: Requirements, b: Requirements, out: DiffEntry[]): void {
  diffStringSet('requires.flags_all', a.flags_all, b.flags_all, out);
  diffStringSet('requires.flags_any', a.flags_any, b.flags_any, out);
  diffStringSet('requires.flags_none', a.flags_none, b.flags_none, out);
  if (!eq(a.stats, b.stats)) {
    out.push({
      path: 'requires.stats',
      label: 'stat gates',
      before: fmt(a.stats),
      after: fmt(b.stats),
    });
  }
}

export function diffCard(before: Card, after: Card): DiffEntry[] {
  const out: DiffEntry[] = [];

  const scalarFields: Array<keyof Card> = ['title', 'description', 'category', 'deck_name', 'image_url'];
  for (const f of scalarFields) {
    if ((before[f] ?? null) !== (after[f] ?? null)) {
      out.push({
        path: String(f),
        label: String(f),
        before: fmt(before[f]),
        after: fmt(after[f]),
      });
    }
  }
  if ((before.weight ?? 10) !== (after.weight ?? 10)) {
    out.push({
      path: 'weight',
      label: 'weight',
      before: String(before.weight ?? 10),
      after: String(after.weight ?? 10),
    });
  }
  if ((before.important ?? false) !== (after.important ?? false)) {
    out.push({
      path: 'important',
      label: 'important',
      before: String(before.important ?? false),
      after: String(after.important ?? false),
    });
  }
  if ((before.enabled ?? true) !== (after.enabled ?? true)) {
    out.push({
      path: 'enabled',
      label: 'enabled',
      before: String(before.enabled ?? true),
      after: String(after.enabled ?? true),
    });
  }

  diffRequirements(before.requires ?? {}, after.requires ?? {}, out);

  // Choice diffs: walk by index, capturing add/remove if length changes.
  const aChoices = before.choices ?? [];
  const bChoices = after.choices ?? [];
  const maxLen = Math.max(aChoices.length, bChoices.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= aChoices.length) {
      out.push({
        path: `choices[${i}]`,
        label: 'choice added',
        after: fmt(bChoices[i]?.text),
      });
    } else if (i >= bChoices.length) {
      out.push({
        path: `choices[${i}]`,
        label: 'choice removed',
        before: fmt(aChoices[i]?.text),
      });
    } else {
      diffChoice(i, aChoices[i], bChoices[i], out);
    }
  }

  return out;
}
