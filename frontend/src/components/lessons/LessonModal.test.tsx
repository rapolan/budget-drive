import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LessonModal } from './LessonModal';
import type { Lesson } from '@/types';

const { updateMock } = vi.hoisted(() => ({
  updateMock: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      getAll: vi.fn().mockResolvedValue({
        data: [{ id: 'student-1', fullName: 'Test Student', activeEnrollment: { status: 'active' } }],
      }),
    },
    instructorsApi: {
      ...actual.instructorsApi,
      getAll: vi.fn().mockResolvedValue({
        data: [{ id: 'instructor-1', fullName: 'Test Instructor', status: 'active' }],
      }),
    },
    vehiclesApi: { ...actual.vehiclesApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
    lessonsApi: {
      ...actual.lessonsApi,
      getAll: vi.fn().mockResolvedValue({ data: [] }),
      getByInstructor: vi.fn().mockResolvedValue({ data: [] }),
      update: updateMock,
    },
  };
});

afterEach(() => {
  cleanup();
  updateMock.mockClear();
});

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

// Regression: updateLesson (backend) only ever reads date/startTime/
// endTime/duration directly - unlike createLesson it has no
// scheduledStart/scheduledEnd conversion path at all, so sending those
// on edit silently dropped every date/time change. The edit submit
// payload must send the native date/startTime/endTime/duration fields
// and must NOT send scheduledStart/scheduledEnd.
describe('LessonModal - edit submit payload shape', () => {
  it('sends date/startTime/endTime/duration (not scheduledStart/scheduledEnd) when editing', async () => {
    renderModal(editingLesson());

    await waitFor(() => {
      expect((screen.getByTitle('Select Date') as HTMLInputElement).value).toBe('2026-08-20');
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.submit(saveButton.closest('form')!);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    const [, payload] = updateMock.mock.calls[0];
    expect(payload).toMatchObject({
      date: '2026-08-20',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
    });
    expect(payload).not.toHaveProperty('scheduledStart');
    expect(payload).not.toHaveProperty('scheduledEnd');
  });
});
