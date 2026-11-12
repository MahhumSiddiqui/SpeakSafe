import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useStaff } from './StaffAuth';

export function RequireStaff({ role, children }: { role: 'HANDLER' | 'ADMIN'; children: ReactNode }) {
  const { status, me } = useStaff();
  if (status === 'loading') return <div className="min-h-screen bg-bg" aria-busy="true" />;
  if (status === 'out' || !me) return <Navigate to="/staff/login" replace />;
  if (me.role !== role) return <Navigate to={me.role === 'ADMIN' ? '/admin' : '/staff'} replace />;
  return <>{children}</>;
}
