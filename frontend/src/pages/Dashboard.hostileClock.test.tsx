import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './Dashboard';
import { studentsApi, instructorsApi, lessonsApi, paymentsApi } from '@/api';
import type { Lesson } from '@/types';

// Hostile-clock regression suite: proves Dashboard renders the TENANT's
// "today"/boundaries, never the browser's own clock, even when the two
// genuinely disagree on the calendar date. See docs/ARCHITECTURE.md §7.
//
// Axis separation is the whole point of this file:
//   - process.env.TZ fakes what the BROWSER's clock would compute if any
//     leftover new Date() call existed in Dashboard.tsx - this is a
//     regression guard against reintroducing that bug.
//   - the mocked tenantNow below fakes what the BACKEND resolved and
//     threaded through TenantContext, which is what should actually render.
// Verified empirically during planning: reassigning process.env.TZ at
// runtime correctly and immediately changes both Intl.DateTimeFormat's
// reported zone and every Date.prototype getter, including across DST
// boundaries and repeated reassignments within one process.

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn() },
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn() },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn() },
    paymentsApi: { ...actual.paymentsApi, getAll: vi.fn() },
    dashboardApi: {
      ...actual.dashboardApi,
      getNoShowAlerts: vi.fn().mockResolvedValue({ data: [] }),
      dismissAlert: vi.fn(),
      getReviewQueue: vi.fn().mockResolvedValue({ data: { days: [], totalCount: 0 } }),
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}));

// Tenant is America/Los_Angeles, "today" is 2026-03-01 - a fixed, mocked
// tenantNow (never derived from the browser clock under test).
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

describe('Dashboard - hostile clock (tenant America/Los_Angeles, browser America/New_York)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'America/New_York';
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it("counts a lesson dated the tenant's today, even though the browser's own clock would call it a different day", async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'today-lesson', date: TENANT_NOW.today as unknown as Date })],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/1 lesson scheduled today/)).toBeInTheDocument();
    });
  });

  it('does not count a lesson dated the day before the tenant\'s today as part of "today"', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'yesterday-lesson', date: '2026-02-28' as unknown as Date })],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No lessons scheduled today')).toBeInTheDocument();
    });
  });

  it('renders the header date label from tenantNow.today, not a browser-local date', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderDashboard();

    // 2026-03-01 is a Sunday.
    await waitFor(() => {
      expect(screen.getByText('Sunday, March 1, 2026')).toBeInTheDocument();
    });
  });
});

describe('Dashboard - hostile clock, reversed (tenant America/New_York, browser America/Los_Angeles)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'America/Los_Angeles';
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it("still counts a lesson dated the tenant's today when the browser's own zone is on the opposite coast", async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'today-lesson', date: TENANT_NOW.today as unknown as Date })],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/1 lesson scheduled today/)).toBeInTheDocument();
    });
  });
});
