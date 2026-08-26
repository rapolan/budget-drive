import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './Dashboard';
import { studentsApi, instructorsApi, lessonsApi, paymentsApi, dashboardApi } from '@/api';
import type { Student, Lesson } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn() },
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn() },
    lessonsApi: {
      ...actual.lessonsApi,
      getAll: vi.fn(),
      complete: vi.fn(),
      noShow: vi.fn(),
      cancel: vi.fn(),
    },
    paymentsApi: { ...actual.paymentsApi, getAll: vi.fn() },
    dashboardApi: {
      ...actual.dashboardApi,
      getNoShowAlerts: vi.fn(),
      dismissAlert: vi.fn(),
      getReviewQueue: vi.fn().mockResolvedValue({ data: { days: [], totalCount: 0 } }),
      getLicenseExpiryAlerts: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}));

// Fixed tenantNow so Dashboard's "today"-derived stats/bucketing are
// deterministic in tests, matching the tenant-timezone-resolved shape
// TenantContext now provides (see docs/ARCHITECTURE.md §7) - Dashboard.tsx
// renders a loading skeleton until this resolves, so every test needs it.
// A stable module-level object, not a fresh literal per call - the real
// TenantContext stores tenantNow in useState and only creates a new
// reference on an actual refetch (contexts/TenantContext.tsx), so a
// consumer's useEffect keyed on [tenantNow] never re-fires on an
// unrelated render. Mocking it as `() => ({ tenantNow: {...} })` (a new
// object every call) doesn't preserve that guarantee and can trip a
// "Maximum update depth exceeded" warning in exactly that kind of effect
// once a test drives enough consecutive re-renders (e.g. clicking an
// action button and awaiting its mutation).
const MOCK_TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-08-17',
  tomorrow: '2026-08-18',
  currentTime: '12:00',
  weekStart: '2026-08-16',
  weekEnd: '2026-08-22',
  monthBoundaries: { start: '2026-08-01', end: '2026-08-31' },
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenantNow: MOCK_TENANT_NOW,
  }),
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

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: null,
    date: '2026-08-17' as unknown as Date,
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    lessonType: 'behind_wheel',
    status: 'scheduled',
    cost: 100,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Lesson;
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

describe('Dashboard - Book Lesson opens in place (regression: previously navigated to /lessons)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('"Schedule Lesson" opens the SmartBookingForm modal in place, without navigating away', async () => {
    renderDashboard();

    const scheduleButton = await screen.findByRole('button', { name: /schedule lesson/i });
    scheduleButton.click();

    await waitFor(() => {
      expect(screen.getByText('Smart Booking')).toBeInTheDocument();
    });
    // Still on the dashboard - the page's own "Today's Schedule" heading
    // (rendered only on Dashboard, not on /lessons) stays present.
    expect(screen.getByText("Today's Schedule")).toBeInTheDocument();
  });

  it('the empty-state "Schedule a Lesson" CTA also opens the modal in place', async () => {
    renderDashboard();

    const emptyStateButton = await screen.findByRole('button', { name: /schedule a lesson/i });
    emptyStateButton.click();

    await waitFor(() => {
      expect(screen.getByText('Smart Booking')).toBeInTheDocument();
    });
  });
});

