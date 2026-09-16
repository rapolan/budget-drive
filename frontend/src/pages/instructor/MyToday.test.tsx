import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstructorMyTodayPage } from './MyToday';
import { lessonsApi, studentsApi } from '@/api';
import type { Lesson, Student } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      getByInstructor: vi.fn(),
      complete: vi.fn(),
      noShow: vi.fn(),
      cancel: vi.fn(),
    },
    studentsApi: {
      ...actual.studentsApi,
      getByInstructor: vi.fn(),
    },
  };
});

const INSTRUCTOR_ID = 'instructor-self-1';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'instructor', instructorId: INSTRUCTOR_ID, fullName: 'Pat Instructor' } }),
}));

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
  useTenant: () => ({ tenantNow: MOCK_TENANT_NOW }),
}));

afterEach(cleanup);

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: INSTRUCTOR_ID,
    vehicleId: null,
    date: '2026-08-17' as unknown as Date,
    startTime: '09:00',
    endTime: '10:00',
    duration: 60,
    lessonType: 'behind_wheel',
    status: 'scheduled',
    cost: 100,
    completionVerified: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Lesson;
}

function student(overrides: Partial<Student>): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstructorMyTodayPage />
    </QueryClientProvider>
  );
}

describe('InstructorMyTodayPage', () => {
  it('fetches lessons scoped to the logged-in instructor\'s own id, not the whole tenant', async () => {
    (lessonsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderPage();

    await waitFor(() => {
      expect(lessonsApi.getByInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID);
      expect(studentsApi.getByInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID);
    });
  });

  it('shows today\'s scheduled lesson via the shared TodaysScheduleWidget', async () => {
    (lessonsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [lesson({ id: 'today-lesson', startTime: '14:00', endTime: '15:00' })],
    });
    (studentsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [student({ id: 'student-1', fullName: 'Jamie Learner' })],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Jamie Learner')).toBeInTheDocument();
    });
  });

  it('renders the week-ahead strip with a Today chip', async () => {
    (lessonsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getByInstructor as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });
});
