import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CardPreview } from '../components/CardPreview';
import { ChoicesEditor } from '../components/ChoicesEditor';
import { RequirementsEditor } from '../components/RequirementsEditor';
import { ValidationPanel } from '../components/ValidationPanel';
import {
  categoryNamesOf, deckNamesOf, flagInventoryOf, referrersOf, useStore,
} from '../store';
import {
  ALL_CATEGORIES, type Card, type Requirements,
} from '../types';
import { validateCard } from '../utils/validate';
import { emptyCard } from '../utils/factory';

interface Props { mode: 'edit' | 'new'; }

export function CardEditor({ mode }: Props) {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const nav = useNavigate();
  const cards = useStore((s) => s.cards);
  const saved = useStore((s) => s.saved);
  const upsertCard = useStore((s) => s.upsertCard);
  const removeCard = useStore((s) => s.removeCard);
  const markSaved = useStore((s) => s.markSaved);
  const duplicateCard = useStore((s) => s.duplicateCard);

  const initial = useMemo<Card>(() => {
    if (mode === 'new') {
      return emptyCard({ deck_name: search.get('deck') || null });
    }
    const existing = cards.find((c) => c._id === id);
    return existing ? structuredClone(existing) : emptyCard({ _id: id ?? '' });
  }, [mode, id, cards, search]);

  const [card, setCard] = useState<Card>(initial);
  useEffect(() => { setCard(initial); }, [initial]);

  const flagSuggestions = useMemo(() => flagInventoryOf(cards), [cards]);
  const deckSuggestions = useMemo(() => deckNamesOf(cards), [cards]);
  const categorySuggestions = useMemo(
    () => [...new Set([...ALL_CATEGORIES, ...categoryNamesOf(cards)])],
    [cards],
  );

  // Validate against a hypothetical dataset where this card is the current version.
  const datasetForValidation = useMemo(() => {
    const others = cards.filter((c) => c._id !== card._id && c._id !== initial._id);
    return [...others, card];
  }, [cards, card, initial._id]);

  const issues = useMemo(() => validateCard(card, datasetForValidation), [card, datasetForValidation]);
  const errors = issues.filter((i) => i.level === 'error');
  const blockSave = errors.length > 0;
  const isLocked = mode === 'edit' && !!saved[card._id];

  const referrers = useMemo(() => referrersOf(cards, card._id), [cards, card._id]);

  const patch = (p: Partial<Card>) => setCard((c) => ({ ...c, ...p }));
  const patchReq = (r: Requirements) => setCard((c) => ({ ...c, requires: r }));

  const onSave = () => {
    if (blockSave) return;
    upsertCard(card);
    markSaved(card._id);
    if (mode === 'new') nav(`/cards/${encodeURIComponent(card._id)}`, { replace: true });
  };

  const onDelete = () => {
    if (!confirm(`Delete ${card._id}? This cannot be undone.`)) return;
    removeCard(card._id);
    nav(card.deck_name ? `/decks/${encodeURIComponent(card.deck_name)}` : '/');
  };

  const onDuplicate = () => {
    const proposed = prompt('New _id for the duplicate', `${card._id}_copy`);
    if (!proposed) return;
    if (!/^evt_[a-z0-9_]+$/.test(proposed)) { alert('_id must match ^evt_[a-z0-9_]+$'); return; }
    if (cards.some((c) => c._id === proposed)) { alert('That _id already exists'); return; }
    duplicateCard(card._id, proposed);
    nav(`/cards/${encodeURIComponent(proposed)}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <Link
          to={card.deck_name ? `/decks/${encodeURIComponent(card.deck_name)}` : '/decks/__orphans__'}
          className="text-zinc-400 hover:text-zinc-100"
        >← Back to {card.deck_name ?? 'orphans'}</Link>
        <span className="text-zinc-700">/</span>
        <Link to="/" className="text-zinc-500 hover:text-zinc-300 text-xs">all decks</Link>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-200 font-mono text-xs">{card._id || '(unsaved)'}</span>

        <div className="ml-auto flex gap-2">
          {mode === 'edit' && <button onClick={onDuplicate} className="btn-secondary">Duplicate</button>}
          {mode === 'edit' && <button onClick={onDelete} className="btn-danger">Delete</button>}
          <button onClick={onSave} disabled={blockSave} className="btn-primary">
            {blockSave ? `Fix ${errors.length} error(s)` : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr_360px] gap-4">
        {/* LEFT — Identity */}
        <section className="panel p-4 space-y-4">
          <div>
            <div className="field-label">_id {isLocked && <span className="text-zinc-600">(locked)</span>}</div>
            <div className="flex gap-1.5">
              <input
                value={card._id}
                onChange={(e) => patch({ _id: e.target.value })}
                disabled={isLocked}
                placeholder="evt_…"
                className="field-input font-mono text-xs disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(card._id)}
                className="btn-secondary"
                title="Copy"
              >⧉</button>
            </div>
          </div>

          <div>
            <div className="field-label">Title</div>
            <input
              value={card.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="field-input"
            />
          </div>

          <div>
            <div className="field-label">Description</div>
            <textarea
              value={card.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={3}
              className="field-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="field-label">Category</div>
              <input
                list="cat-suggest"
                value={card.category}
                onChange={(e) => patch({ category: e.target.value })}
                className="field-input"
              />
              <datalist id="cat-suggest">
                {categorySuggestions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <div className="field-label">Deck name</div>
              <input
                list="deck-suggest"
                value={card.deck_name ?? ''}
                onChange={(e) => patch({ deck_name: e.target.value || null })}
                placeholder="(orphan)"
                className="field-input"
              />
              <datalist id="deck-suggest">
                {deckSuggestions.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="field-label">Weight: {card.weight ?? 10}</div>
              <input
                type="range"
                min={0}
                max={100}
                value={card.weight ?? 10}
                onChange={(e) => patch({ weight: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!card.important}
                  onChange={(e) => patch({ important: e.target.checked })}
                />
                important (re-shuffle if ineligible)
              </label>
            </div>
          </div>

          <div>
            <div className="field-label">image_url</div>
            <input
              value={card.image_url ?? ''}
              onChange={(e) => patch({ image_url: e.target.value || null })}
              placeholder="(optional)"
              className="field-input"
            />
          </div>

          <details className="border-t border-zinc-800 pt-3">
            <summary className="cursor-pointer text-sm text-zinc-300">Requirements (eligibility gate)</summary>
            <div className="mt-3">
              <RequirementsEditor
                value={card.requires ?? {}}
                onChange={patchReq}
                flagSuggestions={flagSuggestions}
              />
            </div>
          </details>
        </section>

        {/* MIDDLE — Choices */}
        <section className="panel p-4">
          <ChoicesEditor
            value={card.choices}
            onChange={(v) => patch({ choices: v })}
            allCards={cards}
            flagSuggestions={flagSuggestions}
          />
        </section>

        {/* RIGHT — Preview & graph + validation */}
        <section className="space-y-4">
          <div className="panel p-4 flex justify-center">
            <CardPreview card={card} />
          </div>

          <div className="panel p-3 text-xs space-y-2">
            <div>
              <div className="field-label">Adds:</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {card.choices.flatMap((ch) => ch.adds_to_deck ?? []).map((d, i) => {
                  const target = cards.find((c) => c._id === d.card_id);
                  return (
                    <Link
                      key={`${d.card_id}-${i}`}
                      to={`/cards/${encodeURIComponent(d.card_id)}`}
                      className="chip hover:bg-zinc-700"
                    >
                      {target ? target.title : <span className="text-red-300">{d.card_id} (missing)</span>}
                    </Link>
                  );
                })}
                {card.choices.every((ch) => !(ch.adds_to_deck?.length)) && (
                  <span className="text-zinc-600">(none)</span>
                )}
              </div>
            </div>
            <div>
              <div className="field-label">Added by:</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {referrers.map((r) => (
                  <Link
                    key={r._id}
                    to={`/cards/${encodeURIComponent(r._id)}`}
                    className="chip hover:bg-zinc-700"
                  >{r.title}</Link>
                ))}
                {referrers.length === 0 && <span className="text-zinc-600">(none)</span>}
              </div>
            </div>
          </div>

          <ValidationPanel issues={issues} />
        </section>
      </div>
    </div>
  );
}
