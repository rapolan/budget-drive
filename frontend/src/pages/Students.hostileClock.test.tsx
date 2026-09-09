import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StudentsPage } from './Students';
import { studentsApi } from '@/api';
import type { Student } from '@/types';

// Hostile-clock regression suite for the "New This Month" trend card's
// month-over-month comparison, mirroring Dashboard.hostileClock.test.tsx's
// pattern. This card previously computed its month/last-month/last-year
// boundaries via browser-local `new Date(now.getFullYear(), now.getMonth(),
// ...)` - a pre-existing bug of the same browser-vs-tenant-timezone class
// this app has fixed elsewhere (docs/ARCHITECTURE.md §7). It now resolves
// via tenantNow.today/getMonthBoundaries instead.

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn(), getById: vi.fn() },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn().mockResolvedValue({ data: [] }), getMostRecentByStudent: vi.fn().mockResolvedValue({ data: null }) },
    dashboardApi: { ...actual.dashboardApi, getNoShowAlerts: vi.fn().mockResolvedValue({ data: [] }) },
    guardiansApi: {
      ...actual.guardiansApi,
      getAll: vi.fn().mockResolvedValue({ data: [] }),
      getById: vi.fn(),
      getStudentsForGuardian: vi.fn().mockResolvedValue({ data: [] }),
      findCandidates: vi.fn().mockResolvedValue({ data: [] }),
    },
    searchApi: { ...actual.searchApi, people: vi.fn() },
    feeFlagsApi: { ...actual.feeFlagsApi, markStudentFeesPaid: vi.fn().mockResolvedValue({ data: [] }) },
  };
});

vi.mock('@/components/scheduling/SmartBookingForm', () => ({
  SmartBookingForm: () => <div data-testid="smart-booking-form" />,
}));

// Tenant is America/Los_Angeles, "today" is 2026-08-17 - fixed and mocked,
// never derived from the browser clock under test.
const TENANT_NOW = {
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
    tenant: null,
    tenantType: 'school',
    settings: { defaultHoursRequired: 6 },
    tenantNow: TENANT_NOW,
    loading: false,
    error: null,
    refreshSettings: vi.fn(),
    updateTheme: vi.fn(),
  }),
}));

function student(overrides: Partial<Student>): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    email: 'test@example.com',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    totalHoursCompleted: 0,
    // A real API response always sends an ISO date STRING over JSON, never
    // a live Date instance - String(new Date(...)) produces a human-
    // readable "Fri Jul 31 2026..." form the page's month-boundary string
    // comparison (String(student.createdAt).split('T')[0]) can't parse, so
    // fixtures here must use ISO strings to match reality (same landmine
    // documented in Payments.test.tsx's payment() fixture).
    createdAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
    updatedAt: '2026-01-01T00:00:00.000Z' as unknown as Date,
    ...overrides,
  } as Student;
}

function renderStudentsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openBtwTab() {
  const { default: userEvent } = await import('@testing-library/user-event');
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: /^Behind-the-Wheel/ }));
}

describe('Students - "New This Month" trend, hostile clock (tenant America/Los_Angeles, browser Pacific/Kiritimati)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
    cleanup();
  });

  it('counts a student created on the tenant\'s month-start as "this month", even though a browser far ahead of the tenant would call it a different month', async () => {
    // Pacific/Kiritimati is UTC+14 - far enough ahead of America/Los_Angeles
    // that a naive new Date()-based "this month" computed in the browser's
    // own zone would already have rolled past the tenant's month boundary
    // near 2026-08-17, potentially misclassifying a student created right
    // at 2026-08-01/2026-07-31.
    process.env.TZ = 'Pacific/Kiritimati';

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        student({ id: 's1', fullName: 'This Month Student', createdAt: '2026-08-01T00:00:00.000Z' as unknown as Date }),
        student({ id: 's2', fullName: 'Last Month Student', createdAt: '2026-07-31T00:00:00.000Z' as unknown as Date }),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('This Month Student')).toBeInTheDocument());
    await openBtwTab();

    await waitFor(() => expect(screen.getByText('New This Month')).toBeInTheDocument());
    // 1 student created this tenant-month (2026-08-01), 1 last month
    // (2026-07-31) - correct regardless of the hostile browser TZ.
    const card = screen.getByText('New This Month').closest('div')!.parentElement as HTMLElement;
    expect(card.textContent).toContain('1');
    expect(card.textContent).toMatch(/vs last month \(1\)/);
  });

  it('resolves the "vs last year" comparison from tenant time too', async () => {
    process.env.TZ = 'Pacific/Kiritimati';

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        student({ id: 's1', fullName: 'This Month Student', createdAt: '2026-08-10T00:00:00.000Z' as unknown as Date }),
        // Same tenant-calendar-month one year earlier - correctly counted
        // as "last year same month" only if the boundary is resolved from
        // tenantNow.today (2026-08-17), not the hostile browser clock.
        student({ id: 's2', fullName: 'Same Month Last Year', createdAt: '2025-08-10T00:00:00.000Z' as unknown as Date }),
        // Just outside last year's same-month window - must not count.
        student({ id: 's3', fullName: 'Different Month Last Year', createdAt: '2025-07-15T00:00:00.000Z' as unknown as Date }),
      ],
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('This Month Student')).toBeInTheDocument());
    await openBtwTab();

    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const toggle = await screen.findByTitle('Click to toggle comparison');
    await user.click(toggle);

    // newThisMonth (1, from s1) - newLastYearSameMonth (1, from s2 only,
    // NOT s3) = 0.
    await waitFor(() => expect(toggle.textContent).toContain('+0'));
    const card = screen.getByText('New This Month').closest('div')!.parentElement as HTMLElement;
    expect(card.textContent).toContain('vs last year (1)');
  });
});
