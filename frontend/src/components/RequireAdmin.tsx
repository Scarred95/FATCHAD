/**
 * Route guard for the /admin/* surface.
 *
 * Checks both that the user is logged in AND belongs to the Cognito
 * `admin` group. Unauthenticated users go to /login; authenticated
 * non-admins go back to the title screen.
 *
 * Waits out `initializing` so a page reload doesn't flash a redirect
 * before the Cognito session has been restored from localStorage.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface Props {
  children?: React.ReactNode;
}

export default function RequireAdmin({ children }: Props) {
  const userId = useAuthStore((s) => s.userId);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const initializing = useAuthStore((s) => s.initializing);

  if (initializing) return null;
  if (!userId) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children ?? <Outlet />}</>;
}
