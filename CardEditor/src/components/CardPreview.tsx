import type { Card, ChoiceHints, Effects, StatHint, StatKey } from '../types';
import { STAT_COLORS, STAT_KEYS } from '../types';
import { gradientFor } from '../utils/gradient';

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

export function CardPreview({ card }: Props) {
  const grad = gradientFor(card._id || 'evt_preview');
  const arrows = card.choices.length === 3
    ? ['←', '↓', '→']
    : ['←', '→'];
  const footHint = card.choices.length === 3
    ? 'Wische in eine Richtung. Auch nach unten.'
    : 'Wische links oder rechts';
  return (
    <div className="space-y-3">
      <div className="relative w-full max-w-[320px] aspect-[2/3] rounded-3xl overflow-hidden bg-zinc-900 shadow-2xl shadow-black/60 border border-zinc-800">
        {/* art block */}
        <div
          className="relative h-[38%] w-full"
          style={grad}
        >
          <div
            className="absolute inset-x-0 bottom-0 h-12"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.4))' }}
          />
          <div className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.18em] text-white/50">
            {card.category || '—'}
          </div>
          {card.deck_name && (
            <div className="absolute top-3 right-3 text-[10px] px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-white/90">
              {card.deck_name}
            </div>
          )}
        </div>
        {/* body */}
        <div className="px-5 py-4 flex flex-col h-[62%]">
          <div className="text-[22px] leading-tight font-semibold">
            {card.title || 'Titel'}
          </div>
          <div className="mt-2 italic text-[14px] text-zinc-300 leading-snug flex-1">
            {card.description || 'Beschreibung'}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            <span className="text-base">{arrows[0]}</span>
            <span className="text-center px-1">{footHint}</span>
            <span className="text-base">{arrows[arrows.length - 1]}</span>
          </div>
        </div>
      </div>

      {/* choice gutters */}
      <div className="space-y-1.5">
        {card.choices.map((c, i) => {
          const hints = effectiveHints(c);
          const arrow = card.choices.length === 3
            ? (i === 0 ? '←' : i === 1 ? '↓' : '→')
            : (i === 0 ? '←' : '→');
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-zinc-500 text-center">{arrow}</span>
              <span className="flex-1 text-zinc-200 truncate">{c.text || `Choice ${i + 1}`}</span>
              <div className="flex gap-1.5">
                {STAT_KEYS.map((k) => {
                  const h = hints[k];
                  if (!h) return null;
                  return (
                    <span
                      key={k}
                      className="text-xs font-semibold tabular-nums"
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
