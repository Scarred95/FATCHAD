// Mirrors §2 of CARD_EDITOR_SPEC.md and DATA_SHAPES.md.
// Field names match the backend Pydantic shape exactly — do not rename.

export type StatKey = 'moneten' | 'aura' | 'respekt' | 'rizz' | 'chaos';
export const STAT_KEYS: StatKey[] = ['moneten', 'aura', 'respekt', 'rizz', 'chaos'];

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

export type StatHint = 'up' | 'down' | 'unknown' | 'hidden';

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

// §5 endings
export const WIN_ENDINGS = ['chaos_agent', 'grey_eminence'];
export const LOSS_ENDINGS = [
  'death_bankrupt', 'death_revolution', 'death_irrelevant', 'death_jumped_shark',
  'death_couped', 'death_conspiracy', 'death_frozen_out', 'death_drowned_in_drama',
];
export const KNOWN_ENDINGS = [...WIN_ENDINGS, ...LOSS_ENDINGS];

export const STAT_DOMAIN: Record<StatKey, { min: number; max: number }> = {
  moneten: { min: 0, max: 100 },
  aura: { min: 0, max: 100 },
  respekt: { min: 0, max: 100 },
  rizz: { min: 0, max: 100 },
  chaos: { min: -100, max: 100 },
};

export const ORPHAN_DECK = '__orphans__';
