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
import { preloadSfx, initClickSfx } from './audio/sfx';
import { initMusicAutostart } from './audio/music';

// Apply persisted display preferences to <html> before first paint.
initSettings();

// Warm the SFX cache so the first click/swipe plays without a fetch delay.
// No-ops gracefully until the audio assets land under /audio.
preloadSfx();

// Play the click cue on every button/link app-wide via one delegated listener.
initClickSfx();

// Start the background loop on the first user gesture anywhere — covers mock
// mode and already-logged-in reloads that skip the login submit.
initMusicAutostart();

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
