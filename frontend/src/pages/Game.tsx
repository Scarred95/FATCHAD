import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Card from '../components/Card/Card';
import ChoiceButton from '../components/ChoiceButton/ChoiceButton';
import Header, { BackArrow, IconButton, MenuDots } from '../components/Header/Header';
import Modal from '../components/Modal/Modal';
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
  // Bubbled up from the Card's swipe hook so the choice buttons can mirror
  // the active commit direction. Resets to 0 each time a new Card mounts.
  const [swipeIntent, setSwipeIntent] = useState<-1 | 0 | 1>(0);

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

  // 2-choice swipe: index 0 = swipe left, index 1 = swipe right.
  const swipeable = !!currentCard && currentCard.choices.length === 2 && !isSubmitting;

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
    <main className={`page ${styles.page}`}>
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

      <div className={styles.cardArea}>
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
          // AnimatePresence(mode="wait") has a known bug where the new child
          // mounts at `initial` and never advances to `animate`. Keyed
          // motion.div alone runs initial→animate reliably on each mount.
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
              onCommit={handleChoice}
              onIntentChange={setSwipeIntent}
            />
          </motion.div>
        ) : (
          <EmptyCard onRetry={() => runId && loadRun(runId)} loading={isLoading} />
        )}
      </div>

      {!ended && currentCard && (
        <ChoiceRow
          card={currentCard}
          intent={swipeable ? swipeIntent : 0}
          disabled={isSubmitting}
          onChoose={handleChoice}
        />
      )}

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
    </main>
  );
}

interface ChoiceRowProps {
  card: import('../api/types').CardResponse;
  intent: -1 | 0 | 1;
  disabled: boolean;
  onChoose: (i: number) => void;
}

function ChoiceRow({ card, intent, disabled, onChoose }: ChoiceRowProps) {
  if (card.choices.length === 2) {
    return (
      <div className={styles.choices2}>
        <ChoiceButton
          choice={card.choices[0]}
          index={0}
          arrow={-1}
          active={intent === -1}
          disabled={disabled}
          onClick={onChoose}
        />
        <ChoiceButton
          choice={card.choices[1]}
          index={1}
          arrow={1}
          active={intent === 1}
          disabled={disabled}
          onClick={onChoose}
        />
      </div>
    );
  }

  return (
    <div className={styles.choices3}>
      {card.choices.map((c, i) => (
        <ChoiceButton
          key={i}
          choice={c}
          index={i}
          arrow={0}
          disabled={disabled}
          onClick={onChoose}
        />
      ))}
    </div>
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
