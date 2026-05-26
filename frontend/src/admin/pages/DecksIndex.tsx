import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { decksOf, useAdminCardStore } from '../store';
import { ImportExportBar } from '../components/ImportExportBar';
import { validateCard } from '../utils/validate';
import { dropRecent, loadRecents, timeAgo, type RecentEntry } from '../utils/recents';
import type { Card } from '../types';
import admin from '../admin.module.css';
import styles from './DecksIndex.module.css';

function deckHas3Choice(cards: Card[]) {
  return cards.some((c) => c.choices.length === 3);
}
function deckHasQuestline(cards: Card[]) {
  return cards.some((c) =>
    c.choices.some((ch) => (ch.adds_to_deck?.length ?? 0) > 0)
    || c.important
    || (c.weight ?? 10) === 0,
  );
}
function categoryBreakdown(cards: Card[]) {
  const map = new Map<string, number>();
  for (const c of cards) map.set(c.category, (map.get(c.category) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

interface DeckHealth { errors: number; warnings: number }

/** Count cards in a deck that have at least one error / warning. */
function deckHealth(deckCards: Card[], allCards: Card[]): DeckHealth {
  let errors = 0;
  let warnings = 0;
  for (const c of deckCards) {
    const issues = validateCard(c, allCards);
    if (issues.some((i) => i.level === 'error')) errors++;
    else if (issues.some((i) => i.level === 'warning')) warnings++;
  }
  return { errors, warnings };
}

export function DecksIndex() {
  const cards = useAdminCardStore((s) => s.cards);
  const decks = decksOf(cards);

  // Recently-edited rail: read from localStorage once + after each save.
  // We refresh when `cards` changes because that's the only signal we
  // need — markRecent is called from the store's upsert path.
  const [recents, setRecents] = useState<RecentEntry[]>(() => loadRecents());
  useEffect(() => { setRecents(loadRecents()); }, [cards]);

  const recentResolved = useMemo(() => {
    const byId = new Map(cards.map((c) => [c._id, c]));
    return recents
      .map((r) => ({ entry: r, card: byId.get(r.id) }))
      .filter((x): x is { entry: RecentEntry; card: Card } => !!x.card)
      .slice(0, 5);
  }, [recents, cards]);

  const onForgetRecent = (id: string) => {
    dropRecent(id);
    setRecents(loadRecents());
  };

  // Health map: deck key → counts. Recomputed when the card set changes.
  const healthByDeck = useMemo(() => {
    const out = new Map<string, DeckHealth>();
    for (const [name, list] of decks.entries()) {
      out.set(name, deckHealth(list, cards));
    }
    return out;
    // decks is derived from cards; only re-run on cards changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const totalErrors = useMemo(
    () => [...healthByDeck.values()].reduce((n, h) => n + h.errors, 0),
    [healthByDeck],
  );
  const totalWarnings = useMemo(
    () => [...healthByDeck.values()].reduce((n, h) => n + h.warnings, 0),
    [healthByDeck],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>FATCHAD — Card Editor</h1>
          <p className={styles.sub}>
            {cards.length} card(s) · {[...decks.keys()].filter(Boolean).length} deck(s)
            {totalErrors > 0 && (
              <span className={styles.totalError}> · {totalErrors} error{totalErrors === 1 ? '' : 's'}</span>
            )}
            {totalWarnings > 0 && (
              <span className={styles.totalWarn}> · {totalWarnings} warning{totalWarnings === 1 ? '' : 's'}</span>
            )}
          </p>
        </div>
        <div className={styles.actions}>
          <Link to="/admin/graph" className={admin.btnSecondary}>Graph view</Link>
          <ImportExportBar />
        </div>
      </header>

      {recentResolved.length > 0 && (
        <div className={`${admin.panel} ${styles.recentsRail}`}>
          <div className={styles.recentsHead}>
            <span className={styles.recentsLabel}>Recently edited</span>
          </div>
          <div className={styles.recentsList}>
            {recentResolved.map(({ entry, card }) => (
              <div key={card._id} className={styles.recentItem}>
                <Link
                  to={`/admin/cards/${encodeURIComponent(card._id)}`}
                  className={styles.recentLink}
                >
                  <span className={styles.recentTitle}>{card.title || card._id}</span>
                  <span className={styles.recentMeta}>
                    {card.deck_name ?? 'orphan'} · {timeAgo(entry.at)}
                  </span>
                </Link>
                <button
                  type="button"
                  className={styles.recentDrop}
                  onClick={() => onForgetRecent(card._id)}
                  aria-label={`Forget ${card._id}`}
                  title="Aus der Liste entfernen"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {cards.length === 0 && (
        <div className={`${admin.panel} ${styles.empty}`}>
          <div className={styles.emptyTitle}>No cards loaded.</div>
          <div style={{ fontSize: 'var(--fs-body-sm)' }}>
            Use <b>Import JSON…</b> to drop in an existing deck, or create one from scratch.
          </div>
          <Link to="/admin/cards/new" className={admin.btnPrimary}>+ New card</Link>
        </div>
      )}

      <div className={styles.grid}>
        {[...decks.entries()]
          .sort(([a], [b]) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return a.localeCompare(b);
          })
          .map(([name, list]) => {
            const isOrphan = name === '';
            const key = isOrphan ? '__orphans__' : name;
            const breakdown = categoryBreakdown(list);
            const health = healthByDeck.get(name) ?? { errors: 0, warnings: 0 };
            return (
              <Link
                key={key}
                to={`/admin/decks/${encodeURIComponent(key)}`}
                className={`${admin.panel} ${styles.deck}`}
              >
                <div className={styles.deckHead}>
                  <div className={styles.deckName}>{isOrphan ? 'Orphans (no deck_name)' : name}</div>
                  <div className={styles.deckChips}>
                    {health.errors > 0 && (
                      <span className={styles.errorBadge} title={`${health.errors} card(s) with validation errors`}>
                        {health.errors} err
                      </span>
                    )}
                    {health.warnings > 0 && (
                      <span className={styles.warnBadge} title={`${health.warnings} card(s) with warnings`}>
                        {health.warnings} warn
                      </span>
                    )}
                    {deckHasQuestline(list) && <span className={admin.chip}>questline</span>}
                    {deckHas3Choice(list) && <span className={admin.chip}>3-choice</span>}
                  </div>
                </div>
                <div className={styles.deckCount}>
                  {list.length} card(s)
                  {(() => {
                    const enabled = list.filter((c) => c.enabled !== false).length;
                    const disabled = list.length - enabled;
                    if (disabled === 0) return null;
                    return (
                      <span className={styles.deckCountDisabled}> · {disabled} disabled</span>
                    );
                  })()}
                </div>
                <div className={styles.deckBreakdown}>
                  {breakdown.slice(0, 6).map(([cat, n]) => (
                    <span key={cat} className={admin.chip}>{cat} · {n}</span>
                  ))}
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
