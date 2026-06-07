/**
 * Local frontend-only mock backend.
 *
 * Active only when `VITE_MOCK_MODE === 'true'` (use `npm run dev:mock`). It lets
 * the whole gameplay UI run with no backend and no auth: a tiny in-memory engine
 * serves a 3-card deck that loops forever so you can eyeball cards, swipes, the
 * stat HUD, chaos ambient, the end screen and the leaderboard publish flow.
 *
 * Wiring:
 *   - `client.ts` routes every `request()` here when MOCK_MODE is on.
 *   - `authStore.initFromSession()` short-circuits to a fake logged-in user.
 *
 * Nothing here ships in a normal build — the flag is off unless the mock dev
 * script sets it, and `MOCK_MODE` is a compile-time constant so the bundler can
 * tree-shake the module out of production output.
 */
import { STAT_NAMES } from './types';
import type {
  CardResponse,
  ChoicePreview,
  EndSummary,
  GameState,
  RunSummary,
  Stats,
  TurnResponse,
} from './types';

export const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

// ── Card definitions (the looping deck) ──────────────────────────────────────

interface MockCardDef {
  id: string;
  title: string;
  description: string;
  category: string;
  // index-aligned with the rendered choices; stat deltas applied on commit.
  choices: { text: string; effect: Partial<Stats> }[];
}

const CARD_DEFS: MockCardDef[] = [
  {
    id: 'mock-1',
    title: 'Der Praktikant',
    description: 'Er hat den ganzen Kaffee getrunken. Schon wieder.',
    category: 'Büro',
    choices: [
      { text: 'Feuern', effect: { respekt: 10, aura: -8, chaos: 6 } },
      { text: 'Befördern', effect: { moneten: -10, rizz: 8, aura: 6 } },
    ],
  },
  {
    id: 'mock-2',
    title: 'Influencer-Kollab',
    description: 'Eine DM verspricht "exposure". Bezahlung: ein Like.',
    category: 'Social',
    choices: [
      { text: 'Annehmen', effect: { moneten: 12, aura: -6, chaos: 10 } },
      { text: 'Ablehnen', effect: { respekt: 8, rizz: -5 } },
    ],
  },
  {
    id: 'mock-3',
    title: 'Mitternachts-Döner',
    description: '3 Uhr nachts. Der Mann mit dem Messer fragt: "Mit allem?"',
    category: 'Chaos',
    // 3 choices → exercises the down-swipe + bottom gutter.
    choices: [
      { text: 'Mit allem', effect: { aura: 8, chaos: 10 } },
      { text: 'Vegan', effect: { respekt: 6, rizz: 4 } },
      { text: 'Heimgehen', effect: { chaos: -8, moneten: 4 } },
    ],
  },
];

const INITIAL_STATS: Stats = { moneten: 50, aura: 50, respekt: 50, rizz: 50, chaos: 10 };

// A single sample achievement so the end-screen unlock stack is testable.
const MOCK_ACHIEVEMENT = {
  id: 'mock-ach',
  name: 'Test-Trophäe',
  description: 'Du hast den Mock-Modus überlebt.',
  points: 42,
  unlocks_deck: null,
  image_url: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hintsFor(eff: Partial<Stats>): ChoicePreview['hints'] {
  const hints: ChoicePreview['hints'] = {};
  for (const k of STAT_NAMES) {
    const v = eff[k];
    if (v) hints[k] = v > 0 ? 'up' : 'down';
  }
  return hints;
}

function toCardResponse(def: MockCardDef): CardResponse {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    category: def.category,
    deck_name: 'Test-Deck',
    image_url: null,
    choices: def.choices.map((c) => ({ text: c.text, hints: hintsFor(c.effect) })),
  };
}

const MOCK_CARDS = CARD_DEFS.map(toCardResponse);
const defForTurn = (turn: number) => CARD_DEFS[turn % CARD_DEFS.length];
const cardForTurn = (turn: number) => MOCK_CARDS[turn % MOCK_CARDS.length];

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function applyEffect(stats: Stats, eff: Partial<Stats>): Stats {
  const next = { ...stats };
  for (const k of STAT_NAMES) {
    const v = eff[k];
    if (v) next[k] = clamp(next[k] + v);
  }
  return next;
}

function effectAsStats(eff: Partial<Stats>): Stats {
  const out = { moneten: 0, aura: 0, respekt: 0, rizz: 0, chaos: 0 } as Stats;
  for (const k of STAT_NAMES) out[k] = eff[k] ?? 0;
  return out;
}

// ── In-memory run state ──────────────────────────────────────────────────────

let run: GameState | null = null;

function makeState(): GameState {
  const now = new Date().toISOString();
  return {
    _id: 'mock-run',
    user_id: 'mock-user',
    // 3 ids so the card-stack peek layers render behind the active card.
    deck: MOCK_CARDS.map((c) => c.id),
    scheduled: [],
    stats: { ...INITIAL_STATS },
    flags: [],
    history: [],
    turn: 0,
    rng_seed: 0,
    status: 'active',
    ending: null,
    active_endings: [],
    created_at: now,
    updated_at: now,
  };
}

