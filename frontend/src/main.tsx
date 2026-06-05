import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './styles/reset.css';
import './styles/tokens.css';
import './styles/globals.css';

import { router } from './routes';
import { useAuthStore } from './stores/authStore';
import { useCatalogStore } from './stores/catalogStore';
import { initSettings } from './stores/settingsStore';

// Apply persisted display preferences to <html> before first paint.
initSettings();

// Restore Cognito session from localStorage before the router mounts.
// RequireAuth / RequireAdmin wait on `initializing` so no redirect
// flicker happens while this is in flight.
void useAuthStore.getState().initFromSession();

// Warm the catalog cache on boot. Components that need card/ending data
// (RunList, EndScreen, HistoryModal) call ensureLoaded again on mount —
// it's idempotent and skips the network when the cache is fresh.
void useCatalogStore.getState().ensureLoaded();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
