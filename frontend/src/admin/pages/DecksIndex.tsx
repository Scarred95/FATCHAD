/**
 * Decks section — top-level browser of server-side Deck records.
 *
 * The previous version of this page grouped *cards by deck_name* — useful
 * when only cards lived in the database. Now that the backend has real
 * Deck records, the tile reflects the record (name, description, unlock
 * rule, enabled flag) and pulls card stats from the card store as a
 * derived view.
 *
 * "Shadow decks" — deck_names present on cards but not yet promoted to a
 * record — are surfaced inline with a hint so the admin can create the
 * missing record.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminCardStore, cardsInDeck, deckNamesOf } from '../store';
import { useAdminDeckStore } from '../deckStore';
import { SectionToolbar, type ViewMode } from '../components/SectionToolbar';
import { DeckTile } from '../components/DeckTile';
import { Toggle } from '../components/Toggle';
import { ImportExportBar } from '../components/ImportExportBar';
import type { Card, Deck } from '../types';
import styles from './DecksIndex.module.css';

type SortKey = 'name' | 'cards' | 'updated';

const SORT_OPTIONS = [
  { value: 'name',    label: 'A–Z' },
  { value: 'cards',   label: 'Karten' },
  { value: 'updated', label: 'Zuletzt geändert' },
];

/** Synth Deck record for a deck_name that exists on cards but not yet on
 *  the server. Marked with `__shadow__` so we can render a hint and link
 *  the row to "promote to record" instead of the normal edit page. */
interface ShadowDeck extends Deck {
  __shadow__: true;
}

function isShadow(d: Deck | ShadowDeck): d is ShadowDeck {
  return (d as ShadowDeck).__shadow__ === true;
}

export function DecksIndex() {
  const cards = useAdminCardStore((s) => s.cards);
  const decks = useAdminDeckStore((s) => s.decks);
  const setDeckRecordEnabled = useAdminDeckStore((s) => s.setDeckRecordEnabled);
  const nav = useNavigate();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('tile');

  // Build the union of {server-side Decks} ∪ {deck_names referenced on
  // cards without a record}. Shadow rows surface the gap so the admin
  // can promote them — we never silently drop cards' deck_name values.
  const rows = useMemo<(Deck | ShadowDeck)[]>(() => {
    const byName = new Map<string, Deck | ShadowDeck>();
    for (const d of decks) byName.set(d.name, d);
    for (const name of deckNamesOf(cards)) {
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          description: '',
          enabled: true,
          unlock_rule: { kind: 'default' },
          __shadow__: true,
        });
      }
    }
    return [...byName.values()];
  }, [decks, cards]);

  const cardsByDeck = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const r of rows) map.set(r.name, cardsInDeck(cards, r.name));
    return map;
  }, [rows, cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (d: Deck | ShadowDeck) => {
      if (!q) return true;
      return [d.name, d.description ?? ''].some((s) => s.toLowerCase().includes(q));
    };
    const list = rows.filter(matches);
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'cards') {
        return (cardsByDeck.get(b.name)?.length ?? 0)
          - (cardsByDeck.get(a.name)?.length ?? 0);
      }
      // 'updated' — shadow rows have no timestamp, sink to bottom.
      const at = a.updated_at ?? '';
      const bt = b.updated_at ?? '';
      return bt.localeCompare(at);
    });
    return list;
  }, [rows, search, sort, cardsByDeck]);

  return (
    <div className={styles.page}>
      <SectionToolbar
        title="Decks"
        count={decks.length}
        noun="Decks"
        search={search} onSearch={setSearch}
        sortOptions={SORT_OPTIONS}
        sort={sort} onSort={(v) => setSort(v as SortKey)}
        viewMode={viewMode} onViewMode={setViewMode}
        extras={<ImportExportBar />}
        primaryAction={{ label: 'Neues Deck', onClick: () => nav('/admin/decks-edit/new') }}
      />

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyGlyph}>—</div>
          <h2 className={styles.emptyTitle}>Keine Decks</h2>
          <p className={styles.emptySub}>Lege ein erstes Deck an, um Karten zu gruppieren.</p>
        </div>
      ) : viewMode === 'tile' ? (
        <div className={styles.tileGrid}>
          {filtered.map((d) => (
            <div key={d.name} className={styles.tileWrap}>
              {isShadow(d) && (
                <div className={styles.shadowHint}>
                  Noch kein Datensatz —{' '}
                  <button
                    type="button"
                    className={styles.shadowAction}
                    onClick={() => nav(`/admin/decks-edit/new?name=${encodeURIComponent(d.name)}`)}
                  >
                    anlegen
                  </button>
                </div>
              )}
              <DeckTile
                deck={d}
                cards={cardsByDeck.get(d.name) ?? []}
                onToggleEnabled={() => {
                  if (isShadow(d)) return; // can't toggle a non-existent record
                  void setDeckRecordEnabled(d.name, d.enabled === false);
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Deck</th>
              <th>Beschreibung</th>
              <th>Unlock</th>
              <th className={styles.num}>Karten</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const list = cardsByDeck.get(d.name) ?? [];
              const shadow = isShadow(d);
              const unlock = d.unlock_rule ?? { kind: 'default' };
              return (
                <tr key={d.name} className={d.enabled === false ? styles.rowOff : ''}>
                  <td>
                    <Toggle
                      on={d.enabled !== false}
                      onToggle={() => {
                        if (shadow) {
                          nav(`/admin/decks-edit/new?name=${encodeURIComponent(d.name)}`);
                          return;
                        }
                        void setDeckRecordEnabled(d.name, d.enabled === false);
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.rowTitle}
                      onClick={() => nav(`/admin/decks/${encodeURIComponent(d.name)}`)}
                    >
                      {d.name}
                    </button>
                    {shadow && <span className={styles.shadowTag}>Schatten</span>}
                  </td>
                  <td className={styles.descCell}>{d.description || '—'}</td>
                  <td className={styles.mono}>
                    {unlock.kind === 'achievement'
                      ? `★ ${unlock.achievement_id ?? '—'}`
                      : 'standard'}
                  </td>
                  <td className={styles.num}>{list.length}</td>
                  <td>
                    {shadow ? (
                      <button
                        type="button"
                        className={styles.shadowAction}
                        onClick={() => nav(`/admin/decks-edit/new?name=${encodeURIComponent(d.name)}`)}
                      >
                        anlegen
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.editAction}
                        onClick={() => nav(`/admin/decks-edit/${encodeURIComponent(d.name)}`)}
                      >
                        bearbeiten
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
