import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Screen } from '../Screen.tsx';
import { NotAllowed } from '../routes/auth/AuthPages.tsx';
import { isStaffRole, useOptionalAuth } from './authContext.ts';

export interface RequireAuthProps {
  children: ReactNode;
  /** `staff`: staff and the super admin. `admin`: the super admin only. */
  role?: 'staff' | 'admin';
}

/**
 * Shows `children` to a signed-in account with the right role. Signed out: goes to sign-in and
 * comes back after. Without an AuthProvider (unit tests of single screens) it lets everything
 * through.
 */
export function RequireAuth({ children, role }: RequireAuthProps) {
  const auth = useOptionalAuth();
  const location = useLocation();
  if (!auth) return children;
  if (auth.state.status === 'loading')
    return (
      <Screen>
        <p role="status">Loading…</p>
      </Screen>
    );
  const user = auth.user;
  if (!user) {
    const staffPage = role !== undefined;
    return (
      <Navigate
        to={staffPage ? '/staff/login' : '/login'}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  if (role === 'staff' && !isStaffRole(user.role))
    return (
      <Screen title="Not available">
        <NotAllowed what="This page is for staff." />
      </Screen>
    );
  if (role === 'admin' && user.role !== 'admin')
    return (
      <Screen title="Not available">
        <NotAllowed what="This page is for the super admin." />
      </Screen>
    );
  return children;
}