// Lazily revive a run so a hard reload of /runs/mock-run still works (module
// state is wiped on a full page load).
function ensureRun(): GameState {
  if (!run) run = makeState();
  return run;
}

function toSummary(r: GameState): RunSummary {
  return {
    _id: r._id,
    status: r.status,
    turn: r.turn,
    stats: r.stats,
    ending: r.ending,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function endSummary(): EndSummary {
  const r = ensureRun();
  const ended = r.status !== 'active';
  return {
    ending: r.ending,
    ending_title: r.ending ? 'Mock-Ende' : null,
    ending_description: r.ending
      ? 'Ein erfundenes Ende, nur damit der Bildschirm etwas zu zeigen hat.'
      : null,
    status: r.status,
    turns_survived: r.turn,
    final_stats: r.stats,
    cards_played: r.history.length,
    // Surface the sample achievement on any finished run so the unlock stack
    // is visible while testing — not realistic, purely a UI harness.
    newly_unlocked: ended ? [MOCK_ACHIEVEMENT] : [],
  };
}

function history() {
  const r = ensureRun();
  return r.history.map((h) => {
    const def = defForTurn(h.turn);
    const choice = def.choices[h.choice] ?? def.choices[0];
    return {
      turn: h.turn,
      event_id: h.event_id,
      title: def.title,
      description: def.description,
      category: def.category,
      deck_name: 'Test-Deck',
      choice_index: h.choice,
      choice_text: choice.text,
      effects: effectAsStats(choice.effect),
      sets_flags: [] as string[],
      clears_flags: [] as string[],
      triggered_ending: null,
    };
  });
}

function submitChoice(choiceIndex: number): TurnResponse {
  const r = ensureRun();
  const def = defForTurn(r.turn);
  const eff = def.choices[choiceIndex]?.effect ?? {};
  r.stats = applyEffect(r.stats, eff);
  r.history.push({ event_id: def.id, choice: choiceIndex, turn: r.turn });
  r.turn += 1;
  r.updated_at = new Date().toISOString();
  // Endless by design — the deck just loops so you can test indefinitely.
  return { state: r, next_card: cardForTurn(r.turn) };
}

function abandon(): GameState {
  const r = ensureRun();
  r.status = 'abandoned';
  r.updated_at = new Date().toISOString();
  return r;
}

// ── Request router ───────────────────────────────────────────────────────────

function route(method: string, path: string, body: { choice_index?: number } | undefined): unknown {
  // Meta / catalog
  if (path === '/healthz') return { status: 'ok', db: true };
  if (path === '/catalog/current') {
    return {
      version: 'mock',
      decks: [{ name: 'Test-Deck', description: 'Lokales Test-Deck' }],
      cards: MOCK_CARDS,
      endings: [
        {
          id: 'mock-ending',
          title: 'Mock-Ende',
          description: 'Ein erfundenes Ende.',
          deck_name: null,
          image_url: null,
        },
      ],
      achievements: [MOCK_ACHIEVEMENT],
    };
  }
  if (path === '/decks') {
    return [
      { name: 'Test-Deck', description: 'Lokales Test-Deck' },
      { name: 'Chaos-Deck', description: 'Noch ein Test-Deck' },
    ];
  }
  if (path === '/achievements') {
    return [{ ...MOCK_ACHIEVEMENT, hint: 'Spiel einfach weiter.' }];
  }
  if (path === '/achievements/unlocked') return [];

  // Leaderboards — empty boards; publish just echoes success.
  if (path === '/leaderboard/points') return [];
  if (path === '/leaderboard/runs') return [];
  if (path === '/leaderboard/runs/mine') return [];
  if (path.startsWith('/leaderboard/runs/')) {
    if (method === 'POST') {
      const r = ensureRun();
      return {
        entry: {
          display_name: 'Tester',
          score: r.turn,
          run_id: r._id,
          deck_ids: r.deck,
          status: r.status,
          ending: r.ending,
          published_at: new Date().toISOString(),
        },
        evicted_run_id: null,
      };
    }
    if (method === 'DELETE') return undefined;
  }

  // Run lifecycle / gameplay
  if (path === '/runs') {
    if (method === 'POST') {
      run = makeState();
      return { state: run, next_card: cardForTurn(0) };
    }
    return run ? [toSummary(run)] : [];
  }
  if (path.endsWith('/card')) {
    const r = ensureRun();
    return r.status === 'active' ? cardForTurn(r.turn) : null;
  }
  if (path.endsWith('/summary')) return endSummary();
  if (path.endsWith('/history')) return history();
  if (path.endsWith('/choice') && method === 'POST') {
    return submitChoice(body?.choice_index ?? 0);
  }
  if (path.endsWith('/abandon') && method === 'POST') return abandon();
  if (path.startsWith('/runs/')) {
    if (method === 'DELETE') {
      run = null;
      return undefined;
    }
    return ensureRun();
  }

  // Anything unmocked resolves to nothing rather than throwing.
  return undefined;
}

/** Drop-in stand-in for `request()` while MOCK_MODE is on. Adds a little
 *  latency so loading states actually flicker into view. */
export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  await new Promise((r) => setTimeout(r, 160));
  return route(method, path.split('?')[0], body) as T;
}
