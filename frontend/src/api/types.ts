/**
 * Type shapes mirroring the backend Pydantic schemas.
 * Backend serialises with by_alias=True, so document IDs are wired as `_id`.
 */

/** Canonical stat order. Single source of truth — iterate this instead of
 *  re-listing the five stats. `StatName` is derived from it. */
export const STAT_NAMES = ['moneten', 'aura', 'respekt', 'rizz', 'chaos'] as const;

/** The four 0–100 stats. Chaos (±100) is the outlier, handled separately. */
export const MAIN_STAT_NAMES = ['moneten', 'aura', 'respekt', 'rizz'] as const;

export type StatName = (typeof STAT_NAMES)[number];
export type MainStatName = (typeof MAIN_STAT_NAMES)[number];

export type StatHint = 'up' | 'down' | 'unknown' | 'hidden';

export type GameStatus = 'active' | 'ended' | 'abandoned';

export interface Stats {
  moneten: number;
  aura: number;
  respekt: number;
  rizz: number;
  chaos: number;
}

export interface ChoicePreview {
  text: string;
  hints: Partial<Record<StatName, StatHint>>;
}

export interface DeckInfo {
  name: string;
  description: string;
  unlocked: boolean;
  is_default: boolean;
  has_starting_card: boolean;
}

export interface CardResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  /** Human-readable name of the deck/pack this card was authored in. */
  deck_name: string | null;
  image_url: string | null;
  choices: ChoicePreview[];
}

export interface ScheduledCard {
  card_id: string;
  play_on_turn: number;
}

export interface HistoryEntry {
  event_id: string;
  choice: number;
  turn: number;
}

export interface GameState {
  _id: string;
  user_id: string;
  deck: string[];
  scheduled: ScheduledCard[];
  stats: Stats;
  flags: string[];
  history: HistoryEntry[];
  turn: number;
  rng_seed: number;
  status: GameStatus;
  ending: string | null;
  /** Ending ids currently eligible to fire — snapshotted at run creation,
   *  mutated by choices that unlock/remove endings. */
  active_endings: string[];
  created_at: string;
  updated_at: string;
}

export interface TurnResponse {
  state: GameState;
  next_card: CardResponse | null;
}

export interface RunSummary {
  _id: string;
  status: GameStatus;
  turn: number;
  stats: Stats;
  ending: string | null;
  created_at: string;
  updated_at: string;
}

export interface EndSummary {
  ending: string | null;
  /** Title from the Ending doc, denormalised at summary time. Null when
   *  the run ended without an ending (e.g. abandoned) or the id is stale. */
  ending_title: string | null;
  ending_description: string | null;
  status: GameStatus;
  turns_survived: number;
  final_stats: Stats;
  cards_played: number;
}

/** Server-joined history row — `GameState.history` enriched with card data.
 *  Returned oldest-first by GET /runs/{id}/history. Cards deleted after
 *  being played get a placeholder title and zeroed effects. */
export interface HistoryDetailEntry {
  turn: number;
  event_id: string;
  title: string;
  description: string | null;
  category: string | null;
  deck_name: string | null;
  choice_index: number;
  choice_text: string;
  effects: Stats;
  sets_flags: string[];
  clears_flags: string[];
  triggered_ending: string | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: boolean;
}

/** Player-safe catalog bundle served by GET /catalog/current.
 *  Mirrors `publisher.py`'s `_dump_*_public` output. Cards reuse the
 *  stripped `CardResponse` shape (no weight/requires/effects). */
export interface PublicCatalog {
  version: string;
  decks: Array<{ name: string; description?: string }>;
  cards: CardResponse[];
  endings: Array<{
    id: string;
    title: string;
    description: string;
    deck_name: string | null;
    image_url: string | null;
  }>;
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    points: number;
    unlocks_deck: string | null;
    image_url: string | null;
  }>;
}
