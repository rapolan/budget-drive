import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';
import { landingPathForRole } from '@/utils/roleRouting';

interface RequireRoleProps {
  allow: UserRole[];
  children: React.ReactNode;
}

// Route-level role gate, mirroring the backend's requireRole middleware -
// the frontend nav not showing a link is never the only protection (the
// backend enforces this independently on every affected endpoint); this is
// what stops an allowed-but-wrong-role user from reaching a route by typing
// the URL directly. Must render inside ProtectedRoute (auth check first).
// Redirects to that role's own landing page rather than a blank/error
// screen, so a stray deep link always resolves to somewhere real.
export const RequireRole: React.FC<RequireRoleProps> = ({ allow, children }) => {
  const { user } = useAuth();

  if (!user || !allow.includes(user.role)) {
    return <Navigate to={landingPathForRole(user?.role)} replace />;
  }

  return <>{children}</>;
};
