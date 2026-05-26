import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap,
  type Edge, type Node, type EdgeMarker, MarkerType,
  type NodeChange, applyNodeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { decksOf, useStore } from '../store';
import { buildGraph, colourForDeck } from '../utils/graph';
import { CardNode, type CardNodeData } from '../components/CardNode';

const nodeTypes = { card: CardNode };

const NODE_W = 240;
const NODE_H = 170;
const COL_GAP = 80;
const ROW_GAP = 30;
const DECK_GAP = 140;

export function GraphView() {
  const cards = useStore((s) => s.cards);
  const nodePositions = useStore((s) => s.nodePositions);
  const setNodePosition = useStore((s) => s.setNodePosition);
  const clearNodePositions = useStore((s) => s.clearNodePositions);
  const [showAdds, setShowAdds] = useState(true);
  const [showFlags, setShowFlags] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredFlag, setHoveredFlag] = useState<string | null>(null);

  const graph = useMemo(() => buildGraph(cards), [cards]);

  // Layout: group by deck into horizontal swimlanes; cards stacked in columns.
  const positions = useMemo(() => {
    const groups = decksOf(cards);
    const sortedDecks = [...groups.keys()].sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    const pos = new Map<string, { x: number; y: number }>();
    let y = 0;
    for (const dk of sortedDecks) {
      const list = [...(groups.get(dk) ?? [])].sort((a, b) => a._id.localeCompare(b._id));
      // Wrap to ~6 cards per row
      const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(list.length))));
      list.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        pos.set(c._id, {
          x: col * (NODE_W + COL_GAP),
          y: y + row * (NODE_H + ROW_GAP),
        });
      });
      const rows = Math.ceil(list.length / cols);
      y += rows * (NODE_H + ROW_GAP) + DECK_GAP;
    }
    return pos;
  }, [cards]);

  // Compute highlighting: when a card is selected, dim everything not directly connected.
  const neighbours = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of graph.edges) {
      if (e.source === selected) set.add(e.target);
      if (e.target === selected) set.add(e.source);
    }
    return set;
  }, [selected, graph.edges]);

  // Source of truth for *what* nodes exist & their data; positions prefer
  // the persisted drag override, falling back to the auto layout.
  const baseNodes: Node<CardNodeData>[] = useMemo(() => {
    return cards.map((c) => ({
      id: c._id,
      type: 'card',
      position: nodePositions[c._id] ?? positions.get(c._id) ?? { x: 0, y: 0 },
      data: {
        card: c,
        highlighted: selected === c._id,
        dimmed: !!neighbours && !neighbours.has(c._id),
      },
    }));
    // nodePositions intentionally omitted: live drags update local `nodes`
    // directly, then persist on drag-stop. Including it here would clobber
    // an in-progress drag with the not-yet-committed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, positions, selected, neighbours]);

  const [nodes, setNodes] = useState<Node<CardNodeData>[]>(baseNodes);
  useEffect(() => { setNodes(baseNodes); }, [baseNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns) as Node<CardNodeData>[]);
  }, []);

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    setNodePosition(node.id, node.position);
  }, [setNodePosition]);

  const edges: Edge[] = useMemo(() => {
    const arrow: EdgeMarker = { type: MarkerType.ArrowClosed, width: 16, height: 16 };
    const out: Edge[] = [];
    for (const e of graph.edges) {
      const visible = e.kind === 'adds' ? showAdds : showFlags;
      if (!visible) continue;
      const inSelectionScope = !selected || (neighbours?.has(e.source) && neighbours.has(e.target));
      const flagFocus = hoveredFlag && e.kind === 'flag' && e.flag === hoveredFlag;
      const sourceColour = colourForDeck(cards.find((c) => c._id === e.source)?.deck_name);
      const colour = e.kind === 'adds' ? sourceColour : '#71717a';
      out.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        animated: e.kind === 'adds' && e.position === 'top',
        label: e.kind === 'adds'
          ? (e.in_turns != null ? `+${e.in_turns}t` : (e.position && e.position !== 'shuffle' ? e.position : undefined))
          : e.label,
        labelStyle: { fill: '#a1a1aa', fontSize: 10 },
        labelBgStyle: { fill: '#18181b' },
        labelBgPadding: [2, 4] as [number, number],
        style: {
          stroke: flagFocus ? '#fff' : colour,
          strokeWidth: flagFocus ? 2 : 1.5,
          strokeDasharray: e.kind === 'flag' ? '4 3' : undefined,
          opacity: inSelectionScope ? (flagFocus ? 1 : (e.kind === 'flag' ? 0.55 : 0.9)) : 0.08,
        },
        markerEnd: { ...arrow, color: flagFocus ? '#fff' : colour },
      });
    }
    return out;
  }, [graph.edges, showAdds, showFlags, hoveredFlag, selected, neighbours, cards]);

  const decks = useMemo(() => {
    const names = [...new Set(cards.map((c) => c.deck_name ?? ''))];
    return names.sort();
  }, [cards]);

  const flagList = useMemo(() => {
    return [...graph.flagIndex.entries()]
      .map(([flag, info]) => ({
        flag,
        setters: info.setters.length,
        requirers: info.requirers.length,
        clearers: info.clearers.length,
      }))
      .filter((x) => x.setters + x.requirers > 0)
      .sort((a, b) => (b.setters + b.requirers) - (a.setters + a.requirers));
  }, [graph.flagIndex]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-100">← Decks</Link>
          <h1 className="text-xl font-semibold">Card graph</h1>
          <span className="text-xs text-zinc-500">
            {cards.length} cards · {graph.edges.filter((e) => e.kind === 'adds').length} adds · {graph.edges.filter((e) => e.kind === 'flag').length} flag links
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showAdds} onChange={(e) => setShowAdds(e.target.checked)} />
            <span>adds_to_deck</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showFlags} onChange={(e) => setShowFlags(e.target.checked)} />
            <span>flag links (dashed)</span>
          </label>
          {selected && (
            <button onClick={() => setSelected(null)} className="btn-secondary">Clear focus</button>
          )}
          <button
            onClick={() => {
              if (Object.keys(nodePositions).length === 0) return;
              if (confirm('Reset all dragged positions to auto-layout?')) clearNodePositions();
            }}
            className="btn-secondary"
            disabled={Object.keys(nodePositions).length === 0}
            title={`${Object.keys(nodePositions).length} card(s) have manual positions`}
          >Reset layout</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
        <div className="panel h-[78vh] overflow-hidden">
          {cards.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
              No cards loaded.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.15}
              maxZoom={1.5}
              nodesDraggable
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_, n) => setSelected(n.id === selected ? null : n.id)}
              onPaneClick={() => setSelected(null)}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} color="#27272a" />
              <Controls className="!bg-zinc-900 !border-zinc-700" />
              <MiniMap
                pannable zoomable
                style={{ background: '#09090b' }}
                nodeColor={(n) => colourForDeck((n.data as CardNodeData).card.deck_name)}
                maskColor="rgba(0,0,0,0.6)"
              />
            </ReactFlow>
          )}
        </div>

        <aside className="space-y-3 max-h-[78vh] overflow-auto pr-1">
          <div className="panel p-3 space-y-2">
            <div className="field-label">Decks</div>
            {decks.map((d) => (
              <div key={d || '_orphans'} className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: colourForDeck(d) }}
                />
                <span className="truncate text-zinc-300">{d || '(orphan)'}</span>
              </div>
            ))}
          </div>

          <div className="panel p-3 space-y-2">
            <div className="field-label">Flags (hover to highlight)</div>
            {flagList.length === 0 && <div className="text-xs text-zinc-500">No flags in use.</div>}
            {flagList.map((f) => (
              <div
                key={f.flag}
                onMouseEnter={() => setHoveredFlag(f.flag)}
                onMouseLeave={() => setHoveredFlag(null)}
                className={`text-xs flex items-center justify-between gap-2 px-1.5 py-1 rounded cursor-help ${
                  hoveredFlag === f.flag ? 'bg-zinc-800' : ''
                }`}
              >
                <span className="font-mono truncate">{f.flag}</span>
                <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                  set:{f.setters} req:{f.requirers}
                </span>
              </div>
            ))}
          </div>

          <div className="panel p-3 text-xs space-y-1">
            <div className="field-label">Legend</div>
            <div className="flex items-center gap-2">
              <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#38bdf8" strokeWidth="2" /></svg>
              <span>adds_to_deck</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#71717a" strokeWidth="2" strokeDasharray="4 3" /></svg>
              <span>flag link (setter → requirer)</span>
            </div>
            <div className="text-zinc-500 pt-1">Click a card to focus its neighbourhood.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
