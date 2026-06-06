// Mirrors §2 of CARD_EDITOR_SPEC.md and DATA_SHAPES.md.
// Field names match the backend Pydantic shape exactly — do not rename.
//
// Stat primitives re-exported from the gameplay types — single source of
// truth. `StatKey` is the admin alias for `StatName`; `STAT_KEYS` reuses the
// canonical `STAT_NAMES` order so the five stats are listed exactly once.
import { STAT_NAMES } from '../api/types';
import type { StatName, StatHint } from '../api/types';

export type StatKey = StatName;
export type { StatHint };
export const STAT_KEYS: StatKey[] = [...STAT_NAMES];

export const STAT_COLORS: Record<StatKey, string> = {
  moneten: '#facc15',
  aura: '#a855f7',
  respekt: '#ef4444',
  rizz: '#38bdf8',
  chaos: '#f97316',
};

export const STAT_LABELS: Record<StatKey, string> = {
  moneten: 'Moneten',
  aura: 'Aura',
  respekt: 'Respekt',
  rizz: 'Rizz',
  chaos: 'Chaos',
};

export interface StatRange {
  min?: number | null;
  max?: number | null;
}

export interface Requirements {
  flags_all?: string[];
  flags_none?: string[];
  flags_any?: string[];
  stats?: Partial<Record<StatKey, StatRange>>;
}

export interface Effects {
  moneten?: number;
  aura?: number;
  respekt?: number;
  rizz?: number;
  chaos?: number;
}

export type ChoiceHints = Partial<Record<StatKey, StatHint | null>>;

export interface DeckAddition {
  card_id: string;
  position?: 'top' | 'bottom' | 'shuffle';
  in_turns?: number | null;
}

export interface Choice {
  text: string;
  effects?: Effects;
  hints?: ChoiceHints;
  sets_flags?: string[];
  clears_flags?: string[];
  adds_to_deck?: DeckAddition[];
  triggers_ending?: string | null;
  /** Ending ids added to the run's active set after this choice. */
  unlocks_endings?: string[];
  /** Ending ids removed from the run's active set after this choice. */
  removes_endings?: string[];
}

export interface Card {
  _id: string;
  title: string;
  description: string;
  category: string;
  deck_name?: string | null;
  weight?: number;
  important?: boolean;
  /** Soft-toggle published state. Disabled cards stay in the DB but
   *  are skipped by the gameplay deck loop. Defaults true server-side. */
  enabled?: boolean;
  requires?: Requirements;
  choices: Choice[];
  image_url?: string | null;
}

// §4 canonical category lists
export const REFILL_CATEGORIES = ['politik', 'social', 'economy', 'chaos'];
export const NON_REFILL_CATEGORIES = ['tutorial', 'ending'];
export const PROPOSED_CATEGORIES = [
  'justiz', 'militaer', 'international', 'geheimdienst',
  'kriminalitaet', 'unterwelt', 'finanzen', 'immobilien',
  'medien', 'kultur', 'sport', 'religion',
  'technologie', 'wissenschaft', 'energie',
  'beziehungen', 'familie', 'gesundheit', 'bildung',
  'umwelt', 'bevoelkerung', 'natur',
];
export const ALL_CATEGORIES = [
  ...REFILL_CATEGORIES,
  ...NON_REFILL_CATEGORIES,
  ...PROPOSED_CATEGORIES,
];

/**
 * Endings are server-driven — loaded from /admin/endings into
 * `useAdminEndingStore`. Validators and autocomplete read the live id set
 * from that store instead of a hardcoded catalogue.
 *
 * Same shape as the backend Ending document — see schemas.py.
 */
export interface EndingRequirements {
  flags_all?: string[];
  flags_none?: string[];
  flags_any?: string[];
  stats?: Partial<Record<StatKey, StatRange>>;
}

export interface Ending {
  _id: string;
  title: string;
  description: string;
  priority?: number;
  requires?: EndingRequirements;
  default?: boolean;
  enabled?: boolean;
  /** Parent deck name (mirrors Card.deck_name). `default` endings are always in
   *  a run's active set (global or deck-bound). A non-default deck-bound ending
   *  joins only when its deck is selected; a non-default global ending is never
   *  auto-assigned (reachable only via triggers_ending). */
  deck_name?: string | null;
  image_url?: string | null;
}

/**
 * Deck record (PK=DECK, SK=<name>) — owns the deck's name, description,
 * enabled flag and unlock rule. Cards link via card.deck_name; gameplay
 * effective-enabled = card.enabled AND deck.enabled. Timestamps come from
 * the server.
 */
export interface DeckUnlockRule {
  kind: 'default' | 'achievement';
  achievement_id?: string | null;
}

export interface Deck {
  name: string;
  description?: string;
  enabled?: boolean;
  unlock_rule?: DeckUnlockRule;
  /** Ending ids this deck strips from a run's active set when selected — the
   *  deck's explicit opt-out, applied even against global/deck defaults. */
  removes_endings?: string[];
  /** Card id shuffled into the run's start deck when this story deck is picked,
   *  so the deck opens on its own scripted card (which then chains via
   *  adds_to_deck). null = no scripted opener. */
  starting_card_id?: string | null;
  /** ISO 8601, server-stamped. */
  created_at?: string;
  /** ISO 8601, server-stamped. */
  updated_at?: string;
}

/**
 * Achievement record (PK=ACH, SK=<id>). Earning one optionally writes a
 * UNLOCK#DECK#<name> item for the user. `criteria.payload` is opaque
 * v1 — the achievement Lambda owns its shape.
 */
export interface AchievementCriteria {
  description: string;
  payload?: Record<string, unknown>;
}

export interface Achievement {
  _id: string;
  name: string;
  description?: string;
  criteria: AchievementCriteria;
  points?: number;
  unlocks_deck?: string | null;
  enabled?: boolean;
  image_url?: string | null;
  /** Player-safe nudge on how to unlock — shown for locked, non-hidden ones. */
  hint?: string;
  /** Hidden achievements stay invisible until earned (reveal-on-unlock). */
  hidden?: boolean;
}

export const STAT_DOMAIN: Record<StatKey, { min: number; max: number }> = {
  moneten: { min: 0, max: 100 },
  aura: { min: 0, max: 100 },
  respekt: { min: 0, max: 100 },
  rizz: { min: 0, max: 100 },
  chaos: { min: -100, max: 100 },
};

export const ORPHAN_DECK = '__orphans__';
