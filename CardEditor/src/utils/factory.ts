import type { Card, Choice } from '../types';

export function emptyChoice(): Choice {
  return { text: '', effects: {}, hints: {}, sets_flags: [], clears_flags: [], adds_to_deck: [], triggers_ending: null };
}

export function emptyCard(opts: Partial<Card> = {}): Card {
  return {
    _id: opts._id ?? '',
    title: opts.title ?? '',
    description: opts.description ?? '',
    category: opts.category ?? 'social',
    deck_name: opts.deck_name ?? null,
    weight: opts.weight ?? 10,
    important: opts.important ?? false,
    requires: opts.requires ?? {},
    choices: opts.choices ?? [emptyChoice(), emptyChoice()],
    image_url: opts.image_url ?? null,
  };
}
