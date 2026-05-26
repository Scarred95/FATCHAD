/**
 * Admin surface — entry barrel.
 *
 * Intended routes (to be wired into `frontend/src/routes.tsx` under the
 * existing top-level `<App />` route, gated by `<RequireAdmin />`):
 *
 *   {
 *     path: 'admin',
 *     element: <RequireAdmin><AdminLayout /></RequireAdmin>,
 *     children: [
 *       { index: true,                       element: <DecksIndex /> },
 *       { path: 'decks/:name',               element: <DeckDetail /> },
 *       { path: 'graph',                     element: <GraphView /> },
 *       { path: 'cards/new',                 element: <CardEditorPage mode="new" /> },
 *       { path: 'cards/:id',                 element: <CardEditorPage mode="edit" /> },
 *     ],
 *   }
 *
 * `AdminRoutes` below packages the children array so `routes.tsx` only
 * needs to spread it.
 */
import type { RouteObject } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { DecksIndex } from './pages/DecksIndex';
import { DeckDetail } from './pages/DeckDetail';
import { GraphView } from './pages/GraphView';
import { CardEditorPage } from './pages/CardEditor';
import { EndingsIndex } from './pages/EndingsIndex';
import { CategoriesIndex } from './pages/CategoriesIndex';
import { SuggestionsIndex } from './pages/SuggestionsIndex';

export { AdminLayout } from './AdminLayout';
export { DecksIndex } from './pages/DecksIndex';
export { DeckDetail } from './pages/DeckDetail';
export { GraphView } from './pages/GraphView';
export { CardEditorPage } from './pages/CardEditor';
export { EndingsIndex } from './pages/EndingsIndex';
export { CategoriesIndex } from './pages/CategoriesIndex';
export { SuggestionsIndex } from './pages/SuggestionsIndex';

/**
 * Children for the /admin route. Spread these into a parent route whose
 * `element` wraps `<AdminLayout />` with `<RequireAdmin />`.
 */
export const adminChildRoutes: RouteObject[] = [
  { index: true, element: <DecksIndex /> },
  { path: 'decks/:name', element: <DeckDetail /> },
  { path: 'graph', element: <GraphView /> },
  { path: 'cards/new', element: <CardEditorPage mode="new" /> },
  { path: 'cards/:id', element: <CardEditorPage mode="edit" /> },
  { path: 'endings', element: <EndingsIndex /> },
  { path: 'categories', element: <CategoriesIndex /> },
  { path: 'suggestions', element: <SuggestionsIndex /> },
];

/**
 * Drop-in: a complete `/admin` route definition that already wires the
 * layout. The caller still needs to wrap the `element` in
 * `<RequireAdmin>` if they want auth-gated access.
 */
export const adminRoute: RouteObject = {
  path: 'admin',
  element: <AdminLayout />,
  children: adminChildRoutes,
};