// Item 3: Dashboard used to hand-roll its own copy of TodaysScheduleWidget
// with a DIFFERENT, incorrect definition of "completed" - lesson.endTime
// <= now (a clock inference) instead of status === 'completed' (an
// explicit action). Dashboard now renders the real shared widget, so
// these assert the widget's actual (correct) behavior appears here, not
// the old hand-rolled one.
describe('Dashboard - Today\'s Schedule uses the real shared TodaysScheduleWidget (item 3)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Jordan Vance' })],
    });
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('does NOT treat a past-time but still-"scheduled" lesson as completed (tenantNow.currentTime is 12:00, lesson ended at 10:00)', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'l1', status: 'scheduled', startTime: '09:00', endTime: '10:00' })],
    });

    renderDashboard();

    // The old hand-rolled logic classified this as "completed" purely
    // because endTime (10:00) <= currentTime (12:00) - the widget's real
    // status-based logic must not.
    await screen.findByText('Jordan Vance');
    expect(screen.queryByText(/all done for today/i)).not.toBeInTheDocument();
    expect(screen.getByText('0/1 complete')).toBeInTheDocument();
  });

  it('shows the widget\'s own "All done!" celebration only once every lesson is genuinely status "completed"', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'l1', status: 'completed', startTime: '09:00', endTime: '10:00' })],
    });

    renderDashboard();

    expect(await screen.findByText(/all lessons completed for today/i)).toBeInTheDocument();
  });

  it('renders the same "Upcoming" list the Lessons page would for identical data', async () => {
    // tenantNow.currentTime is '12:00' (mocked in this file). The
    // earliest future lesson (14:00) becomes its own "Next" card, leaving
    // the later one (16:00) as the genuine entry in the plain Upcoming
    // list - same pattern as TodaysScheduleWidget.test.tsx's own
    // "still renders the Upcoming header..." case.
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        lesson({ id: 'next', status: 'scheduled', studentId: 'student-1', startTime: '14:00', endTime: '15:00' }),
        lesson({ id: 'l1', status: 'scheduled', studentId: 'student-1', startTime: '16:00', endTime: '17:00' }),
      ],
    });

    renderDashboard();

    expect(await screen.findByText(/^upcoming$/i)).toBeInTheDocument();
    expect(screen.getAllByText('Jordan Vance').length).toBeGreaterThan(0);
  });

  it('shows a past-due scheduled lesson as "Needs marking", not "Upcoming" (investigation follow-up)', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'l1', status: 'scheduled', studentId: 'student-1', startTime: '09:00', endTime: '10:00' })],
    });

    renderDashboard();

    expect(await screen.findByText(/needs marking/i)).toBeInTheDocument();
    expect(screen.queryByText(/^upcoming$/i)).not.toBeInTheDocument();
  });
});

// Widget enhancement: inline status actions + Completed Today. These
// assert Dashboard wires the SAME lessonsApi.complete/noShow/cancel
// functions the Lessons page uses into the widget (no reimplementation),
// and that a status change made here invalidates the review-queue query
// too - not just ['lessons'] - so the "Lessons Need Review" alert can
// never disagree with what the widget itself now shows.
describe('Dashboard - TodaysScheduleWidget inline actions reuse the same lessonsApi calls and invalidate the review queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Jordan Vance' })],
    });
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('clicking Complete on the "Now" card calls lessonsApi.complete (not a Dashboard-local reimplementation) and refetches the review queue', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'l1', status: 'scheduled', studentId: 'student-1', startTime: '11:00', endTime: '13:00' })],
    });
    (lessonsApi.complete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'l1', status: 'completed' } });

    renderDashboard();
    await screen.findByText('Jordan Vance');

    const reviewQueueCallsBefore = (dashboardApi.getReviewQueue as ReturnType<typeof vi.fn>).mock.calls.length;

    await screen.findByRole('button', { name: /mark lesson as completed/i }).then((btn) => btn.click());

    await waitFor(() => expect(lessonsApi.complete).toHaveBeenCalledWith('l1', false));
    await waitFor(() =>
      expect((dashboardApi.getReviewQueue as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(reviewQueueCallsBefore)
    );

    confirmSpy.mockRestore();
  });

  it('clicking No-show calls lessonsApi.noShow with the same id', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'l1', status: 'scheduled', studentId: 'student-1', startTime: '11:00', endTime: '13:00' })],
    });
    (lessonsApi.noShow as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'l1', status: 'no_show' } });

    renderDashboard();
    await screen.findByText('Jordan Vance');

    (await screen.findByRole('button', { name: /mark lesson as no-show/i })).click();

    await waitFor(() => expect(lessonsApi.noShow).toHaveBeenCalledWith('l1', false));
    confirmSpy.mockRestore();
  });

  it('a completed lesson appears under "Completed Today" with a "Correct" affordance, and correcting to no-show calls lessonsApi.noShow with allowCorrection=true', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'l1', status: 'completed', studentId: 'student-1', startTime: '09:00', endTime: '10:00' })],
    });
    (lessonsApi.noShow as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'l1', status: 'no_show' } });

    renderDashboard();
    expect(await screen.findByText(/^completed today$/i)).toBeInTheDocument();

    (await screen.findByText('Correct')).click();
    (await screen.findByText('No-show')).click();

    await waitFor(() => expect(lessonsApi.noShow).toHaveBeenCalledWith('l1', true));
    confirmSpy.mockRestore();
  });
});
