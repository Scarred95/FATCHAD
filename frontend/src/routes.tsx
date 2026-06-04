import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import Title from './pages/Title';
import RunList from './pages/RunList';
import NewRun from './pages/NewRun';
import Game from './pages/Game';
import EndScreen from './pages/EndScreen';
import About from './pages/About';
import RouteError from './pages/RouteError';
import Welcome from './pages/Welcome';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Achievements from './pages/Achievements';
import RequireAuth from './components/RequireAuth';
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
    errorElement: <RouteError />,
    children: [
      // Public routes — no login required
      { path: 'welcome', element: <Welcome /> },
      { path: 'about', element: <About /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'forgot-password', element: <ForgotPassword /> },

      // Authenticated routes — redirect to /welcome (the gate) if not logged in.
      // The Title screen lives here too, so the gate is the true first screen.
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <Title /> },
          { path: 'runs', element: <RunList /> },
          { path: 'runs/new', element: <NewRun /> },
          { path: 'runs/:runId', element: <Game /> },
          { path: 'runs/:runId/end', element: <EndScreen /> },
          { path: 'achievements', element: <Achievements /> },
        ],
      },
      {
        path: 'admin',
        // One Suspense boundary on the parent covers the whole admin chunk —
        // children import from the same `./admin` module, so once AdminLayout
        // resolves they're already in memory and never suspend again.
        element: (
          <RequireAdmin>
            <Suspense fallback={adminFallback}>
              <AdminLayout />
            </Suspense>
          </RequireAdmin>
        ),
        children: [
          { index: true, element: <DecksIndex /> },
          { path: 'decks/:name', element: <DeckDetail /> },
          { path: 'graph', element: <GraphView /> },
          { path: 'cards/new', element: <CardEditorPage mode="new" /> },
          { path: 'cards/:id', element: <CardEditorPage mode="edit" /> },
          { path: 'endings', element: <EndingsIndex /> },
          { path: 'endings/new', element: <EndingEditorPage mode="new" /> },
          { path: 'endings/:id', element: <EndingEditorPage mode="edit" /> },
        ],
      },
    ],
  },
]);
