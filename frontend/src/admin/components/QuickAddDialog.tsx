import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ALL_CATEGORIES } from '../types';
import { useAdminCardStore } from '../store';
import { emptyCard } from '../utils/factory';
import admin from '../admin.module.css';
import styles from './QuickAddDialog.module.css';

interface Props {
  deckName: string | null;
  onClose: () => void;
}

export function QuickAddDialog({ deckName, onClose }: Props) {
  const nav = useNavigate();
  const cards = useAdminCardStore((s) => s.cards);
  const upsertCard = useAdminCardStore((s) => s.upsertCard);
  const [busy, setBusy] = useState(false);
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

  const saveAndOpen = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const card = build();
    const ok = await upsertCard(card);
    setBusy(false);
    if (!ok) return;
    onClose();
    nav(`/admin/cards/${encodeURIComponent(card._id)}`);
  };
  const saveAndAnother = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const card = build();
    const ok = await upsertCard(card);
    setBusy(false);
    if (!ok) return;
    setForm({ ...form, _id: '', title: '', description: '', c1: '', c2: '' });
  };

  return (
    <div className={admin.modalBackdrop}>
      <div className={`${admin.panel} ${styles.dialog}`}>
        <div className={styles.head}>
          <div className={styles.title}>Quick add card</div>
          <button onClick={onClose} className={styles.close}>×</button>
        </div>
        <div className={styles.deck}>Deck: <b>{deckName ?? '(orphan)'}</b></div>

        <div className={styles.grid}>
          <div className={styles.colSpan}>
            <div className={admin.fieldLabel}>_id</div>
            <input
              value={form._id}
              onChange={(e) => setForm({ ...form, _id: e.target.value })}
              placeholder="evt_my_card"
              className={admin.fieldInput}
              style={{ fontFamily: 'Menlo, Monaco, monospace', fontSize: 'var(--fs-body-xs)' }}
            />
          </div>
          <div className={styles.colSpan}>
            <div className={admin.fieldLabel}>Title</div>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={admin.fieldInput}
            />
          </div>
          <div className={styles.colSpan}>
            <div className={admin.fieldLabel}>Description</div>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className={admin.fieldInput}
            />
          </div>
          <div>
            <div className={admin.fieldLabel}>Category</div>
            <input
              list="cat-list"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={admin.fieldInput}
            />
            <datalist id="cat-list">
              {ALL_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <div className={admin.fieldLabel}>Weight</div>
            <input
              type="number"
              min={0}
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              className={admin.fieldInput}
            />
          </div>
          <div>
            <div className={admin.fieldLabel}>Choice 1 text</div>
            <input
              value={form.c1}
              onChange={(e) => setForm({ ...form, c1: e.target.value })}
              className={admin.fieldInput}
            />
          </div>
          <div>
            <div className={admin.fieldLabel}>Choice 2 text</div>
            <input
              value={form.c2}
              onChange={(e) => setForm({ ...form, c2: e.target.value })}
              className={admin.fieldInput}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button onClick={onClose} className={admin.btnSecondary}>Cancel</button>
          <button onClick={() => void saveAndAnother()} disabled={!valid || busy} className={admin.btnSecondary}>Save & stub another</button>
          <button onClick={() => void saveAndOpen()} disabled={!valid || busy} className={admin.btnPrimary}>Save & open editor</button>
        </div>
      </div>
    </div>
  );
}
