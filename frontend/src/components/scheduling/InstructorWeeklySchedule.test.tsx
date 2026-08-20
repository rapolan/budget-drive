import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstructorWeeklySchedule } from './InstructorWeeklySchedule';
import { instructorsApi, studentsApi, lessonsApi, schedulingApi } from '@/api';
import type { Instructor, InstructorAvailability } from '@/types';

// Regression: opening the weekly view rendered the grid scrolled to its
// far-left (Sunday) column - on a week with today mid-week, the admin had
// to horizontally scroll to find it. Asserts scrollIntoView is called on
// today's own <th> with inline: 'start' (today plus the remainder of the
// week visible, not centered) and the reduced-motion-aware behavior.

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

const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-03-04', // a Wednesday, mid-week
  tomorrow: '2026-03-05',
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

describe('InstructorWeeklySchedule - scroll to today on open', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("scrolls today's column into view with inline: 'start' so the remainder of the week stays visible too", async () => {
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoViewSpy;

    try {
      renderSchedule();

      await waitFor(() => {
        expect(screen.getByText('TODAY')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      // Called as a method on today's own <th>, not some other element -
      // confirmed via the call's `this` context.
      const call = scrollIntoViewSpy.mock.calls[0];
      const calledOn = scrollIntoViewSpy.mock.contexts[0] as HTMLElement;
      expect(calledOn.textContent).toContain('TODAY');
      expect(call[0]).toMatchObject({ inline: 'start', block: 'nearest' });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('uses instant (auto) scroll behavior when the OS/browser requests reduced motion', async () => {
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoViewSpy;
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    try {
      renderSchedule();

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      expect(scrollIntoViewSpy.mock.calls[0][0]).toMatchObject({ behavior: 'auto' });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      window.matchMedia = originalMatchMedia;
    }
  });

  it('uses smooth scroll behavior when reduced motion is not requested', async () => {
    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoViewSpy;

    try {
      renderSchedule();

      await waitFor(() => {
        expect(scrollIntoViewSpy).toHaveBeenCalled();
      });

      expect(scrollIntoViewSpy.mock.calls[0][0]).toMatchObject({ behavior: 'smooth' });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
