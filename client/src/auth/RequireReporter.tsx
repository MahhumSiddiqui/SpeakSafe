import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useReporter } from './ReporterAuth';

export function RequireReporter({ children }: { children: ReactNode }) {
  const { status, leftOnPurpose } = useReporter();
  const loc = useLocation();
  if (status === 'loading') return <div className="min-h-screen bg-bg" aria-busy="true" />;
  if (status === 'out') return leftOnPurpose ? <Navigate to="/" replace /> : <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useReporter();
  if (status === 'loading') return <div className="min-h-screen bg-bg" aria-busy="true" />;
  if (status === 'in') return <Navigate to="/space" replace />;
  return <>{children}</>;
}
