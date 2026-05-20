import type { Card, Choice } from '../types';

// §8.5 — preserve canonical field order on export and strip empty optionals.
const CARD_ORDER: (keyof Card)[] = [
  '_id', 'title', 'description', 'category', 'deck_name',
  'weight', 'important', 'requires', 'choices', 'image_url',
];

const CHOICE_ORDER: (keyof Choice)[] = [
  'text', 'effects', 'hints', 'sets_flags', 'clears_flags',
  'adds_to_deck', 'triggers_ending',
];

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function cleanRequirements(req: NonNullable<Card['requires']>): object | undefined {
  const out: Record<string, unknown> = {};
  if (req.flags_all && req.flags_all.length) out.flags_all = req.flags_all;
  if (req.flags_none && req.flags_none.length) out.flags_none = req.flags_none;
  if (req.flags_any && req.flags_any.length) out.flags_any = req.flags_any;
  if (req.stats) {
    const stats: Record<string, unknown> = {};
    for (const [k, range] of Object.entries(req.stats)) {
      if (!range) continue;
      const r: Record<string, number> = {};
      if (range.min !== undefined && range.min !== null) r.min = range.min;
      if (range.max !== undefined && range.max !== null) r.max = range.max;
      if (Object.keys(r).length) stats[k] = r;
    }
    if (Object.keys(stats).length) out.stats = stats;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanEffects(eff: NonNullable<Choice['effects']>): object | undefined {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(eff)) {
    if (typeof v === 'number' && v !== 0) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanHints(h: NonNullable<Choice['hints']>): object | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanChoice(c: Choice): object {
  const out: Record<string, unknown> = {};
  for (const key of CHOICE_ORDER) {
    let v: unknown = c[key];
    if (key === 'effects' && v) v = cleanEffects(v as Choice['effects'] & object);
    if (key === 'hints' && v) v = cleanHints(v as Choice['hints'] & object);
    if (key === 'adds_to_deck' && Array.isArray(v)) {
      v = (v as NonNullable<Choice['adds_to_deck']>).map((d) => {
        const row: Record<string, unknown> = { card_id: d.card_id };
        if (d.position && d.position !== 'shuffle') row.position = d.position;
        if (d.in_turns !== undefined && d.in_turns !== null) row.in_turns = d.in_turns;
        return row;
      });
    }
    if (key === 'triggers_ending' && v === null) v = undefined;
    if (isEmpty(v)) continue;
    out[key] = v;
  }
  return out;
}

export function cleanCard(card: Card): object {
  const out: Record<string, unknown> = {};
  for (const key of CARD_ORDER) {
    let v: unknown = (card as unknown as Record<string, unknown>)[key];
    if (key === 'requires' && v) v = cleanRequirements(v as NonNullable<Card['requires']>);
    if (key === 'choices' && Array.isArray(v)) v = v.map((c) => cleanChoice(c as Choice));
    // Always emit required fields even if "empty" strings somehow (shouldn't happen at export time)
    const required = ['_id', 'title', 'description', 'category', 'choices'].includes(key as string);
    if (!required && isEmpty(v)) continue;
    out[key] = v;
  }
  return out;
}

export function serializeDeck(cards: Card[]): string {
  return JSON.stringify(cards.map(cleanCard), null, 2);
}
