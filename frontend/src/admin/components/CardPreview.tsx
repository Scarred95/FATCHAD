import type { Card, ChoiceHints, Effects, StatHint, StatKey } from '../types';
import { STAT_COLORS, STAT_DOMAIN, STAT_KEYS, STAT_LABELS } from '../types';
import { gradientFor } from '../utils/gradient';
import styles from './CardPreview.module.css';

interface Props {
  card: Card;
}

function autoHintsFromEffects(eff?: Effects): ChoiceHints {
  const out: ChoiceHints = {};
  if (!eff) return out;
  for (const k of STAT_KEYS) {
    const v = eff[k];
    if (typeof v !== 'number' || v === 0) continue;
    out[k] = v > 0 ? 'up' : 'down';
  }
  return out;
}

function effectiveHints(card: Card['choices'][number]): Partial<Record<StatKey, StatHint>> {
  const hasAny = card.hints && Object.values(card.hints).some((v) => v != null);
  if (!hasAny) {
    return autoHintsFromEffects(card.effects) as Partial<Record<StatKey, StatHint>>;
  }
  const out: Partial<Record<StatKey, StatHint>> = {};
  for (const k of STAT_KEYS) {
    const h = card.hints?.[k];
    if (h && h !== 'hidden') out[k] = h;
  }
  return out;
}

function hintGlyph(h: StatHint): string {
  return h === 'up' ? '↑' : h === 'down' ? '↓' : '?';
}

function StatGateOverlay({ card }: { card: Card }) {
  const stats = card.requires?.stats;
  if (!stats) return null;
  const rows = STAT_KEYS.flatMap((k) => {
    const r = stats[k];
    if (!r || (r.min == null && r.max == null)) return [];
    const domain = STAT_DOMAIN[k];
    const range = domain.max - domain.min;
    const lo = r.min ?? domain.min;
    const hi = r.max ?? domain.max;
    const left = ((Math.max(domain.min, lo) - domain.min) / range) * 100;
    const right = ((Math.min(domain.max, hi) - domain.min) / range) * 100;
    return [{
      key: k,
      label: STAT_LABELS[k],
      colour: STAT_COLORS[k],
      left,
      width: Math.max(0.5, right - left),
      title: `${STAT_LABELS[k]}: ${lo}…${hi}`,
    }];
  });
  if (rows.length === 0) return null;
  return (
    <div className={styles.gateOverlay} title="Eligibility-Gate für Stats">
      {rows.map((row) => (
        <div key={row.key} className={styles.gateRow} title={row.title}>
          <span className={styles.gateLetter} style={{ color: row.colour }}>
            {row.label[0]}
          </span>
          <div className={styles.gateTrack}>
            <div
              className={styles.gateFill}
              style={{
                left: `${row.left}%`,
                width: `${row.width}%`,
                background: row.colour,
                boxShadow: `0 0 4px ${row.colour}88`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardPreview({ card }: Props) {
  const grad = gradientFor(card._id || 'evt_preview');
  const arrows = card.choices.length === 3
    ? ['←', '↓', '→']
    : ['←', '→'];
  const footHint = card.choices.length === 3
    ? 'Wische in eine Richtung. Auch nach unten.'
    : 'Wische links oder rechts';
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.art} style={grad}>
          <div className={styles.artFade} />
          <div className={styles.artCat}>{card.category || '—'}</div>
          {card.deck_name && (
            <div className={styles.artDeck}>{card.deck_name}</div>
          )}
          <StatGateOverlay card={card} />
        </div>
        <div className={styles.body}>
          <div className={styles.title}>{card.title || 'Titel'}</div>
          <div className={styles.desc}>{card.description || 'Beschreibung'}</div>
          <div className={styles.foot}>
            <span className={styles.arrowBig}>{arrows[0]}</span>
            <span style={{ textAlign: 'center', padding: '0 4px' }}>{footHint}</span>
            <span className={styles.arrowBig}>{arrows[arrows.length - 1]}</span>
          </div>
        </div>
      </div>

      <div className={styles.gutters}>
        {card.choices.map((c, i) => {
          const hints = effectiveHints(c);
          const arrow = card.choices.length === 3
            ? (i === 0 ? '←' : i === 1 ? '↓' : '→')
            : (i === 0 ? '←' : '→');
          return (
            <div key={i} className={styles.gutter}>
              <span className={styles.gutterArrow}>{arrow}</span>
              <span className={styles.gutterLabel}>{c.text || `Choice ${i + 1}`}</span>
              <div className={styles.gutterHints}>
                {STAT_KEYS.map((k) => {
                  const h = hints[k];
                  if (!h) return null;
                  return (
                    <span
                      key={k}
                      className={styles.hint}
                      style={{ color: STAT_COLORS[k] }}
                      title={`${k} ${h}`}
                    >
                      {hintGlyph(h)}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
