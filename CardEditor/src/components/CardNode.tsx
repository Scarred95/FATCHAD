import { Handle, Position } from 'reactflow';
import { Link } from 'react-router-dom';
import type { Card } from '../types';
import { colourForDeck } from '../utils/graph';

export interface CardNodeData {
  card: Card;
  highlighted: boolean;
  dimmed: boolean;
}

export function CardNode({ data }: { data: CardNodeData }) {
  const c = data.card;
  const colour = colourForDeck(c.deck_name);
  const requires =
    (c.requires?.flags_all ?? []).concat(c.requires?.flags_any ?? []);
  const requiresNone = c.requires?.flags_none ?? [];
  const sets = c.choices.flatMap((ch) => ch.sets_flags ?? []);
  const clears = c.choices.flatMap((ch) => ch.clears_flags ?? []);
  const endings = c.choices.map((ch) => ch.triggers_ending).filter(Boolean) as string[];
  const opacity = data.dimmed ? 0.25 : 1;

  return (
    <div
      style={{
        opacity,
        borderColor: data.highlighted ? '#fff' : colour,
        boxShadow: data.highlighted ? `0 0 0 2px ${colour}, 0 0 20px ${colour}55` : undefined,
      }}
      className="bg-zinc-900 border-2 rounded-lg w-[240px] text-[11px] text-zinc-200 overflow-hidden"
    >
      <Handle type="target" position={Position.Left} style={{ background: colour }} />
      <div
        className="px-2 py-1.5 flex items-center justify-between gap-2"
        style={{ background: `${colour}22`, borderBottom: `1px solid ${colour}55` }}
      >
        <div className="font-semibold truncate text-zinc-100" title={c.title}>{c.title || c._id}</div>
        {(c.weight ?? 10) === 0 && <span className="text-[9px] text-zinc-400">w0</span>}
        {c.important && <span className="text-[9px] text-amber-300">★</span>}
      </div>
      <div className="px-2 py-1.5 space-y-1">
        <div className="font-mono text-[9px] text-zinc-500 truncate">{c._id}</div>
        <div className="text-[9px] uppercase tracking-wide text-zinc-500">
          {c.category}{c.deck_name ? ` · ${c.deck_name}` : ''}
        </div>

        {requires.length > 0 && (
          <Row label="needs" items={requires} colour="#22c55e" />
        )}
        {requiresNone.length > 0 && (
          <Row label="not" items={requiresNone} colour="#ef4444" />
        )}
        {sets.length > 0 && (
          <Row label="sets" items={[...new Set(sets)]} colour="#38bdf8" />
        )}
        {clears.length > 0 && (
          <Row label="clears" items={[...new Set(clears)]} colour="#f97316" />
        )}
        {endings.length > 0 && (
          <Row label="ends" items={endings} colour="#a855f7" />
        )}

        <div className="pt-1">
          <Link
            to={`/cards/${encodeURIComponent(c._id)}`}
            className="text-[10px] text-zinc-400 hover:text-zinc-100 underline"
          >open editor →</Link>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: colour }} />
    </div>
  );
}

function Row({ label, items, colour }: { label: string; items: string[]; colour: string }) {
  return (
    <div className="flex flex-wrap items-start gap-1">
      <span className="text-[9px] uppercase text-zinc-500 mt-0.5">{label}</span>
      {items.map((f) => (
        <span
          key={`${label}:${f}`}
          className="text-[9px] px-1 py-px rounded-sm font-mono"
          style={{ background: `${colour}22`, color: colour, border: `1px solid ${colour}44` }}
        >{f}</span>
      ))}
    </div>
  );
}
