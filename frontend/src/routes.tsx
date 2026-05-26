import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import Title from './pages/Title';
import RunList from './pages/RunList';
import NewRun from './pages/NewRun';
import Game from './pages/Game';
import EndScreen from './pages/EndScreen';
import About from './pages/About';
import RequireAdmin from './components/RequireAdmin';

/**
 * Admin surface is lazy-loaded so reactflow/zod/jszip don't bloat the
 * gameplay bundle. All five admin routes import from `./admin` — Vite
 * collapses them into a single shared admin chunk.
 */
const AdminLayout = lazy(() =>
  import('./admin').then((m) => ({ default: m.AdminLayout })),
);
const DecksIndex = lazy(() =>
  import('./admin').then((m) => ({ default: m.DecksIndex })),
);
const DeckDetail = lazy(() =>
  import('./admin').then((m) => ({ default: m.DeckDetail })),
);
const GraphView = lazy(() =>
  import('./admin').then((m) => ({ default: m.GraphView })),
);
const CardEditorPage = lazy(() =>
  import('./admin').then((m) => ({ default: m.CardEditorPage })),
);
const EndingsIndex = lazy(() =>
  import('./admin').then((m) => ({ default: m.EndingsIndex })),
);
const EndingEditorPage = lazy(() =>
  import('./admin').then((m) => ({ default: m.EndingEditorPage })),
);

const adminFallback = (
  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-faint)' }}>
    Lade Admin…
  </div>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Title /> },
      { path: 'runs', element: <RunList /> },
      { path: 'runs/new', element: <NewRun /> },
      { path: 'runs/:runId', element: <Game /> },
      { path: 'runs/:runId/end', element: <EndScreen /> },
      { path: 'about', element: <About /> },
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            <Suspense fallback={adminFallback}>
              <AdminLayout />
            </Suspense>
          </RequireAdmin>
        ),
        children: [
          { index: true, element: <Suspense fallback={adminFallback}><DecksIndex /></Suspense> },
          { path: 'decks/:name', element: <Suspense fallback={adminFallback}><DeckDetail /></Suspense> },
          { path: 'graph', element: <Suspense fallback={adminFallback}><GraphView /></Suspense> },
          { path: 'cards/new', element: <Suspense fallback={adminFallback}><CardEditorPage mode="new" /></Suspense> },
          { path: 'cards/:id', element: <Suspense fallback={adminFallback}><CardEditorPage mode="edit" /></Suspense> },
          { path: 'endings', element: <Suspense fallback={adminFallback}><EndingsIndex /></Suspense> },
          { path: 'endings/new', element: <Suspense fallback={adminFallback}><EndingEditorPage mode="new" /></Suspense> },
          { path: 'endings/:id', element: <Suspense fallback={adminFallback}><EndingEditorPage mode="edit" /></Suspense> },
        ],
      },
    ],
  },
]);
