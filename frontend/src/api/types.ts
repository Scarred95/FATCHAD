/**
 * Type shapes mirroring the backend Pydantic schemas.
 * Backend serialises with by_alias=True, so document IDs are wired as `_id`.
 */

export type StatName = 'moneten' | 'aura' | 'respekt' | 'rizz' | 'chaos';
export type MainStatName = 'moneten' | 'aura' | 'respekt' | 'rizz';

export type StatHint = 'up' | 'down' | 'unknown' | 'hidden';

export type GameStatus = 'active' | 'won' | 'lost' | 'abandoned';

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

export interface CardResponse {
  id: string;
  title: string;
  description: string;
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
  flag_timers: Record<string, number>;
  history: HistoryEntry[];
  turn: number;
  rng_seed: number;
  status: GameStatus;
  ending: string | null;
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
  status: GameStatus;
  turns_survived: number;
  final_stats: Stats;
  cards_played: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: boolean;
}
