import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap,
  type Edge, type Node, type EdgeMarker, MarkerType,
  type NodeChange, applyNodeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { cardsInDeck, decksOf, useAdminCardStore } from '../store';
import { buildGraph, colourForDeck } from '../utils/graph';
import { CardNode, type CardNodeData } from '../components/CardNode';
import { FlagInspector } from '../components/FlagInspector';
import admin from '../admin.module.css';
import styles from './GraphView.module.css';

const nodeTypes = { card: CardNode };

const NODE_W = 240;
const NODE_H = 170;
const COL_GAP = 80;
const ROW_GAP = 30;
const DECK_GAP = 140;

export function GraphView() {
  const cards = useAdminCardStore((s) => s.cards);
  const nodePositions = useAdminCardStore((s) => s.nodePositions);
  const setNodePosition = useAdminCardStore((s) => s.setNodePosition);
  const clearNodePositions = useAdminCardStore((s) => s.clearNodePositions);
  const setDeckEnabled = useAdminCardStore((s) => s.setDeckEnabled);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [inspectorFlag, setInspectorFlag] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // Session-only per-deck visibility filter. Keyed by the deck-name
  // string (`''` for orphans, matching `decksOf`). A deck in this set is
  // hidden from the canvas; cards from non-hidden decks render normally.
  const [hiddenDecks, setHiddenDecks] = useState<Set<string>>(() => new Set());
  const [showAdds, setShowAdds] = useState(true);
  const [showFlags, setShowFlags] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredFlag, setHoveredFlag] = useState<string | null>(null);

  // Visible card set: drop everything from a deck the user has hidden.
  // We filter once here so layout, edges, and node-rendering all see the
  // same population — no risk of dangling edges to invisible nodes.
  const visibleCards = useMemo(
    () => cards.filter((c) => !hiddenDecks.has(c.deck_name ?? '')),
    [cards, hiddenDecks],
  );

  const graph = useMemo(() => buildGraph(visibleCards), [visibleCards]);

  // Layout: group by deck into horizontal swimlanes; cards stacked in columns.
  const positions = useMemo(() => {
    const groups = decksOf(visibleCards);
    const sortedDecks = [...groups.keys()].sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });
    const pos = new Map<string, { x: number; y: number }>();
    let y = 0;
    for (const dk of sortedDecks) {
      const list = [...(groups.get(dk) ?? [])].sort((a, b) => a._id.localeCompare(b._id));
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
  }, [visibleCards]);

  const neighbours = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    for (const e of graph.edges) {
      if (e.source === selected) set.add(e.target);
      if (e.target === selected) set.add(e.source);
    }
    return set;
  }, [selected, graph.edges]);

  const baseNodes: Node<CardNodeData>[] = useMemo(() => {
    return visibleCards.map((c) => ({
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
    // directly, then persist on drag-stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCards, positions, selected, neighbours]);

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
      // Keep every edge in the array but flip RF's `hidden` field. Filtering
      // edges *out* leaves orphaned <path> / label nodes in the SVG when
      // React Flow's internal edge cache fails to evict them (visible as
      // "ghost" dashed lines + flag labels after toggling adds/flags off).
      const visible = e.kind === 'adds' ? showAdds : showFlags;
      const inSelectionScope = !selected || (neighbours?.has(e.source) && neighbours.has(e.target));
      const flagFocus = hoveredFlag && e.kind === 'flag' && e.flag === hoveredFlag;
      const sourceColour = colourForDeck(visibleCards.find((c) => c._id === e.source)?.deck_name);
      const colour = e.kind === 'adds' ? sourceColour : '#71717a';
      out.push({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        hidden: !visible,
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
  }, [graph.edges, showAdds, showFlags, hoveredFlag, selected, neighbours, visibleCards]);

  // The sidebar deck list always shows every deck (even hidden ones), so
  // the operator can re-enable visibility. Derived from the full card set.
  const decks = useMemo(() => {
    const names = [...new Set(cards.map((c) => c.deck_name ?? ''))];
    return names.sort();
  }, [cards]);

  const anyHidden = hiddenDecks.size > 0;
  const toggleDeckHidden = (deckKey: string) => {
    setHiddenDecks((prev) => {
      const next = new Set(prev);
      if (next.has(deckKey)) next.delete(deckKey);
      else next.add(deckKey);
      return next;
    });
  };

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
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <Link to="/admin" className={styles.crumbLink}>← Decks</Link>
          <h1 className={styles.heading}>Card graph</h1>
          <span className={styles.stats}>
            {cards.length} cards · {graph.edges.filter((e) => e.kind === 'adds').length} adds · {graph.edges.filter((e) => e.kind === 'flag').length} flag links
          </span>
        </div>
        <div className={styles.right}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={showAdds} onChange={(e) => setShowAdds(e.target.checked)} />
            <span>adds_to_deck</span>
          </label>
          <label className={styles.toggle}>
            <input type="checkbox" checked={showFlags} onChange={(e) => setShowFlags(e.target.checked)} />
            <span>flag links (dashed)</span>
          </label>
          {selected && (
            <button onClick={() => setSelected(null)} className={admin.btnSecondary}>Clear focus</button>
          )}
          {anyHidden && (
            <button
              onClick={() => setHiddenDecks(new Set())}
              className={admin.btnSecondary}
              title={`${hiddenDecks.size} deck(s) hidden`}
            >Show all decks</button>
          )}
          <button
            onClick={() => {
              if (Object.keys(nodePositions).length === 0) return;
              if (confirm('Reset all dragged positions to auto-layout?')) clearNodePositions();
            }}
            className={admin.btnSecondary}
            disabled={Object.keys(nodePositions).length === 0}
            title={`${Object.keys(nodePositions).length} card(s) have manual positions`}
          >Reset layout</button>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={`${admin.panel} ${styles.canvas}`}>
          {cards.length === 0 ? (
            <div className={styles.empty}>No cards loaded.</div>
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
              <Controls />
              <MiniMap
                pannable zoomable
                style={{ background: '#09090b' }}
                nodeColor={(n) => colourForDeck((n.data as CardNodeData).card.deck_name)}
                maskColor="rgba(0,0,0,0.6)"
              />
            </ReactFlow>
          )}
        </div>

        <aside className={styles.sidebar}>
          <div className={`${admin.panel} ${styles.box}`}>
            <div className={admin.fieldLabel}>Decks</div>
            {decks.map((d) => {
              const deckKey = d || '__orphans__';
              const list = cardsInDeck(cards, deckKey);
              const enabledCount = list.filter((c) => c.enabled !== false).length;
              const allEnabled = enabledCount === list.length && list.length > 0;
              const allDisabled = enabledCount === 0 && list.length > 0;
              const isBusy = bulkBusy === deckKey;
              const flip = async (enabled: boolean) => {
                if (isBusy) return;
                setBulkBusy(deckKey);
                await setDeckEnabled(deckKey, enabled);
                setBulkBusy(null);
              };
              // hiddenDecks is keyed by raw deck_name (`''` for orphans),
              // matching the `visibleCards` filter, *not* the canonical
              // '__orphans__' deckKey used by setDeckEnabled.
              const hidden = hiddenDecks.has(d);
              return (
                <div key={deckKey} className={`${styles.deckRow} ${hidden ? styles.deckRowHidden : ''}`}>
                  <span
                    className={styles.swatch}
                    style={{ background: colourForDeck(d) }}
                  />
                  <span className={styles.deckName}>{d || '(orphan)'}</span>
                  <span className={styles.deckCount}>
                    {enabledCount}/{list.length}
                  </span>
                  <button
                    className={styles.deckHideBtn}
                    title={hidden ? 'Im Graph einblenden' : 'Im Graph ausblenden'}
                    aria-pressed={hidden}
                    onClick={() => toggleDeckHidden(d)}
                  >{hidden ? '🙈' : '👁'}</button>
                  <button
                    className={styles.deckBulkBtn}
                    disabled={isBusy || allEnabled || list.length === 0}
                    title="Alle Karten in diesem Deck aktivieren"
                    onClick={() => void flip(true)}
                  >on</button>
                  <button
                    className={styles.deckBulkBtn}
                    disabled={isBusy || allDisabled || list.length === 0}
                    title="Alle Karten in diesem Deck deaktivieren"
                    onClick={() => void flip(false)}
                  >off</button>
                </div>
              );
            })}
          </div>

          <div className={`${admin.panel} ${styles.box}`}>
            <div className={admin.fieldLabel}>Flags (hover to highlight · click to inspect)</div>
            {flagList.length === 0 && <div className={styles.flagsEmpty}>No flags in use.</div>}
            {flagList.map((f) => (
              <button
                key={f.flag}
                type="button"
                onMouseEnter={() => setHoveredFlag(f.flag)}
                onMouseLeave={() => setHoveredFlag(null)}
                onClick={() => { setInspectorFlag(f.flag); setInspectorOpen(true); }}
                className={hoveredFlag === f.flag ? styles.flagRowActive : styles.flagRow}
              >
                <span className={styles.flagName}>{f.flag}</span>
                <span className={styles.flagCounts}>
                  set:{f.setters} req:{f.requirers}
                </span>
              </button>
            ))}
          </div>

          <div className={`${admin.panel} ${styles.legend}`}>
            <div className={admin.fieldLabel}>Legend</div>
            <div className={styles.legendRow}>
              <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#38bdf8" strokeWidth="2" /></svg>
              <span>adds_to_deck</span>
            </div>
            <div className={styles.legendRow}>
              <svg width="32" height="8"><line x1="0" y1="4" x2="32" y2="4" stroke="#71717a" strokeWidth="2" strokeDasharray="4 3" /></svg>
              <span>flag link (setter → requirer)</span>
            </div>
            <div className={styles.legendHint}>Click a card to focus its neighbourhood.</div>
          </div>
        </aside>
      </div>

      <FlagInspector
        open={inspectorOpen}
        flag={inspectorFlag}
        cards={cards}
        onClose={() => setInspectorOpen(false)}
        onSelectFlag={(f) => setInspectorFlag(f || null)}
      />
    </div>
  );
}
