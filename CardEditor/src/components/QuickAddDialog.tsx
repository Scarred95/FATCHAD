import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ALL_CATEGORIES } from '../types';
import { useStore } from '../store';
import { emptyCard } from '../utils/factory';

interface Props {
  deckName: string | null;
  onClose: () => void;
}

export function QuickAddDialog({ deckName, onClose }: Props) {
  const nav = useNavigate();
  const cards = useStore((s) => s.cards);
  const addCard = useStore((s) => s.addCard);
  const markSaved = useStore((s) => s.markSaved);
  const [form, setForm] = useState({
    _id: '',
    title: '',
    description: '',
    category: 'social',
    weight: 10,
    c1: '',
    c2: '',
  });

  const valid =
    /^evt_[a-z0-9_]+$/.test(form._id) &&
    !cards.some((c) => c._id === form._id) &&
    form.title.trim() &&
    form.description.trim() &&
    form.c1.trim() &&
    form.c2.trim();

  const build = () => emptyCard({
    _id: form._id,
    title: form.title,
    description: form.description,
    category: form.category,
    deck_name: deckName,
    weight: Number(form.weight) || 0,
    choices: [
      { text: form.c1, effects: {}, hints: {}, sets_flags: [], clears_flags: [], adds_to_deck: [], triggers_ending: null },
      { text: form.c2, effects: {}, hints: {}, sets_flags: [], clears_flags: [], adds_to_deck: [], triggers_ending: null },
    ],
  });

  const saveAndOpen = () => {
    if (!valid) return;
    const card = build();
    addCard(card);
    markSaved(card._id);
    onClose();
    nav(`/cards/${encodeURIComponent(card._id)}`);
  };
  const saveAndAnother = () => {
    if (!valid) return;
    const card = build();
    addCard(card);
    markSaved(card._id);
    setForm({ ...form, _id: '', title: '', description: '', c1: '', c2: '' });
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center p-4">
      <div className="panel p-5 max-w-lg w-full space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Quick add card</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">×</button>
        </div>
        <div className="text-xs text-zinc-500">Deck: <b>{deckName ?? '(orphan)'}</b></div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <div className="field-label">_id</div>
            <input
              value={form._id}
              onChange={(e) => setForm({ ...form, _id: e.target.value })}
              placeholder="evt_my_card"
              className="field-input font-mono text-xs"
            />
          </div>
          <div className="col-span-2">
            <div className="field-label">Title</div>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="field-input"
            />
          </div>
          <div className="col-span-2">
            <div className="field-label">Description</div>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="field-input"
            />
          </div>
          <div>
            <div className="field-label">Category</div>
            <input
              list="cat-list"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="field-input"
            />
            <datalist id="cat-list">
              {ALL_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <div className="field-label">Weight</div>
            <input
              type="number"
              min={0}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              className="field-input"
            />
          </div>
          <div>
            <div className="field-label">Choice 1 text</div>
            <input
              value={form.c1}
              onChange={(e) => setForm({ ...form, c1: e.target.value })}
              className="field-input"
            />
          </div>
          <div>
            <div className="field-label">Choice 2 text</div>
            <input
              value={form.c2}
              onChange={(e) => setForm({ ...form, c2: e.target.value })}
              className="field-input"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={saveAndAnother} disabled={!valid} className="btn-secondary">Save & stub another</button>
          <button onClick={saveAndOpen} disabled={!valid} className="btn-primary">Save & open editor</button>
        </div>
      </div>
    </div>
  );
}
