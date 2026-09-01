import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/common';
import { DashboardPage } from '@/pages/Dashboard';
import { StudentsPage } from '@/pages/Students';
import { InstructorsPage } from '@/pages/Instructors';
import { VehiclesPage } from '@/pages/Vehicles';
import { LessonsPage } from '@/pages/Lessons';
import { ReviewQueuePage } from '@/pages/ReviewQueue';
import { CertificatesPage } from '@/pages/Certificates';
import { CertificatePrintPage } from '@/pages/CertificatePrint';
import { ClassroomPage } from '@/pages/Classroom';
import { SchedulingPage } from '@/pages/Scheduling';
import TreasuryPage from '@/pages/Treasury';
import { InstructorEarningsPage } from '@/pages/InstructorEarnings';
import { NotificationSettingsPage } from '@/pages/NotificationSettings';
import { PaymentsPage } from '@/pages/Payments';
import NotificationHistory from '@/pages/NotificationHistory';
import { SettingsPage } from '@/pages/Settings';
import { LoginPage } from '@/pages/Login';
import { AcceptInvitePage } from '@/pages/AcceptInvite';

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
      <div className="min-h-screen bg-appbg flex items-center justify-center">
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

// Redirects to the dashboard when a feature flag is off - unlike the
// sidebar, which only hides the nav link, this actually blocks the route
// itself so a disabled feature isn't reachable-but-broken by direct URL.
// Must render inside TenantProvider (i.e. inside ProtectedRoute).
const FeatureFlagRoute: React.FC<{ flag: 'enableDriverEducation'; children: React.ReactNode }> = ({
  flag,
  children,
}) => {
  const { settings } = useTenant();
  if (settings && settings[flag] !== true) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public route - Login */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />

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
        path="/review-queue"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ReviewQueuePage />
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
              <CertificatesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      {/* No AppLayout - a bare page for the Print button to open in a new
          tab, with no sidebar/nav chrome to hide or fight during print. */}
      <Route
        path="/certificates/:id/print"
        element={
          <ProtectedRoute>
            <CertificatePrintPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classroom"
        element={
          <ProtectedRoute>
            <FeatureFlagRoute flag="enableDriverEducation">
              <AppLayout>
                <ClassroomPage />
              </AppLayout>
            </FeatureFlagRoute>
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
    <ThemeProvider>
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
    </ThemeProvider>
  );
}

export default App;
