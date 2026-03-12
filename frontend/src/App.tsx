import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider } from '@/contexts/TenantContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/common';
import { DashboardPage } from '@/pages/Dashboard';
import { StudentsPage } from '@/pages/Students';
import { InstructorsPage } from '@/pages/Instructors';
import { VehiclesPage } from '@/pages/Vehicles';
import { LessonsPage } from '@/pages/Lessons';
import { SchedulingPage } from '@/pages/Scheduling';
import TreasuryPage from '@/pages/Treasury';
import { InstructorEarningsPage } from '@/pages/InstructorEarnings';
import { NotificationSettingsPage } from '@/pages/NotificationSettings';
import { PaymentsPage } from '@/pages/Payments';
import NotificationHistory from '@/pages/NotificationHistory';
import { SettingsPage } from '@/pages/Settings';
import { LoginPage } from '@/pages/Login';

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// AuthenticatedApp wraps TenantProvider INSIDE the auth check so it only
// fetches tenant data when the user is actually logged in.
const AuthenticatedApp: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <>{children}</>;
  return <TenantProvider>{children}</TenantProvider>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public route - Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <AppLayout>
              <StudentsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructors"
        element={
          <ProtectedRoute>
            <AppLayout>
              <InstructorsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicles"
        element={
          <ProtectedRoute>
            <AppLayout>
              <VehiclesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/lessons"
        element={
          <ProtectedRoute>
            <AppLayout>
              <LessonsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduling"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SchedulingPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/instructor-earnings"
        element={
          <ProtectedRoute>
            <AppLayout>
              <InstructorEarningsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PaymentsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/treasury"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TreasuryPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/certificates"
        element={
          <ProtectedRoute>
            <AppLayout>
              <div className="text-center text-gray-500">Certificates page - Coming soon</div>
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/follow-ups"
        element={
          <ProtectedRoute>
            <AppLayout>
              <div className="text-center text-gray-500">Follow-ups page - Coming soon</div>
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <AppLayout>
              <NotificationSettingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notification-history"
        element={
          <ProtectedRoute>
            <AppLayout>
              <NotificationHistory />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      {/* Catch all - redirect to dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AuthenticatedApp>
              <AppRoutes />
            </AuthenticatedApp>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
