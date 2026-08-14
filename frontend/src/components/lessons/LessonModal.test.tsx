import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LessonModal } from './LessonModal';
import type { Lesson } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
    vehiclesApi: { ...actual.vehiclesApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
    lessonsApi: {
      ...actual.lessonsApi,
      getAll: vi.fn().mockResolvedValue({ data: [] }),
      getByInstructor: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
});

afterEach(cleanup);

function renderModal(lesson: Lesson) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LessonModal lesson={lesson} onClose={() => {}} />
    </QueryClientProvider>
  );
}

function editingLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: 'vehicle-1',
    date: new Date('2026-08-20'),
    startTime: '09:00:00',
    endTime: '10:00:00',
    duration: 60,
    lessonType: 'behind_wheel',
    status: 'scheduled',
    cost: 50,
    completionVerified: false,
    ...overrides,
  } as Lesson;
}

// Regression: Postgres numeric columns (lessons.duration, lessons.cost)
// come back through the API as strings ("60.00"/"50.00", not 60/50) - the
// edit-seed effect previously copied them straight into formData without
// coercion, so an admin who edited a lesson without touching cost would
// silently resubmit the raw string back to the API.
describe('LessonModal - numeric field coercion on edit', () => {
  it('coerces a string-typed duration and cost to numbers when seeding the form from an existing lesson', () => {
    renderModal(
      editingLesson({
        duration: '60.00' as unknown as number,
        cost: '50.00' as unknown as number,
      })
    );

    const durationDisplay = screen.getByTitle('Auto-calculated from start and end times') as HTMLInputElement;
    expect(durationDisplay.value).toBe('60 min');

    const costInput = screen.getByPlaceholderText('50.00') as HTMLInputElement;
    expect(costInput.value).toBe('50');
  });
});
