import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './styles/reset.css';
import './styles/tokens.css';
import './styles/globals.css';

import { router } from './routes';
import { useAdminStore } from './stores/adminStore';
import { useCatalogStore } from './stores/catalogStore';

// Fire-and-forget: if we have a stored admin token, ping the backend
// to confirm it's still valid before any admin UI tries to mount.
void useAdminStore.getState().validateOnBoot();

// Warm the catalog cache on boot. Components that need card/ending data
// (RunList, EndScreen, HistoryModal) call ensureLoaded again on mount —
// it's idempotent and skips the network when the cache is fresh.
void useCatalogStore.getState().ensureLoaded();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
