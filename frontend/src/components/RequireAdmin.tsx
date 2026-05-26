/**
 * Route guard for the /admin/* surface.
 *
 * Wrap any admin route element with <RequireAdmin>...</RequireAdmin>
 * (or use it as the `element` of a parent route with an <Outlet />).
 * If the adminStore doesn't have a confirmed admin session it kicks
 * the user back to the title screen.
 *
 * We also wait out the boot-time `validating` flag so a quick refresh
 * doesn't flash a redirect before /ping has a chance to confirm the
 * stored token.
 */
import { Navigate, Outlet } from 'react-router-dom';

import { useAdminStore } from '../stores/adminStore';

interface Props {
  children?: React.ReactNode;
}

export default function RequireAdmin({ children }: Props) {
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const validating = useAdminStore((s) => s.validating);

  if (validating) {
    // Boot-time ping in flight — render nothing rather than flicker
    // through a redirect. Cheap and rare.
    return null;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
