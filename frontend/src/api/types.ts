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

/** An achievement that fired because of this run, joined against the live
 *  catalog at summary time. Stale (deleted) ids drop out server-side. */
export interface UnlockedAchievement {
  id: string;
  name: string;
  description: string;
  points: number;
  /** Deck name granted alongside the achievement, or null. */
  unlocks_deck: string | null;
  image_url: string | null;
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
  /** Achievements this run earned (re-derived from the run row each call, so
   *  a refresh re-renders the same set). Empty when nothing fired. */
  newly_unlocked: UnlockedAchievement[];
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

/** A deck the player may pick on the new-run screen. Returned by GET /decks —
 *  default-unlocked ∪ the caller's achievement-unlocked decks (Tutorial excluded). */
export interface DeckOption {
  name: string;
  description: string;
}

/** Client-facing achievement label from GET /achievements. Criteria stay
 *  server-side; `hint` is the player-safe nudge. Hidden ones are filtered out
 *  by the listing route until earned. */
export interface AchievementView {
  id: string;
  name: string;
  description: string;
  hint: string;
  points: number;
  unlocks_deck: string | null;
  image_url: string | null;
}

/** An achievement the caller has earned (GET /achievements/unlocked) — adds
 *  when it was unlocked. Hidden-but-earned achievements appear here. */
export interface UnlockedAchievementView extends AchievementView {
  unlocked_at: string;
}

/** One row of the points board (GET /leaderboard/points). Public-shaped —
 *  the backend omits user_id; a name + career points is all it carries. */
export interface LeaderboardPointsRow {
  display_name: string;
  score: number;
}

/** One row of the run highscore board (GET /leaderboard/runs and /runs/mine),
 *  or one of the caller's own published runs. `score` is rounds survived. */
export interface LeaderboardRunRow {
  display_name: string;
  score: number;
  run_id: string;
  deck_ids: string[];
  status: GameStatus;
  ending: string | null;
  published_at: string;
}

/** Returned by POST /leaderboard/runs/{run_id}. `evicted_run_id` is set only
 *  when publishing at the cap replaced an existing run. */
export interface PublishRunResponse {
  entry: LeaderboardRunRow;
  evicted_run_id: string | null;
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
