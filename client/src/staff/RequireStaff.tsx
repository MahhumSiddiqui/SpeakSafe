import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useStaff } from './StaffAuth';

/** role: which role may open the page; omit for pages any staff member may open (My account). */
export function RequireStaff({ role, children }: { role?: 'HANDLER' | 'ADMIN'; children: ReactNode }) {
  const { status, me } = useStaff();
  const loc = useLocation();
  if (status === 'loading') return <div className="min-h-screen bg-bg" aria-busy="true" />;
  if (status === 'out' || !me) return <Navigate to="/staff/login" replace />;
  // A one-time password from the admin must be replaced before anything else.
  if (me.mustChangePassword && loc.pathname !== '/staff/account') return <Navigate to="/staff/account" replace />;
  if (role && me.role !== role) return <Navigate to={me.role === 'ADMIN' ? '/admin' : '/staff'} replace />;
  return <>{children}</>;
}
