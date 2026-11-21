import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LessonDetailsPanel } from './LessonDetailsPanel';
import type { Lesson } from '@/types';

const {
  updateMock,
  studentGetByIdMock,
  instructorGetByIdMock,
  vehiclesGetAllMock,
  lastCompletedNoteMock,
} = vi.hoisted(() => ({
  updateMock: vi.fn().mockResolvedValue({ data: {} }),
  studentGetByIdMock: vi.fn().mockResolvedValue({
    data: {
      id: 'student-1',
      fullName: 'Test Student',
      phone: '555-0100',
      enrollments: [
        {
          id: 'enrollment-1',
          progress: { lessonsCompleted: 4, lessonsRequired: 10 },
          paymentSummary: { totalPaid: 100, outstandingBalance: 50, paymentStatus: 'partial' },
        },
      ],
    },
  }),
  instructorGetByIdMock: vi.fn().mockResolvedValue({
    data: { id: 'instructor-1', fullName: 'Test Instructor' },
  }),
  vehiclesGetAllMock: vi.fn().mockResolvedValue({
    data: [{ id: 'vehicle-1', make: 'Toyota', model: 'Corolla', licensePlate: 'ABC123', status: 'active' }],
  }),
  lastCompletedNoteMock: vi.fn().mockResolvedValue({ data: null }),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getById: studentGetByIdMock },
    instructorsApi: { ...actual.instructorsApi, getById: instructorGetByIdMock },
    vehiclesApi: { ...actual.vehiclesApi, getAll: vehiclesGetAllMock },
    lessonsApi: {
      ...actual.lessonsApi,
      update: updateMock,
      getLastCompletedNoteByStudent: lastCompletedNoteMock,
    },
  };
});

afterEach(() => {
  cleanup();
  updateMock.mockClear();
  studentGetByIdMock.mockClear();
  instructorGetByIdMock.mockClear();
  vehiclesGetAllMock.mockClear();
  lastCompletedNoteMock.mockClear();
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
  const onBookAgain = vi.fn();

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
        onBookAgain={onBookAgain}
        {...overrides}
      />
    </QueryClientProvider>
  );

  return { ...utils, onClose, onReschedule, onComplete, onNoShow, onCancel, onBookAgain };
}

