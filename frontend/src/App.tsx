import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider } from '@/contexts/TenantContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/Dashboard';
import { StudentsPage } from '@/pages/Students';
import { SchedulingPage } from '@/pages/Scheduling';

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <AppLayout>
                  <DashboardPage />
                </AppLayout>
              }
            />
            <Route
              path="/students"
              element={
                <AppLayout>
                  <StudentsPage />
                </AppLayout>
              }
            />
            {/* Placeholder routes - will create these pages next */}
            <Route
              path="/instructors"
              element={
                <AppLayout>
                  <div className="text-center text-gray-500">Instructors page - Coming soon</div>
                </AppLayout>
              }
            />
            <Route
              path="/vehicles"
              element={
                <AppLayout>
                  <div className="text-center text-gray-500">Vehicles page - Coming soon</div>
                </AppLayout>
              }
            />
            <Route
              path="/lessons"
              element={
                <AppLayout>
                  <div className="text-center text-gray-500">Lessons page - Coming soon</div>
                </AppLayout>
              }
            />
            <Route
              path="/scheduling"
              element={
                <AppLayout>
                  <SchedulingPage />
                </AppLayout>
              }
            />
            <Route
              path="/payments"
              element={
                <AppLayout>
                  <div className="text-center text-gray-500">Payments page - Coming soon</div>
                </AppLayout>
              }
            />
            <Route
              path="/certificates"
              element={
                <AppLayout>
                  <div className="text-center text-gray-500">Certificates page - Coming soon</div>
                </AppLayout>
              }
            />
            <Route
              path="/follow-ups"
              element={
                <AppLayout>
                  <div className="text-center text-gray-500">Follow-ups page - Coming soon</div>
                </AppLayout>
              }
            />
            <Route
              path="/settings"
              element={
                <AppLayout>
                  <div className="text-center text-gray-500">Settings page - Coming soon</div>
                </AppLayout>
              }
            />
            {/* Catch all - redirect to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TenantProvider>
    </QueryClientProvider>
  );
}

export default App;
