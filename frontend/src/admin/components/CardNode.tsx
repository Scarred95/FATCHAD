import { Handle, Position } from 'reactflow';
import { Link } from 'react-router-dom';
import type { Card } from '../types';
import { colourForDeck } from '../utils/graph';
import { useAdminCardStore } from '../store';
import styles from './CardNode.module.css';

export interface CardNodeData {
  card: Card;
  highlighted: boolean;
  dimmed: boolean;
}

export function CardNode({ data }: { data: CardNodeData }) {
  const c = data.card;
  const colour = colourForDeck(c.deck_name);
  const setCardEnabled = useAdminCardStore((s) => s.setCardEnabled);
  const isEnabled = c.enabled !== false;
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
        opacity: isEnabled ? opacity : opacity * 0.5,
        borderColor: data.highlighted ? '#fff' : colour,
        borderStyle: isEnabled ? 'solid' : 'dashed',
        filter: isEnabled ? undefined : 'grayscale(0.6)',
        boxShadow: data.highlighted ? `0 0 0 2px ${colour}, 0 0 20px ${colour}55` : undefined,
      }}
      className={styles.node}
    >
      <Handle type="target" position={Position.Left} style={{ background: colour }} />
      <div
        className={styles.head}
        style={{ background: `${colour}22`, borderBottom: `1px solid ${colour}55` }}
      >
        <label
          className={styles.enableSwitch}
          title={isEnabled ? 'Aktiv — Klick zum Deaktivieren' : 'Deaktiviert — Klick zum Aktivieren'}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={() => void setCardEnabled(c._id, !isEnabled)}
          />
          <span className={styles.enableTrack} />
        </label>
        <div className={styles.title} title={c.title}>{c.title || c._id}</div>
        {(c.weight ?? 10) === 0 && <span className={styles.weight}>w0</span>}
        {c.important && <span className={styles.star}>★</span>}
        {!isEnabled && <span className={styles.offBadge}>off</span>}
      </div>
      <div className={styles.body}>
        <div className={styles.id}>{c._id}</div>
        <div className={styles.meta}>
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

        <div style={{ paddingTop: '4px' }}>
          <Link
            to={`/admin/cards/${encodeURIComponent(c._id)}`}
            className={styles.openLink}
          >open editor →</Link>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: colour }} />
    </div>
  );
}

function Row({ label, items, colour }: { label: string; items: string[]; colour: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {items.map((f) => (
        <span
          key={`${label}:${f}`}
          className={styles.token}
          style={{ background: `${colour}22`, color: colour, border: `1px solid ${colour}44` }}
        >{f}</span>
      ))}
    </div>
  );
}
