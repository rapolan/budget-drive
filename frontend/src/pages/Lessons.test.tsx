import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LessonsPage } from './Lessons';
import { lessonsApi, studentsApi, instructorsApi, schedulingApi, vehiclesApi } from '@/api';
import type { Lesson } from '@/types';

// Regression: completed and no_show lessons previously had NO visible row
// action at all (table hover actions and the card view's action row both
// only rendered Edit for status === 'scheduled'; the card view literally
// showed "No actions available" for anything else). The row/card's own
// onClick already opened LessonDetailsPanel for any status, so this was a
// discoverability gap, not a missing code path - fixed by adding a "View"
// button for completed/no_show, alongside "Book Again" for cancelled.
//
// Mock shape mirrors Lessons.hostileClock.test.tsx's proven-working
// pattern exactly (including studentsApi/instructorsApi/vehiclesApi/
// getLastCompletedNoteByStudent default resolved values, needed here
// because these tests actually open LessonDetailsPanel, which fetches
// all of them on mount).

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      getAll: vi.fn(),
      getLastCompletedNoteByStudent: vi.fn().mockResolvedValue({ data: null }),
    },
    studentsApi: {
      ...actual.studentsApi,
      getAll: vi.fn().mockResolvedValue({ data: [] }),
      getById: vi.fn().mockResolvedValue({ data: { id: 'student-1', fullName: 'Test Student' } }),
    },
    instructorsApi: {
      ...actual.instructorsApi,
      getAll: vi.fn().mockResolvedValue({ data: [] }),
      getById: vi.fn().mockResolvedValue({ data: { id: 'instructor-1', fullName: 'Test Instructor' } }),
    },
    vehiclesApi: { ...actual.vehiclesApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
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
    enrollmentId: 'enrollment-1',
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

describe('Lessons - row/card actions for terminal statuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'student-1', fullName: 'Test Student' },
    });
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (instructorsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'instructor-1', fullName: 'Test Instructor' },
    });
    (vehiclesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (schedulingApi.getAllInstructorsAvailability as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (lessonsApi.getLastCompletedNoteByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
  });

  it('shows a View button for a completed lesson and opens LessonDetailsPanel on click, never "No actions available"', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'completed-lesson', status: 'completed' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderLessons();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Completed\d/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Completed\d/i }));

    const viewButtons = await screen.findAllByRole('button', { name: /view lesson/i });
    expect(viewButtons.length).toBeGreaterThan(0);
    expect(screen.queryByText(/no actions available/i)).not.toBeInTheDocument();

    fireEvent.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /close/i }).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  }, 15000);

  it('shows a View button for a no_show lesson and opens LessonDetailsPanel on click', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'no-show-lesson', status: 'no_show' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderLessons();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^No Show\d/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^No Show\d/i }));

    const viewButtons = await screen.findAllByRole('button', { name: /view lesson/i });
    fireEvent.click(viewButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /close/i }).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  }, 15000);

  it('shows Book Again (not View) for a cancelled lesson', async () => {
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'cancelled-lesson', status: 'cancelled' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderLessons();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Cancelled\d/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Cancelled\d/i }));

    await screen.findAllByRole('button', { name: /book again/i });
    expect(screen.queryByRole('button', { name: /view lesson/i })).not.toBeInTheDocument();
  }, 15000);
});
