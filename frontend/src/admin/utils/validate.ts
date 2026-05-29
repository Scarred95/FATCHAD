import type { Card } from '../types';
import { ALL_CATEGORIES, STAT_DOMAIN, STAT_KEYS } from '../types';

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  path?: string;
}

/**
 * Validate a card against the rest of the dataset.
 *
 * `knownEndingIds` is the canonical set of ending ids (from
 * `useAdminEndingStore`). Pass an empty set if the endings store hasn't
 * loaded yet — ending checks will be skipped silently rather than spamming
 * false warnings.
 */
export function validateCard(card: Card, all: Card[], knownEndingIds?: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (message: string, path?: string) =>
    issues.push({ level: 'error', message, path });
  const warn = (message: string, path?: string) =>
    issues.push({ level: 'warning', message, path });

  // §8.6 errors
  if (!/^evt_[a-z0-9_]+$/.test(card._id)) {
    err('_id must match ^evt_[a-z0-9_]+$', '_id');
  }
  const dupes = all.filter((c) => c._id === card._id);
  if (dupes.length > 1) err('_id is not unique in dataset', '_id');

  if (!card.title?.trim()) err('title is required', 'title');
  if (!card.description?.trim()) err('description is required', 'description');
  if (!card.category?.trim()) err('category is required', 'category');

  if (!Array.isArray(card.choices) || card.choices.length < 2 || card.choices.length > 3) {
    err('choices must have length 2 or 3', 'choices');
  }

  card.choices?.forEach((ch, ci) => {
    if (!ch.text?.trim()) err(`choice ${ci + 1}: text is required`, `choices.${ci}.text`);
    if (ch.text && ch.text.length > 60) {
      warn(`choice ${ci + 1}: text > 60 chars will wrap awkwardly`, `choices.${ci}.text`);
    }
    ch.adds_to_deck?.forEach((d, di) => {
      if (!all.some((c) => c._id === d.card_id)) {
        err(`choice ${ci + 1}, addition ${di + 1}: card_id "${d.card_id}" not found`,
          `choices.${ci}.adds_to_deck.${di}.card_id`);
      }
      if (d.in_turns !== null && d.in_turns !== undefined && d.in_turns < 0) {
        err(`choice ${ci + 1}, addition ${di + 1}: in_turns must be ≥ 0`,
          `choices.${ci}.adds_to_deck.${di}.in_turns`);
      }
    });
    if (ch.effects) {
      for (const k of STAT_KEYS) {
        const v = ch.effects[k];
        if (v === undefined || v === 0) continue;
        const dom = STAT_DOMAIN[k];
        if (Math.abs(v) > (dom.max - dom.min)) {
          err(`choice ${ci + 1}: effect on ${k} (${v}) is outside any reachable delta`,
            `choices.${ci}.effects.${k}`);
        }
        if (Math.abs(v) > 50) {
          warn(`choice ${ci + 1}: effect on ${k} (${v}) exceeds recommended ±50`,
            `choices.${ci}.effects.${k}`);
        }
      }
    }
    if (knownEndingIds && knownEndingIds.size > 0) {
      if (ch.triggers_ending && !knownEndingIds.has(ch.triggers_ending)) {
        warn(`choice ${ci + 1}: ending "${ch.triggers_ending}" ist nicht im Endings-Katalog`,
          `choices.${ci}.triggers_ending`);
      }
      ch.unlocks_endings?.forEach((eid, ei) => {
        if (!knownEndingIds.has(eid)) {
          warn(`choice ${ci + 1}: unlocks_endings[${ei}] "${eid}" ist nicht im Endings-Katalog`,
            `choices.${ci}.unlocks_endings.${ei}`);
        }
      });
      ch.removes_endings?.forEach((eid, ei) => {
        if (!knownEndingIds.has(eid)) {
          warn(`choice ${ci + 1}: removes_endings[${ei}] "${eid}" ist nicht im Endings-Katalog`,
            `choices.${ci}.removes_endings.${ei}`);
        }
      });
    }
  });

  if ((card.weight ?? 10) < 0) err('weight must be ≥ 0', 'weight');

  // requires.stats domain
  if (card.requires?.stats) {
    for (const [k, range] of Object.entries(card.requires.stats)) {
      const dom = STAT_DOMAIN[k as keyof typeof STAT_DOMAIN];
      if (!dom) continue;
      const min = range?.min;
      const max = range?.max;
      if (min !== undefined && min !== null && (min < dom.min || min > dom.max)) {
        err(`requires.stats.${k}.min outside domain [${dom.min}..${dom.max}]`,
          `requires.stats.${k}.min`);
      }
      if (max !== undefined && max !== null && (max < dom.min || max > dom.max)) {
        err(`requires.stats.${k}.max outside domain [${dom.min}..${dom.max}]`,
          `requires.stats.${k}.max`);
      }
      if (min !== undefined && min !== null && max !== undefined && max !== null && min > max) {
        err(`requires.stats.${k}: min > max`, `requires.stats.${k}`);
      }
    }
  }

  // §8.6 warnings
  if (card.category && !ALL_CATEGORIES.includes(card.category)) {
    warn(`category "${card.category}" is not in the canonical list`, 'category');
  }
  if ((card.weight ?? 10) === 0 && !card.important) {
    warn('weight is 0 but important is not set — card may be unreachable', 'weight');
  }
  if (card._id && card._id.length > 60) {
    warn('_id is very long (>60 chars)', '_id');
  }

  // hint-mode mixed warning
  const choicesWithHints = card.choices?.filter((c) => c.hints && Object.values(c.hints).some((v) => v));
  const choicesWithEffectsNoHints = card.choices?.filter((c) => {
    const hasEff = c.effects && Object.values(c.effects).some((v) => typeof v === 'number' && v !== 0);
    const hasHints = c.hints && Object.values(c.hints).some((v) => v);
    return hasEff && !hasHints;
  });
  if (choicesWithHints?.length && choicesWithEffectsNoHints?.length) {
    warn('Some choices have hints, others rely on auto-derive — easy to mistake', 'choices');
  }

  return issues;
}
