import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../components/Card/Card';
import Header, { BackArrow, IconButton, MenuDots } from '../components/Header/Header';
import Modal from '../components/Modal/Modal';
import HistoryModal from '../components/HistoryModal/HistoryModal';
import OptionGutter from '../components/OptionGutter/OptionGutter';
import ScreenGlow from '../components/ScreenGlow/ScreenGlow';
import StatRow from '../components/StatBar/StatRow';
import { useChaosAmbient } from '../hooks/useChaosAmbient';
import { useRunStore } from '../stores/runStore';
import { useToastStore } from '../stores/toastStore';
import styles from './Game.module.css';

export default function Game() {
  const { runId } = useParams<{ runId: string }>();
  const nav = useNavigate();
  const pushToast = useToastStore((s) => s.push);

  const state = useRunStore((s) => s.state);
  const currentCard = useRunStore((s) => s.currentCard);
  const lastDeltas = useRunStore((s) => s.lastDeltas);
  const isLoading = useRunStore((s) => s.isLoading);
  const isSubmitting = useRunStore((s) => s.isSubmitting);
  const error = useRunStore((s) => s.error);
  const loadRun = useRunStore((s) => s.loadRun);
  const submitChoice = useRunStore((s) => s.submitChoice);
  const abandon = useRunStore((s) => s.abandonRun);
  const exitRun = useRunStore((s) => s.exitRun);

  const [confirmExit, setConfirmExit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Bubbled up from the Card's swipe hook so the option gutters can light
  // the side the user is pulling toward. Resets to 0 each time a new Card
  // mounts. 'down' is only ever set when the current card has a 3rd choice.
  const [swipeIntent, setSwipeIntent] = useState<-1 | 0 | 1 | 'down'>(0);

  useEffect(() => {
    if (runId && (!state || state._id !== runId)) {
      loadRun(runId);
    }
  }, [runId, state, loadRun]);

  // When the run ends, route to the end screen.
  useEffect(() => {
    if (state && state.status !== 'active') {
      const t = setTimeout(() => nav(`/runs/${state._id}/end`), 1400);
      return () => clearTimeout(t);
    }
  }, [state, nav]);

  useChaosAmbient(state?.stats.chaos);

  const chaosValue = state?.stats.chaos || 0;

  const hasDown = !!currentCard && currentCard.choices.length >= 3;
  // Swipe is enabled on every card. 2-choice cards commit on horizontal
  // swipes (index 0 / 1); 3-choice cards additionally commit on a down
  // swipe (index 2). The gutters remain tappable in all cases.
  const swipeable = !!currentCard && !isSubmitting;

  const handleChoice = useCallback(
    async (index: number) => {
      if (!state || isSubmitting) return;
      if (!currentCard || index < 0 || index >= currentCard.choices.length) return;
      const result = await submitChoice(index);
      if (!result) {
        pushToast('Konnte deine Entscheidung nicht senden', 'error');
      }
    },
    [state, isSubmitting, currentCard, submitChoice, pushToast],
  );

  if (!state) {
    return (
      <main className={`page ${styles.page}`}>
        {error ? (
          <div className={styles.fatal}>
            <p>{error}</p>
            <button onClick={() => runId && loadRun(runId)}>Nochmal versuchen</button>
          </div>
        ) : (
          <div className={styles.fatal}><p className={styles.dim}>Lade Lauf…</p></div>
        )}
      </main>
    );
  }

  const ended = state.status !== 'active';

  return (
    <main className={styles.gamePage}>
      {/* Das perfekt proportionale obere Dreieck */}
      {chaosValue >= 50 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            // Wir begrenzen die Höhe genau auf den oberen Bereich (ca. 45% des Schirms)
            height: '45%',
            backgroundImage: "linear-gradient(rgba(10, 10, 15, 0.4), rgba(10, 10, 15, 0.5)), url('/images/this_is_fine.gif')",

            // 'contain' sorgt dafür, dass das Bild IMMER als Ganzes sichtbar bleibt und sich nicht verzerrt!
            backgroundSize: 'contain',
            backgroundPosition: 'center bottom', // Setzt das Bild direkt auf die untere Spitze des Keils
            backgroundRepeat: 'no-repeat',

            // Ein sauberer, symmetrischer Clip-Path für die obere Hälfte
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            zIndex: .1,
            pointerEvents: 'none'
          }}
        />
      )}
      <ScreenGlow intent={swipeIntent} chaos={state.stats.chaos} hasDown={hasDown} />

      <div className={styles.gameTop} style={{ position: 'relative', zIndex: 10 }}>
        <Header
          left={
            <IconButton label="Zurück" onClick={() => setConfirmExit(true)}>
              <BackArrow />
            </IconButton>
          }
          center={`Zug ${state.turn}`}
          right={
            <IconButton label="Menü" onClick={() => setMenuOpen(true)}>
              <MenuDots />
            </IconButton>
          }
        />

        <StatRow stats={state.stats} deltas={lastDeltas} />
      </div>

      <div className={styles.cardArena}>
        <div className={styles.cardRow}>
          <OptionGutter
            position="left"
            choice={currentCard?.choices[0]}
            active={swipeIntent === -1}
            disabled={isSubmitting || !currentCard || ended}
            onClick={() => handleChoice(0)}
          />

          <div className={styles.cardStack}>
            {/* Peek cards behind for stack illusion */}
            {state.deck[1] && <div className={`${styles.peek} ${styles.peek1}`} aria-hidden />}
            {state.deck[2] && <div className={`${styles.peek} ${styles.peek2}`} aria-hidden />}

            {ended ? (
              <motion.div
                className={styles.endingOverlay}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
              >
                <div className={styles.endingLabel}>Ende</div>
              </motion.div>
            ) : currentCard ? (
              // No AnimatePresence: React 18 StrictMode + framer-motion v11
              // AnimatePresence(mode="wait") has a known bug where the new
              // child mounts at `initial` and never advances to `animate`.
              // A keyed motion.div runs initial→animate reliably on mount.
              <motion.div
                key={currentCard.id}
                initial={{ opacity: 0, y: -32, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                className={styles.cardWrap}
              >
                <Card
                  card={currentCard}
                  swipeable={swipeable}
                  hasDown={hasDown}
                  onCommit={handleChoice}
                  onIntentChange={setSwipeIntent}
                />
              </motion.div>
            ) : (
              <EmptyCard onRetry={() => runId && loadRun(runId)} loading={isLoading} />
            )}
          </div>

          <OptionGutter
            position="right"
            choice={currentCard?.choices[1]}
            active={swipeIntent === 1}
            disabled={isSubmitting || !currentCard || ended}
            onClick={() => handleChoice(1)}
          />
        </div>

        {hasDown && currentCard && (
          <OptionGutter
            position="down"
            choice={currentCard.choices[2]}
            active={swipeIntent === 'down'}
            disabled={isSubmitting || ended}
            onClick={() => handleChoice(2)}
          />
        )}
      </div>

      <Modal
        open={confirmExit}
        title="Schon aufgeben?"
        body="Verständlich. Dein Lauf bleibt gespeichert."
        actions={[
          {
            label: 'Verlassen',
            variant: 'primary',
            onClick: () => {
              setConfirmExit(false);
              exitRun();
              nav('/runs');
            },
          },
          { label: 'Weitermachen', variant: 'ghost', onClick: () => setConfirmExit(false) },
        ]}
        onClose={() => setConfirmExit(false)}
      />

      <Modal
        open={menuOpen}
        title="Menü"
        actions={[
          {
            label: 'Verlauf ansehen',
            variant: 'ghost',
            onClick: () => {
              setMenuOpen(false);
              setHistoryOpen(true);
            },
          },
          {
            label: 'Lauf aufgeben',
            variant: 'danger',
            onClick: async () => {
              setMenuOpen(false);
              await abandon();
            },
          },
          { label: 'Schließen', variant: 'ghost', onClick: () => setMenuOpen(false) },
        ]}
        onClose={() => setMenuOpen(false)}
      />

      <HistoryModal
        open={historyOpen}
        runId={runId ?? null}
        onClose={() => setHistoryOpen(false)}
      />
    </main>
  );
}

function EmptyCard({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
  return (
    <div className={styles.emptyCard}>
      <div>
        <p className={`display ${styles.emptyTitle}`}>
          Die Welt hält den Atem an…
        </p>
        <p className={styles.emptySub}>
          Niemand weiß, was als Nächstes passiert.
        </p>
      </div>
      <button className={styles.retryBtn} onClick={onRetry} disabled={loading}>
        {loading ? 'Lädt…' : 'Weitermachen'}
      </button>
    </div>
  );
}
