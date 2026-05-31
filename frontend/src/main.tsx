import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './styles/reset.css';
import './styles/tokens.css';
import './styles/globals.css';

import { router } from './routes';
import { useAdminStore } from './stores/adminStore';
import { bootAuth } from './auth/bootAuth';

// Pick the auth backend (demo vs Cognito) BEFORE any component renders, so
// App.tsx can read useAuthStore + call getAuthBackend() synchronously.
// Selection is driven by VITE_USE_DEMO_AUTH (see .env.development / .env.production).
bootAuth();

// Fire-and-forget: if we have a stored admin token, ping the backend
// to confirm it's still valid before any admin UI tries to mount.
void useAdminStore.getState().validateOnBoot();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
