/**
 * Route guard for all authenticated routes (gameplay surface).
 *
 * Waits for the Cognito session to be restored from localStorage before
 * deciding whether to redirect — avoids a flash-redirect on page reload
 * while `initFromSession()` is still running.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function RequireAuth() {
  const userId = useAuthStore((s) => s.userId);
  const initializing = useAuthStore((s) => s.initializing);

  if (initializing) return null;
  if (!userId) return <Navigate to="/login" replace />;

  return <Outlet />;
}
