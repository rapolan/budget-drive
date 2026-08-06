import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './Dashboard';
import { studentsApi, instructorsApi, lessonsApi, paymentsApi, dashboardApi } from '@/api';
import type { Student } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn() },
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn() },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn() },
    paymentsApi: { ...actual.paymentsApi, getAll: vi.fn() },
    dashboardApi: { ...actual.dashboardApi, getNoShowAlerts: vi.fn(), dismissAlert: vi.fn() },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}));

afterEach(cleanup);

function emptyStudent(overrides: Partial<Student>): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    email: 'test@example.com',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    totalHoursCompleted: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Dashboard alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('renders the Alerts card when only the turning-18 alert has data (regression guard for the gate OR)', async () => {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'turning-18-student',
          fullName: 'Almost Eighteen',
          dateOfBirth: eighteenYearsAgo,
          progress: {
            track: 'hours',
            hoursCompleted: 1,
            hoursScheduled: 0,
            hoursRequired: 6,
            displayLabel: '1 / 6 hrs',
            percentComplete: 17,
            needsDateOfBirth: false,
          },
        }),
      ],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alerts')).toBeInTheDocument();
    });
    expect(screen.getByText('Turning 18')).toBeInTheDocument();
  });

  it('does NOT show a turning-18 alert for a student who has already booked enough hours to finish', async () => {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'fully-booked-student',
          fullName: 'Fully Booked',
          dateOfBirth: eighteenYearsAgo,
          progress: {
            track: 'hours',
            hoursCompleted: 2,
            hoursScheduled: 4,
            hoursRequired: 6, // 2 + 4 = 6, not under-booked
            displayLabel: '2 / 6 hrs',
            percentComplete: 33,
            needsDateOfBirth: false,
          },
        }),
      ],
    });

    renderDashboard();

    // Wait for the students query to resolve, then assert the alert never appears.
    await waitFor(() => {
      expect(studentsApi.getAll).toHaveBeenCalled();
    });
    expect(screen.queryByText('Turning 18')).not.toBeInTheDocument();
  });

  it('renders the Alerts card when only the no-show alert has data (regression guard for the gate OR)', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ studentId: 'student-1', studentName: 'Jane Doe', noShowDate: '2026-08-01', notificationId: 'notif-1' }],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alerts')).toBeInTheDocument();
    });
    expect(screen.getByText('No-Show Follow-Up')).toBeInTheDocument();
  });

  it('the no-show alert disappears after dismissal (simulating the auto-clear-on-booking refetch)', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        data: [{ studentId: 'student-1', studentName: 'Jane Doe', noShowDate: '2026-08-01', notificationId: 'notif-1' }],
      })
      .mockResolvedValueOnce({ data: [] }); // post-dismiss refetch
    (dashboardApi.dismissAlert as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No-Show Follow-Up')).toBeInTheDocument();
    });

    const dismissButton = screen.getByLabelText('Dismiss no-show alert');
    dismissButton.click();

    await waitFor(() => {
      expect(dashboardApi.dismissAlert).toHaveBeenCalledWith('notif-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('No-Show Follow-Up')).not.toBeInTheDocument();
    });
  });
});
