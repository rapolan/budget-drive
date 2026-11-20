import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LessonsPage } from './Lessons';
import { lessonsApi, studentsApi, instructorsApi, schedulingApi } from '@/api';
import type { Lesson } from '@/types';

// Hostile-clock regression suite for Lessons.tsx - see Dashboard.hostileClock.test.tsx
// for the axis-separation rationale (process.env.TZ fakes the browser,
// mocked tenantNow fakes the backend-resolved value under test).

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn() },
    studentsApi: { ...actual.studentsApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
    schedulingApi: { ...actual.schedulingApi, getAllInstructorsAvailability: vi.fn().mockResolvedValue({ data: [] }) },
  };
});

const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-03-01',
  tomorrow: '2026-03-02',
  currentTime: '12:00',
  weekStart: '2026-02-22',
  weekEnd: '2026-02-28',
  monthBoundaries: { start: '2026-03-01', end: '2026-03-31' },
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantNow: TENANT_NOW }),
}));

afterEach(cleanup);

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: null,
    date: TENANT_NOW.today as unknown as Date,
    startTime: '10:00:00',
    endTime: '12:00:00',
    duration: 120,
    lessonType: 'behind_wheel',
    status: 'scheduled',
    cost: 150,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Lesson;
}

function renderLessons() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LessonsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Lessons - hostile clock (tenant America/Los_Angeles, browser America/New_York)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'America/New_York';
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (schedulingApi.getAllInstructorsAvailability as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it("counts a lesson dated the tenant's today in the Today's Lessons stat, regardless of the browser's own zone", async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'today-lesson', date: TENANT_NOW.today as unknown as Date })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderLessons();

    await waitFor(() => {
      // The stat card's number sits directly above the "Today's Lessons" label.
      const label = screen.getByText("Today's Lessons");
      const statCard = label.closest('div')?.parentElement;
      expect(statCard?.textContent).toContain('1');
    });
  });

  it('groups a lesson dated exactly the tenant\'s today under the "Today" table section, not "Tomorrow" or "Past"', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'today-lesson', date: TENANT_NOW.today as unknown as Date, studentId: 'student-1' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderLessons();

    // The "Today" section header (an <h3>) only renders when
    // groupedLessons.today is non-empty - scoped by role/tag to avoid
    // colliding with the unrelated "Today" filter/preset buttons elsewhere
    // on the page.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Today', level: 3 })).toBeInTheDocument();
    });
  });

  it('groups a lesson dated the tenant\'s tomorrow under "Tomorrow", not "Today"', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'tomorrow-lesson', date: TENANT_NOW.tomorrow as unknown as Date })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderLessons();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tomorrow', level: 3 })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Today', level: 3 })).not.toBeInTheDocument();
  });

  // Regression: formatDate() used to do `new Date(lesson.date).toLocaleDateString()`,
  // which parses the ISO string as a UTC instant and renders it in the
  // BROWSER's zone - rolling the calendar day back one for any zone west of
  // UTC. Under this suite's browser=America/New_York vs tenant=America/Los_Angeles
  // setup, a lesson stored as TENANT_NOW.tomorrow ("2026-03-02") used to
  // render as "Mar 1" in the table row instead of "Mar 2". Reproduced live
  // against the real dev DB before fixing - see commit message.
  it('renders the table row date as the tenant calendar date, not a UTC-shifted browser-local one', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'tomorrow-lesson', date: TENANT_NOW.tomorrow as unknown as Date })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderLessons();

    await waitFor(() => {
      expect(screen.getByText('Mar 2, 2026')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mar 1, 2026')).not.toBeInTheDocument();
  });

  // isRescheduleEligible: a lesson is reschedulable only while it's still
  // 'scheduled' AND its start is still in the future, by the TENANT's
  // current wall-clock time - never the browser's. All four cases below
  // run under this suite's browser=America/New_York vs
  // tenant=America/Los_Angeles mismatch, so a bug that read the browser's
  // own clock instead of tenantNow would show up as a wrong answer here.
  describe('Reschedule button eligibility (isRescheduleEligible)', () => {
    it('shows Reschedule for a scheduled lesson dated the tenant\'s tomorrow', async () => {
      (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [lesson({ id: 'future-lesson', status: 'scheduled', date: TENANT_NOW.tomorrow as unknown as Date })],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      renderLessons();

      await waitFor(() => {
        expect(screen.getByLabelText('Reschedule lesson')).toBeInTheDocument();
      });
    });

    it('shows Reschedule for a scheduled lesson later TODAY (after tenantNow.currentTime)', async () => {
      (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [lesson({
          id: 'later-today-lesson',
          status: 'scheduled',
          date: TENANT_NOW.today as unknown as Date,
          startTime: '14:00:00', // after tenantNow.currentTime (12:00)
        })],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      renderLessons();

      await waitFor(() => {
        expect(screen.getByLabelText('Reschedule lesson')).toBeInTheDocument();
      });
    });

    it('hides Reschedule for a scheduled lesson earlier TODAY (before tenantNow.currentTime) - scheduled but already past', async () => {
      (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [lesson({
          id: 'earlier-today-lesson',
          status: 'scheduled',
          date: TENANT_NOW.today as unknown as Date,
          startTime: '09:00:00', // before tenantNow.currentTime (12:00)
        })],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      renderLessons();

      await waitFor(() => {
        expect(screen.getByLabelText('Edit lesson')).toBeInTheDocument();
      });
      // Edit must still be available - only Reschedule is gated by eligibility.
      expect(screen.queryByLabelText('Reschedule lesson')).not.toBeInTheDocument();
    });

    it('hides Reschedule for a cancelled lesson - "Book again" is the correct affordance there instead', async () => {
      const user = userEvent.setup();
      (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [lesson({ id: 'cancelled-lesson', status: 'cancelled', date: TENANT_NOW.tomorrow as unknown as Date })],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      renderLessons();
      // Default status filter is 'scheduled' - switch to the status
      // filter's "All" (not the separate date-range filter's "All Time")
      // so the cancelled row and its action buttons actually render.
      // Text content concatenates with no space before the count badge
      // ("All0"), so match on that literal prefix rather than a role/name
      // query, which failed to resolve a stable accessible name here.
      await screen.findByText('Status:');
      const allStatusButton = screen.getAllByRole('button').find((b) => /^all\d/i.test(b.textContent ?? ''));
      await user.click(allStatusButton as HTMLElement);

      await waitFor(() => {
        expect(screen.getByLabelText('Book again')).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Reschedule lesson')).not.toBeInTheDocument();
    });

    it('hides Reschedule for a completed lesson', async () => {
      const user = userEvent.setup();
      (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [lesson({ id: 'completed-lesson', status: 'completed', date: TENANT_NOW.tomorrow as unknown as Date })],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      renderLessons();
      await screen.findByText('Status:');
      const allStatusButton = screen.getAllByRole('button').find((b) => /^all\d/i.test(b.textContent ?? ''));
      await user.click(allStatusButton as HTMLElement);

      await waitFor(() => {
        expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
      });
      expect(screen.queryByLabelText('Reschedule lesson')).not.toBeInTheDocument();
    });
  });
});
