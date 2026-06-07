/**
 * Root route errorElement — catches anything a route throws (render crash,
 * failed lazy chunk, 404). Themed, faintly amused fallback instead of React
 * Router's raw stack-trace screen.
 */
import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import Ambient from '../components/Ambient/Ambient';
import { playSfx } from '../audio/sfx';
import styles from './RouteError.module.css';

// Stat-flavored quips, picked at random so the same crash reads differently
// each time. Tone matches the rest of the game: it's your fault, obviously.
const QUIPS = [
  'Du hast deine letzten Moneten in diesen Bug investiert.',
  'Die Aura war negativ. Die App auch.',
  'Niemand respektiert eine 500. Nicht mal der Server.',
  'Kein Rizz der Welt rettet diesen Stacktrace.',
  'Chaos ±100 erreicht. Glückwunsch, die App ist gewonnen.',
  'Das war keine schlechte Entscheidung. Das war DIE schlechte Entscheidung.',
];

export default function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  // Sting the error cue when the fallback mounts (404 or any thrown route).
  useEffect(() => {
    playSfx('error');
  }, []);

  const code = notFound ? '404' : '500';
  const title = notFound ? 'Hier ist nichts' : 'Etwas ist zerbrochen';
  const quip = notFound
    ? 'Diese Seite existiert nur in einer Welt, die du noch nicht ruiniert hast.'
    : QUIPS[Math.floor(Math.random() * QUIPS.length)];

  return (
    <main className={`page ${styles.page}`}>
      <Ambient />

      <div className={styles.block}>
        <h1 className={`display ${styles.code}`} data-text={code}>
          {code}
        </h1>
        <h2 className={`display ${styles.title}`}>{title}</h2>
        <p className={styles.quip}>{quip}</p>

        <div className={styles.actions}>
          <Link to="/" className={styles.primary}>
            Zurück zum Anfang
          </Link>
          <button className={styles.secondary} onClick={() => location.reload()}>
            Nochmal versuchen
          </button>
        </div>
      </div>
    </main>
  );
}
