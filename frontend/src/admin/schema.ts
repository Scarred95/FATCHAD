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

// --- Endings -----------------------------------------------------------------
// Tolerant: only _id/title/description are mandatory; the rest default
// server-side. Stat keys are left unconstrained (unlike card requirements)
// since ending thresholds are open-ended. Mirrors the seed file shape so
// exports round-trip into backend/events/*_endings.json.
const endingRequires = z.object({
  flags_all: z.array(z.string()).optional(),
  flags_none: z.array(z.string()).optional(),
  flags_any: z.array(z.string()).optional(),
  stats: z.record(z.object({
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
  })).optional(),
}).optional();

export const endingSchema = z.object({
  _id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.number().optional(),
  default: z.boolean().optional(),
  enabled: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
  requires: endingRequires,
});

export const endingArraySchema = z.array(endingSchema);
