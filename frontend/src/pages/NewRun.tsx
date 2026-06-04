/** New-run setup — deck selection + start. */
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAvailableDecks } from '../api/client';
import { errorMessage } from '../api/http';
import type { DeckInfo } from '../api/types';
import { useRunStore } from '../stores/runStore';
import { useToastStore } from '../stores/toastStore';
import styles from './NewRun.module.css';

const MIN_DECKS = 1;
const MAX_DECKS = 3;

export default function NewRun() {
  const nav = useNavigate();
  const create = useRunStore((s) => s.createRun);
  const isLoading = useRunStore((s) => s.isLoading);
  const pushToast = useToastStore((s) => s.push);

  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [decksLoading, setDecksLoading] = useState(true);

  useEffect(() => {
    getAvailableDecks()
      .then((available) => {
        setDecks(available);
        // Pre-select all default decks that have a starting card.
        const defaults = available
          .filter((d) => d.is_default && d.has_starting_card)
          .map((d) => d.name);
        setSelected(new Set(defaults));
      })
      .catch(() => pushToast('Decks konnten nicht geladen werden', 'error'))
      .finally(() => setDecksLoading(false));
  }, [pushToast]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        if (next.size <= MIN_DECKS) return prev; // don't go below minimum
        next.delete(name);
      } else {
        if (next.size >= MAX_DECKS) return prev; // don't exceed maximum
        next.add(name);
      }
      return next;
    });
  }

  async function start() {
    if (selected.size < MIN_DECKS) return;
    try {
      const id = await create(Array.from(selected));
      nav(`/runs/${id}`);
    } catch (e) {
      pushToast(errorMessage(e, 'Konnte nicht starten'), 'error');
    }
  }

  const canStart = selected.size >= MIN_DECKS && !isLoading && !decksLoading;

  return (
    <main className={`page ${styles.page}`}>
      <motion.h1
        className={`display ${styles.heading}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        Bereit, die Welt<br />zu ruinieren?
      </motion.h1>

      <motion.div
        className={styles.modifiers}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <p className={styles.deckHint}>
          Wähle {MIN_DECKS}–{MAX_DECKS} Decks ({selected.size}/{MAX_DECKS})
        </p>

        {decksLoading ? (
          <p className={styles.deckLoading}>Lade Decks…</p>
        ) : (
          <div className={styles.deckList}>
            {decks.map((deck) => {
              const isSelected = selected.has(deck.name);
              const isDisabled = !deck.has_starting_card ||
                (!isSelected && selected.size >= MAX_DECKS);
              return (
                <label
                  key={deck.name}
                  className={`${styles.deckToggle} ${isSelected ? styles.deckSelected : ''} ${isDisabled ? styles.deckDisabled : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => toggle(deck.name)}
                  />
                  <span className={styles.deckName}>{deck.name}</span>
                  {deck.description && (
                    <span className={styles.deckDesc}>{deck.description}</span>
                  )}
                  {!deck.has_starting_card && (
                    <small className={styles.note}>(bald)</small>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </motion.div>

      <motion.div
        className={styles.actions}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <button
          className={styles.start}
          onClick={start}
          disabled={!canStart}
        >
          {isLoading ? 'Startet…' : "Los geht's"}
        </button>
        <button className={styles.cancel} onClick={() => nav(-1)}>
          Abbrechen
        </button>
      </motion.div>
    </main>
  );
}
