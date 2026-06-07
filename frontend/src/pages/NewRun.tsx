/** New-run setup — starts a fresh run with a tutorial toggle and a deck picker. */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import { errorMessage } from '../api/http';
import type { DeckOption } from '../api/types';
import Ambient from '../components/Ambient/Ambient';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useRunStore } from '../stores/runStore';
import { useToastStore } from '../stores/toastStore';
import styles from './NewRun.module.css';

const MIN_DECKS = 2;

export default function NewRun() {
  const nav = useNavigate();
  const create = useRunStore((s) => s.createRun);
  const isLoading = useRunStore((s) => s.isLoading);
  const pushToast = useToastStore((s) => s.push);

  const [skipTutorial, setSkipTutorial] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEscapeKey(pickerOpen, () => setPickerOpen(false));

  // Pull the player's available decks once so the picker has data to show.
  useEffect(() => {
    let cancelled = false;
    setDecksLoading(true);
    api
      .listDecks()
      .then((d) => {
        if (!cancelled) setDecks(d);
      })
      .catch((e) => {
        if (!cancelled) pushToast(errorMessage(e, 'Decks konnten nicht geladen werden'), 'error');
      })
      .finally(() => {
        if (!cancelled) setDecksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  function toggleDeck(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function start() {
    if (selected.size < MIN_DECKS) {
      // Error toast plays the error sfx via the toast store.
      pushToast(`Wähle mindestens ${MIN_DECKS} Decks`, 'error');
      return;
    }
    try {
      const id = await create({
        tutorial: !skipTutorial,
        deck_ids: [...selected],
      });
      nav(`/runs/${id}`);
    } catch (e) {
      pushToast(errorMessage(e, 'Konnte nicht starten'), 'error');
    }
  }

  // Stays clickable even with too few decks so the click gives error feedback
  // (sfx + toast) instead of a dead, silent button. Only loading disables it.
  const canStart = !isLoading && !decksLoading;

  return (
    <main className={`page ${styles.page}`}>
      <Ambient />
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
        <label className={styles.toggle}>
          <span>Tutorial überspringen</span>
          <input
            type="checkbox"
            checked={skipTutorial}
            onChange={(e) => setSkipTutorial(e.target.checked)}
          />
        </label>

        <button
          type="button"
          className={styles.deckButton}
          onClick={() => setPickerOpen(true)}
        >
          <span>Decks wählen</span>
          <small className={styles.deckCount}>
            {selected.size > 0 ? `${selected.size} gewählt` : 'Standard'}
          </small>
        </button>
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

      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => setPickerOpen(false)}
          >
            <motion.div
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-label="Decks wählen"
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className={`display ${styles.dialogTitle}`}>Decks wählen</h2>
              <p className={styles.dialogHint}>
                Ohne Auswahl spielst du mit den Standard-Decks.
              </p>

              {decksLoading ? (
                <p className={styles.dialogEmpty}>Lädt…</p>
              ) : decks.length === 0 ? (
                <p className={styles.dialogEmpty}>Keine Decks freigeschaltet.</p>
              ) : (
                <div className={styles.deckGrid}>
                  {decks.map((d) => {
                    const isSelected = selected.has(d.name);
                    return (
                      <button
                        key={d.name}
                        type="button"
                        className={styles.deckTile}
                        data-selected={isSelected}
                        aria-pressed={isSelected}
                        onClick={() => toggleDeck(d.name)}
                      >
                        <span className={styles.deckTitle}>{d.name}</span>
                        {d.image_url && (
                          <span
                            className={styles.deckPhoto}
                            style={{ backgroundImage: `url(${d.image_url})` }}
                            aria-hidden
                          />
                        )}
                        {d.description && (
                          <span className={styles.deckDesc}>{d.description}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className={styles.dialogActions}>
                <button
                  className={styles.dialogDone}
                  onClick={() => setPickerOpen(false)}
                >
                  Fertig
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
