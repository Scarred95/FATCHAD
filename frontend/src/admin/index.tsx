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
import { EndingEditorPage } from './pages/EndingEditor';
import { CategoriesIndex } from './pages/CategoriesIndex';
import { SuggestionsIndex } from './pages/SuggestionsIndex';
import { CardsIndex } from './pages/CardsIndex';
import { DeckEditorPage } from './pages/DeckEditor';
import { AchievementsIndex } from './pages/AchievementsIndex';
import { AchievementEditorPage } from './pages/AchievementEditor';
import { RunInspector } from './pages/RunInspector';

export { AdminLayout } from './AdminLayout';
export { DecksIndex } from './pages/DecksIndex';
export { DeckDetail } from './pages/DeckDetail';
export { GraphView } from './pages/GraphView';
export { CardEditorPage } from './pages/CardEditor';
export { EndingsIndex } from './pages/EndingsIndex';
export { EndingEditorPage } from './pages/EndingEditor';
export { CategoriesIndex } from './pages/CategoriesIndex';
export { SuggestionsIndex } from './pages/SuggestionsIndex';
export { CardsIndex } from './pages/CardsIndex';
export { DeckEditorPage } from './pages/DeckEditor';
export { AchievementsIndex } from './pages/AchievementsIndex';
export { AchievementEditorPage } from './pages/AchievementEditor';
export { RunInspector } from './pages/RunInspector';

/**
 * Children for the /admin route. Spread these into a parent route whose
 * `element` wraps `<AdminLayout />` with `<RequireAdmin />`.
 */
export const adminChildRoutes: RouteObject[] = [
  { index: true, element: <DecksIndex /> },
  { path: 'decks/:name', element: <DeckDetail /> },
  { path: 'decks-edit/new', element: <DeckEditorPage mode="new" /> },
  { path: 'decks-edit/:name', element: <DeckEditorPage mode="edit" /> },
  { path: 'graph', element: <GraphView /> },
  { path: 'cards', element: <CardsIndex /> },
  { path: 'cards/new', element: <CardEditorPage mode="new" /> },
  { path: 'cards/:id', element: <CardEditorPage mode="edit" /> },
  { path: 'achievements', element: <AchievementsIndex /> },
  { path: 'achievements/new', element: <AchievementEditorPage mode="new" /> },
  { path: 'achievements/:id', element: <AchievementEditorPage mode="edit" /> },
  { path: 'endings', element: <EndingsIndex /> },
  { path: 'endings/new', element: <EndingEditorPage mode="new" /> },
  { path: 'endings/:id', element: <EndingEditorPage mode="edit" /> },
  { path: 'categories', element: <CategoriesIndex /> },
  { path: 'suggestions', element: <SuggestionsIndex /> },
  { path: 'runs', element: <RunInspector /> },
  { path: 'runs/:userId/:runId', element: <RunInspector /> },
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
