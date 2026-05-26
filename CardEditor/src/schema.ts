import { z } from 'zod';
import { STAT_KEYS } from './types';

const statHint = z.enum(['up', 'down', 'unknown', 'hidden']);

const statRange = z.object({
  min: z.number().int().optional().nullable(),
  max: z.number().int().optional().nullable(),
}).partial();

const requirements = z.object({
  flags_all: z.array(z.string()).optional(),
  flags_none: z.array(z.string()).optional(),
  flags_any: z.array(z.string()).optional(),
  stats: z.record(z.enum(STAT_KEYS as [string, ...string[]]), statRange).optional(),
}).partial();

const effects = z.object({
  moneten: z.number().int().optional(),
  aura: z.number().int().optional(),
  respekt: z.number().int().optional(),
  rizz: z.number().int().optional(),
  chaos: z.number().int().optional(),
}).partial();

const choiceHints = z.object({
  moneten: statHint.nullable().optional(),
  aura: statHint.nullable().optional(),
  respekt: statHint.nullable().optional(),
  rizz: statHint.nullable().optional(),
  chaos: statHint.nullable().optional(),
}).partial();

const deckAddition = z.object({
  card_id: z.string().min(1),
  position: z.enum(['top', 'bottom', 'shuffle']).optional(),
  in_turns: z.number().int().min(0).optional().nullable(),
});

const choice = z.object({
  text: z.string().min(1),
  effects: effects.optional(),
  hints: choiceHints.optional(),
  sets_flags: z.array(z.string()).optional(),
  clears_flags: z.array(z.string()).optional(),
  adds_to_deck: z.array(deckAddition).optional(),
  triggers_ending: z.string().nullable().optional(),
});

export const cardSchema = z.object({
  _id: z.string().regex(/^evt_[a-z0-9_]+$/, '_id must match ^evt_[a-z0-9_]+$'),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  deck_name: z.string().nullable().optional(),
  weight: z.number().int().min(0).optional(),
  important: z.boolean().optional(),
  requires: requirements.optional(),
  choices: z.array(choice).min(2).max(3),
  image_url: z.string().nullable().optional(),
});

export const cardArraySchema = z.array(cardSchema);
