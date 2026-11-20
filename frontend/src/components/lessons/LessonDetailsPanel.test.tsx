import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LessonDetailsPanel } from './LessonDetailsPanel';
import type { Lesson } from '@/types';

const { updateMock, studentGetByIdMock, instructorGetByIdMock, vehiclesGetAllMock } = vi.hoisted(() => ({
  updateMock: vi.fn().mockResolvedValue({ data: {} }),
  studentGetByIdMock: vi.fn().mockResolvedValue({
    data: { id: 'student-1', fullName: 'Test Student' },
  }),
  instructorGetByIdMock: vi.fn().mockResolvedValue({
    data: { id: 'instructor-1', fullName: 'Test Instructor' },
  }),
  vehiclesGetAllMock: vi.fn().mockResolvedValue({
    data: [{ id: 'vehicle-1', make: 'Toyota', model: 'Corolla', licensePlate: 'ABC123', status: 'active' }],
  }),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getById: studentGetByIdMock },
    instructorsApi: { ...actual.instructorsApi, getById: instructorGetByIdMock },
    vehiclesApi: { ...actual.vehiclesApi, getAll: vehiclesGetAllMock },
    lessonsApi: { ...actual.lessonsApi, update: updateMock },
  };
});

afterEach(() => {
  cleanup();
  updateMock.mockClear();
  studentGetByIdMock.mockClear();
  instructorGetByIdMock.mockClear();
  vehiclesGetAllMock.mockClear();
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof LessonDetailsPanel>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const onReschedule = vi.fn();
  const onComplete = vi.fn();
  const onNoShow = vi.fn();
  const onCancel = vi.fn();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <LessonDetailsPanel
        lesson={LESSON}
        onClose={onClose}
        canReschedule={true}
        onReschedule={onReschedule}
        onComplete={onComplete}
        onNoShow={onNoShow}
        onCancel={onCancel}
        {...overrides}
      />
    </QueryClientProvider>
  );

  return { ...utils, onClose, onReschedule, onComplete, onNoShow, onCancel };
}

const LESSON: Lesson = {
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
  pickupAddress: '123 Main St',
  notes: 'Some notes',
  completionVerified: false,
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
} as Lesson;

// Regression: this panel replaces LessonModal.tsx, which used to fetch
// studentsApi.getAll(1, 1000), instructorsApi.getAll(), and
// lessonsApi.getAll(1, 10000)/getByInstructor on every open. The details
// panel needs none of that - student/instructor are read-only, resolved by
// a single targeted getById call each; no lessons list at all.
describe('LessonDetailsPanel - request scope', () => {
  it('fetches only the lesson\'s own student/instructor by id and the vehicle list - never a tenant-wide students/instructors/lessons list', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Test Student')).toBeInTheDocument();
    });

    expect(studentGetByIdMock).toHaveBeenCalledWith('student-1');
    expect(instructorGetByIdMock).toHaveBeenCalledWith('instructor-1');
    expect(vehiclesGetAllMock).toHaveBeenCalledTimes(1);
  });
});

describe('LessonDetailsPanel - schedule fields are never editable', () => {
  it('does not render student, instructor, date, start time, end time, or duration as editable fields', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    expect(screen.queryByTitle('Select Student')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select Instructor')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select Date')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select Start Time')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select End Time')).not.toBeInTheDocument();
  });

  it('still renders lessonType, vehicle, cost, pickup address, and notes as editable', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    expect(screen.getByTitle('Select Lesson Type')).toBeInTheDocument();
    expect(screen.getByTitle('Select Vehicle')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('50.00')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/123 Maple Ave/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Additional notes/i)).toBeInTheDocument();
  });
});

describe('LessonDetailsPanel - submit payload', () => {
  it('sends only details-only fields, never studentId/instructorId/date/startTime/endTime', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    const notesField = screen.getByPlaceholderText(/Additional notes/i);
    fireEvent.change(notesField, { target: { value: 'Updated notes' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.submit(saveButton.closest('form')!);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [calledId, payload] = updateMock.mock.calls[0];
    expect(calledId).toBe('lesson-1');
    expect(payload).toMatchObject({
      lessonType: 'behind_wheel',
      cost: 50,
      pickupAddress: '123 Main St',
      vehicleId: 'vehicle-1',
      notes: 'Updated notes',
    });
    expect(payload).not.toHaveProperty('studentId');
    expect(payload).not.toHaveProperty('instructorId');
    expect(payload).not.toHaveProperty('date');
    expect(payload).not.toHaveProperty('startTime');
    expect(payload).not.toHaveProperty('endTime');
    expect(payload).not.toHaveProperty('duration');
  });
});

describe('LessonDetailsPanel - Reschedule button', () => {
  it('shows a Reschedule button when canReschedule is true and calls onReschedule with the lesson', async () => {
    const { onReschedule } = renderPanel({ canReschedule: true });
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    const rescheduleButton = screen.getByRole('button', { name: /reschedule/i });
    fireEvent.click(rescheduleButton);

    expect(onReschedule).toHaveBeenCalledWith(LESSON);
  });

  it('hides the Reschedule button when canReschedule is false', async () => {
    renderPanel({ canReschedule: false });
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument();
  });
});

describe('LessonDetailsPanel - StatusMenu wiring', () => {
  it('calls onComplete/onNoShow/onCancel with the lesson id when the corresponding status action is chosen', async () => {
    const { onComplete } = renderPanel();
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    const statusTrigger = screen.getByText('scheduled');
    fireEvent.click(statusTrigger);

    const completeOption = await screen.findByText('Completed');
    fireEvent.click(completeOption);

    expect(onComplete).toHaveBeenCalledWith('lesson-1');
  });

  it('disables the status trigger for a non-scheduled lesson (terminal status)', async () => {
    renderPanel({
      lesson: { ...LESSON, status: 'completed' } as Lesson,
    });
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    const statusTrigger = screen.getByText('completed').closest('button');
    expect(statusTrigger).toBeDisabled();
  });
});