const LESSON: Lesson = {
  id: 'lesson-1',
  tenantId: 'tenant-1',
  studentId: 'student-1',
  enrollmentId: 'enrollment-1',
  instructorId: 'instructor-1',
  vehicleId: 'vehicle-1',
  // The real API transmits this as an ISO string ("2026-08-20T00:00:00.000Z")
  // despite the Lesson type's `Date` annotation - using a real `Date` object
  // here instead would hide a UTC-shift bug that only shows up against the
  // actual wire shape (see parseLocalDate's doc comment).
  date: '2026-08-20T00:00:00.000Z' as unknown as Date,
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

async function waitForLoaded() {
  await waitFor(() => expect(screen.getAllByText('Test Student').length).toBeGreaterThan(0));
}

// Regression: this panel replaces the old field-first LessonDetailsPanel,
// which fetched studentsApi.getAll(1, 1000), instructorsApi.getAll(), and
// lessonsApi.getAll(1, 10000)/getByInstructor on every open. The redesigned
// panel needs: student by id, instructor by id, the vehicle list, and the
// new small "last completed note" lookup - never a tenant-wide list.
describe('LessonDetailsPanel - request scope (per-open query count)', () => {
  it('fetches exactly 4 targeted requests - student, instructor, vehicles, last-completed-note - never a tenant-wide list', async () => {
    renderPanel();
    await waitForLoaded();

    expect(studentGetByIdMock).toHaveBeenCalledWith('student-1');
    expect(instructorGetByIdMock).toHaveBeenCalledWith('instructor-1');
    expect(vehiclesGetAllMock).toHaveBeenCalledTimes(1);
    expect(lastCompletedNoteMock).toHaveBeenCalledWith('student-1', 'lesson-1');
    expect(studentGetByIdMock).toHaveBeenCalledTimes(1);
    expect(instructorGetByIdMock).toHaveBeenCalledTimes(1);
    expect(lastCompletedNoteMock).toHaveBeenCalledTimes(1);
  });
});

describe('LessonDetailsPanel - summary content', () => {
  it('renders student name and status badge in the header, with date/time/duration as the subtitle', async () => {
    const { container } = renderPanel();
    await waitForLoaded();

    expect(screen.getByText('scheduled')).toBeInTheDocument();
    // The subtitle is one <p> with several JSX expression children (date,
    // start/end time, duration), so no single text node contains the full
    // string - assert against the paragraph's combined textContent instead.
    const subtitle = container.querySelector('p.text-tx-muted');
    expect(subtitle?.textContent).toContain('Aug 20, 2026');
    expect(subtitle?.textContent).toContain('9:00 AM');
    expect(subtitle?.textContent).toContain('10:00 AM');
    expect(subtitle?.textContent).toContain('1 hour');
  });

  it('formats duration in whole minutes/hours, never a raw decimal', async () => {
    const { container, unmount } = renderPanel({ lesson: { ...LESSON, duration: 90 } as Lesson });
    await waitForLoaded();
    expect(container.querySelector('p.text-tx-muted')?.textContent).toContain('90 min');
    unmount();

    const { container: container2 } = renderPanel({ lesson: { ...LESSON, duration: 120 } as Lesson });
    await waitForLoaded();
    expect(container2.querySelector('p.text-tx-muted')?.textContent).toContain('2 hours');
    expect(container2.querySelector('p.text-tx-muted')?.textContent).not.toContain('120.00');
  });

  it('formats duration correctly when it arrives as a Postgres numeric string', async () => {
    const { container } = renderPanel({ lesson: { ...LESSON, duration: '120.00' as unknown as number } as Lesson });
    await waitForLoaded();
    expect(container.querySelector('p.text-tx-muted')?.textContent).toContain('2 hours');
  });

  it('renders phone as a tel: link, instructor, pickup as a maps link, and vehicle', async () => {
    renderPanel();
    await waitForLoaded();

    const phoneLink = screen.getByRole('link', { name: /555-0100/ });
    expect(phoneLink).toHaveAttribute('href', 'tel:555-0100');

    expect(screen.getByText('Test Instructor')).toBeInTheDocument();

    const mapsLink = screen.getByRole('link', { name: /123 Main St/ });
    expect(mapsLink.getAttribute('href')).toContain('google.com/maps');

    expect(screen.getAllByText(/Toyota Corolla \(ABC123\)/).length).toBeGreaterThan(0);
  });

  it('renders Progress as "N of M completed" when the lesson has no lessonNumber of its own, and the enrollment balance under its own label', async () => {
    renderPanel();
    await waitForLoaded();

    // lessonNumber isn't set on the base fixture - "4 of 10 completed" is
    // the honest count-so-far, NOT "Lesson 4 of 10" (which would wrongly
    // imply this lesson is #4 in the sequence).
    expect(screen.getByText('4 of 10 completed')).toBeInTheDocument();
    expect(screen.getByText('Enrollment balance')).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00 paid, \$50\.00 owed/)).toBeInTheDocument();
  });

  it('renders Progress as "Lesson N of M" when the lesson\'s own lessonNumber is set', async () => {
    renderPanel({ lesson: { ...LESSON, lessonNumber: 4 } as Lesson });
    await waitForLoaded();

    expect(screen.getByText('Lesson 4 of 10')).toBeInTheDocument();
  });

  // Regression: a reschedule or a student needing extra lessons can
  // legitimately push lessonNumber past lessonsRequired - "Lesson 11 of
  // 10" reads as nonsensical, so drop the "of M" half once N exceeds M.
  it('renders just "Lesson N" (no "of M") when lessonNumber exceeds lessonsRequired', async () => {
    renderPanel({ lesson: { ...LESSON, lessonNumber: 11 } as Lesson });
    await waitForLoaded();

    expect(screen.getByText('Lesson 11')).toBeInTheDocument();
    expect(screen.queryByText(/Lesson 11 of/)).not.toBeInTheDocument();
  });

  it('hides the Payment cell entirely when paymentStatus is "unknown"', async () => {
    studentGetByIdMock.mockResolvedValueOnce({
      data: {
        id: 'student-1',
        fullName: 'Test Student',
        phone: '555-0100',
        enrollments: [
          {
            id: 'enrollment-1',
            progress: { lessonsCompleted: 4, lessonsRequired: 10 },
            paymentSummary: { totalPaid: 0, outstandingBalance: null, paymentStatus: 'unknown' },
          },
        ],
      },
    });
    renderPanel();
    await waitForLoaded();

    expect(screen.queryByText('Enrollment balance')).not.toBeInTheDocument();
  });

  it('shows the "Last lesson" note when present and hides it when absent', async () => {
    lastCompletedNoteMock.mockResolvedValueOnce({
      data: { date: '2026-07-01T00:00:00.000Z', notes: 'Great progress on parallel parking' },
    });
    renderPanel();
    await waitForLoaded();

    await waitFor(() => expect(screen.getByText(/Great progress on parallel parking/)).toBeInTheDocument());
    expect(screen.getByText(/Last lesson/)).toBeInTheDocument();
  });

  it('hides the "Last lesson" block entirely when there is no prior completed lesson', async () => {
    renderPanel();
    await waitForLoaded();

    expect(screen.queryByText(/Last lesson/)).not.toBeInTheDocument();
  });
});

