import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstructorWeeklySchedule } from './InstructorWeeklySchedule';
import { instructorsApi, studentsApi, lessonsApi, schedulingApi } from '@/api';
import type { Instructor, InstructorAvailability } from '@/types';

// See Dashboard.hostileClock.test.tsx for the axis-separation rationale.

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn() },
    studentsApi: { ...actual.studentsApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 1000, total: 0, totalPages: 0 } }) },
    schedulingApi: {
      ...actual.schedulingApi,
      getInstructorAvailability: vi.fn(),
    },
  };
});

// Tenant is America/Los_Angeles, "today" is 2026-03-01 (a Sunday) - the
// same fixed week used across the other hostile-clock suites.
const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-03-01',
  tomorrow: '2026-03-02',
  currentTime: '12:00',
  weekStart: '2026-03-01',
  weekEnd: '2026-03-07',
  monthBoundaries: { start: '2026-03-01', end: '2026-03-31' },
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantNow: TENANT_NOW }),
}));

afterEach(cleanup);

function instructor(overrides: Partial<Instructor> = {}): Instructor {
  return {
    id: 'instructor-1',
    tenantId: 'tenant-1',
    fullName: 'Test Instructor',
    email: 'instructor@example.com',
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Instructor;
}

function availability(dayOfWeek: number, overrides: Partial<InstructorAvailability> = {}): InstructorAvailability {
  return {
    id: `avail-${dayOfWeek}`,
    instructorId: 'instructor-1',
    dayOfWeek,
    startTime: '09:00',
    endTime: '17:00',
    isActive: true,
    ...overrides,
  } as InstructorAvailability;
}

function renderSchedule() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstructorWeeklySchedule onBookSlot={vi.fn()} onViewLesson={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('InstructorWeeklySchedule - hostile clock (tenant America/Los_Angeles, browser America/New_York)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'America/New_York';
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [instructor()] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 1000, total: 0, totalPages: 0 },
    });
    // Every day of the week is open 09:00-17:00, so the grid always renders
    // regardless of which day the tenant's "today" lands on.
    (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue(
      [0, 1, 2, 3, 4, 5, 6].map((d) => availability(d))
    );
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it("initializes the visible week from the tenant's weekStart, not a week computed from the browser's clock", async () => {
    renderSchedule();

    // TENANT_NOW.weekStart is 2026-03-01, a Sunday - the week range label
    // should read "Mar 1-7, 2026" regardless of what week the browser's
    // own clock would compute.
    await waitFor(() => {
      expect(screen.getAllByText('Mar 1-7, 2026').length).toBeGreaterThan(0);
    });
  });

  it("marks the column matching the tenant's today as TODAY, not the browser's own today", async () => {
    renderSchedule();

    await waitFor(() => {
      expect(screen.getByText('TODAY')).toBeInTheDocument();
    });
  });

  it("keeps the day columns before the tenant's today styled as past, even if the browser's own clock disagrees", async () => {
    renderSchedule();

    // 2026-03-01 is the tenant's today AND the tenant's weekStart, so no
    // day in this particular week is "past" - assert the TODAY column
    // lands on Sunday specifically (day number 1), pinning the tenant's
    // own calendar, not the browser's.
    await waitFor(() => {
      const todayBadge = screen.getByText('TODAY');
      const headerCell = todayBadge.closest('th');
      expect(headerCell?.textContent).toContain('Sun');
      expect(headerCell?.textContent).toContain('1');
    });
  });
});

describe('InstructorWeeklySchedule - hostile clock, reversed (tenant America/New_York, browser America/Los_Angeles)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'America/Los_Angeles';
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [instructor()] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 1000, total: 0, totalPages: 0 },
    });
    (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue(
      [0, 1, 2, 3, 4, 5, 6].map((d) => availability(d))
    );
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it("still marks the tenant's today as TODAY when the browser's own zone is on the opposite coast", async () => {
    renderSchedule();

    await waitFor(() => {
      expect(screen.getByText('TODAY')).toBeInTheDocument();
    });
  });
});
