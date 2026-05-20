import type { Card } from '../types';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'adds' | 'flag';
  label?: string;
  // Per-edge metadata for tooltips
  position?: 'top' | 'bottom' | 'shuffle';
  in_turns?: number | null;
  flag?: string;
}

export interface CardGraph {
  edges: GraphEdge[];
  /** flags → setters, requirers (for filtering / overlay) */
  flagIndex: Map<string, { setters: string[]; requirers: string[]; clearers: string[] }>;
}

export function buildGraph(cards: Card[]): CardGraph {
  const edges: GraphEdge[] = [];
  const flagIndex = new Map<string, { setters: string[]; requirers: string[]; clearers: string[] }>();

  const ensureFlag = (f: string) => {
    if (!flagIndex.has(f)) flagIndex.set(f, { setters: [], requirers: [], clearers: [] });
    return flagIndex.get(f)!;
  };

  for (const c of cards) {
    // Direct adds_to_deck edges
    c.choices.forEach((ch, ci) => {
      ch.adds_to_deck?.forEach((d, di) => {
        edges.push({
          id: `add:${c._id}:${ci}:${di}:${d.card_id}`,
          source: c._id,
          target: d.card_id,
          kind: 'adds',
          position: d.position,
          in_turns: d.in_turns ?? null,
        });
      });
      ch.sets_flags?.forEach((f) => ensureFlag(f).setters.push(c._id));
      ch.clears_flags?.forEach((f) => ensureFlag(f).clearers.push(c._id));
    });
    c.requires?.flags_all?.forEach((f) => ensureFlag(f).requirers.push(c._id));
    c.requires?.flags_any?.forEach((f) => ensureFlag(f).requirers.push(c._id));
  }

  // Flag-mediated edges: setter → requirer per shared flag
  for (const [flag, info] of flagIndex) {
    for (const s of info.setters) {
      for (const r of info.requirers) {
        if (s === r) continue;
        edges.push({
          id: `flag:${flag}:${s}->${r}`,
          source: s,
          target: r,
          kind: 'flag',
          label: flag,
          flag,
        });
      }
    }
  }

  return { edges, flagIndex };
}

// Hash card id to a stable colour for visual grouping by deck.
export function colourForDeck(name: string | null | undefined): string {
  const palette = [
    '#38bdf8', // sky
    '#a855f7', // purple
    '#f97316', // orange
    '#facc15', // yellow
    '#22c55e', // green
    '#ef4444', // red
    '#ec4899', // pink
    '#14b8a6', // teal
    '#eab308', // amber
    '#8b5cf6', // violet
  ];
  if (!name) return '#52525b';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