describe('LessonDetailsPanel - schedule fields are never editable', () => {
  it('does not render student, instructor, date, start time, or end time as editable fields', async () => {
    renderPanel();
    await waitForLoaded();

    expect(screen.queryByTitle('Select Student')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select Instructor')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select Date')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select Start Time')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Select End Time')).not.toBeInTheDocument();
  });

  it('renders notes, pickup address, and vehicle as editable, with lessonType/lessonNumber/cost inside the collapsed Admin details section', async () => {
    renderPanel();
    await waitForLoaded();

    expect(screen.getByPlaceholderText(/Additional notes/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/123 Maple Ave/i)).toBeInTheDocument();
    expect(screen.getByTitle('Select Vehicle')).toBeInTheDocument();

    // Collapsed by default - not in the DOM as an interactive field yet.
    expect(screen.queryByTitle('Select Lesson Type')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('50.00')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /admin details/i }));

    expect(screen.getByTitle('Select Lesson Type')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('50.00')).toBeInTheDocument();
  });
});

describe('LessonDetailsPanel - Admin details collapsed by default', () => {
  it('starts collapsed and expands on click', async () => {
    renderPanel();
    await waitForLoaded();

    const toggle = screen.getByRole('button', { name: /admin details/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('LessonDetailsPanel - submit payload', () => {
  it('sends only details-only fields, never studentId/instructorId/date/startTime/endTime', async () => {
    renderPanel();
    await waitForLoaded();

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

describe('LessonDetailsPanel - action row (scheduled lessons only)', () => {
  it('shows Reschedule (left) and Complete/No-show/Cancel (right) for a scheduled lesson when canReschedule is true', async () => {
    const { onReschedule, onComplete, onNoShow, onCancel } = renderPanel({ canReschedule: true });
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: /reschedule/i }));
    expect(onReschedule).toHaveBeenCalledWith(LESSON);

    fireEvent.click(screen.getByRole('button', { name: /^complete$/i }));
    expect(onComplete).toHaveBeenCalledWith('lesson-1');

    fireEvent.click(screen.getByRole('button', { name: /no-show/i }));
    expect(onNoShow).toHaveBeenCalledWith('lesson-1');

    fireEvent.click(screen.getByRole('button', { name: /cancel lesson/i }));
    expect(onCancel).toHaveBeenCalledWith('lesson-1');
  });

  it('hides Reschedule when canReschedule is false but still shows Complete/No-show/Cancel', async () => {
    renderPanel({ canReschedule: false });
    await waitForLoaded();

    expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^complete$/i })).toBeInTheDocument();
  });

  it('hides the entire action row for a non-scheduled (terminal) lesson', async () => {
    renderPanel({ lesson: { ...LESSON, status: 'completed' } as Lesson });
    await waitForLoaded();

    expect(screen.queryByRole('button', { name: /reschedule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^complete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /no-show/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel lesson/i })).not.toBeInTheDocument();
  });
});

describe('LessonDetailsPanel - terminal lessons are read-only except Notes', () => {
  it.each(['completed', 'no_show'] as const)('hides pickup/vehicle/admin-details editing for a %s lesson, leaving only Notes editable', async (status) => {
    renderPanel({ lesson: { ...LESSON, status } as Lesson });
    await waitForLoaded();

    expect(screen.getByPlaceholderText(/Additional notes/i)).toBeInTheDocument();
    expect(screen.queryByTitle('Select Vehicle')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/123 Maple Ave/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /admin details/i })).not.toBeInTheDocument();
  });

  it('submits only notes for a terminal lesson, never cost/type/vehicle/pickup', async () => {
    renderPanel({ lesson: { ...LESSON, status: 'completed' } as Lesson });
    await waitForLoaded();

    const notesField = screen.getByPlaceholderText(/Additional notes/i);
    fireEvent.change(notesField, { target: { value: 'Updated after the fact' } });
    fireEvent.submit(screen.getByRole('button', { name: /save changes/i }).closest('form')!);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateMock.mock.calls[0];
    expect(payload).toEqual({ notes: 'Updated after the fact' });
  });
});

describe('LessonDetailsPanel - Book Again on cancelled lessons', () => {
  it('shows a Book Again button for a cancelled lesson and calls onBookAgain, never un-cancelling in place', async () => {
    const { onBookAgain } = renderPanel({ lesson: { ...LESSON, status: 'cancelled' } as Lesson });
    await waitForLoaded();

    const bookAgainButton = screen.getByRole('button', { name: /book again/i });
    fireEvent.click(bookAgainButton);

    expect(onBookAgain).toHaveBeenCalledWith(expect.objectContaining({ id: 'lesson-1', status: 'cancelled' }));
  });

  it('does not show Book Again for a scheduled lesson', async () => {
    renderPanel();
    await waitForLoaded();

    expect(screen.queryByRole('button', { name: /book again/i })).not.toBeInTheDocument();
  });
});
