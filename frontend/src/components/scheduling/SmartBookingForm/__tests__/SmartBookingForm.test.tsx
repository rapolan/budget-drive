import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SmartBookingForm } from '../index';
import type { Student, Instructor, RankedTimeSlot } from '@/types';

// This file previously had no afterEach(cleanup), so DOM from earlier
// tests in the same file could remain mounted for later ones (harmless for
// tests that scope queries narrowly, but the new "Book again" tests below
// query by a plain label match across the whole document and were flaky
// without this).
afterEach(cleanup);

const findRankedAvailableSlots = vi.fn();
const getDatePresets = vi.fn();
const createLesson = vi.fn();
const getAllStudents = vi.fn();
const getByStudent = vi.fn();
const getAllInstructors = vi.fn();

vi.mock('@/api', () => ({
  schedulingApi: {
    findRankedAvailableSlots: (...args: unknown[]) => findRankedAvailableSlots(...args),
    getDatePresets: (...args: unknown[]) => getDatePresets(...args),
  },
  lessonsApi: {
    create: (...args: unknown[]) => createLesson(...args),
    getByStudent: (...args: unknown[]) => getByStudent(...args),
  },
  studentsApi: {
    getAll: (...args: unknown[]) => getAllStudents(...args),
  },
  instructorsApi: {
    getAll: (...args: unknown[]) => getAllInstructors(...args),
  },
}));

const STUDENT: Student = {
  id: 'student-1',
  tenantId: 'tenant-1',
  fullName: 'Aisha Williams',
  email: 'aisha@example.com',
  status: 'active',
  enrollmentDate: new Date('2026-01-01'),
  totalHoursCompleted: 10,
  zipCode: '90008',
  address: '555 Maple Ave, Los Angeles, CA 90008',
} as Student;

const INSTRUCTOR: Instructor = {
  id: 'instructor-1',
  tenantId: 'tenant-1',
  fullName: 'John Smith',
  email: 'john@example.com',
  phone: '555-1111',
  zipCode: '90008',
} as Instructor;

const INSTRUCTOR_2: Instructor = {
  id: 'instructor-2',
  tenantId: 'tenant-1',
  fullName: 'Priya Patel',
  email: 'priya@example.com',
  phone: '555-2222',
  zipCode: '90010',
} as Instructor;

const SLOT: RankedTimeSlot = {
  date: '2026-08-03',
  startTime: '10:00',
  endTime: '12:00',
  instructorId: 'instructor-1',
  available: true,
  proximityScore: 100,
  instructorName: 'John Smith',
  instructorZip: '90008',
  comingFrom: 'home',
};

function renderForm(props: Partial<React.ComponentProps<typeof SmartBookingForm>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onBookingComplete = vi.fn();
  const onCancel = vi.fn();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SmartBookingForm onBookingComplete={onBookingComplete} onCancel={onCancel} {...props} />
    </QueryClientProvider>
  );

  return { ...utils, onBookingComplete, onCancel, queryClient };
}

const DATE_PRESETS = {
  next2Weeks: { start: '2026-08-04', end: '2026-08-17' },
  thisMonth: { start: '2026-08-01', end: '2026-08-31' },
  nextMonth: { start: '2026-09-01', end: '2026-09-30' },
};

beforeEach(() => {
  findRankedAvailableSlots.mockReset();
  getDatePresets.mockReset();
  createLesson.mockReset();
  getAllStudents.mockReset();
  getByStudent.mockReset();
  getAllInstructors.mockReset();

  getAllStudents.mockResolvedValue({ data: [STUDENT] });
  getByStudent.mockResolvedValue({ data: [] });
  getDatePresets.mockResolvedValue(DATE_PRESETS);
  getAllInstructors.mockResolvedValue({ data: [INSTRUCTOR, INSTRUCTOR_2] });
});

describe('SmartBookingForm - happy path', () => {
  it('walks setup -> slots -> confirm -> success, and invalidates lesson queries on booking', async () => {
    const user = userEvent.setup();
    findRankedAvailableSlots.mockResolvedValue({
      slots: [SLOT],
      failedInstructors: [],
    });
    createLesson.mockResolvedValue({ data: { id: 'lesson-1' } });

    const { onBookingComplete, queryClient } = renderForm({ preselectedStudent: STUDENT });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Setup step: student is locked (preselected), pickup address auto-filled
    expect(await screen.findByText('Aisha Williams')).toBeInTheDocument();

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    // Slots step
    expect(await screen.findByText('Available Time Slots')).toBeInTheDocument();
    // The default "Next 2 Weeks" preset's server-computed boundary is sent
    // as explicit startDate/endDate - never a client-computed dateRange count.
    expect(findRankedAvailableSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        pickupZip: '90008',
        startDate: DATE_PRESETS.next2Weeks.start,
        endDate: DATE_PRESETS.next2Weeks.end,
      })
    );

    // Expand the instructor group, then pick the slot
    const instructorHeader = await screen.findByText('John Smith');
    await user.click(instructorHeader);
    const slotButton = await screen.findByText(/10:00 AM - 12:00 PM/i);
    await user.click(slotButton);

    // Confirm step
    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    await waitFor(() => expect(createLesson).toHaveBeenCalledTimes(1));
    expect(createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        instructorId: 'instructor-1',
        date: '2026-08-03',
        startTime: '10:00:00',
        endTime: '12:00:00',
      })
    );

    await waitFor(() => expect(onBookingComplete).toHaveBeenCalledWith('lesson-1'));

    // Cache invalidation fired for lessons/instructor-lessons and availability
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['availability'] })
    );
    const predicateCall = invalidateSpy.mock.calls.find(
      ([arg]) => typeof (arg as { predicate?: unknown })?.predicate === 'function'
    );
    expect(predicateCall).toBeDefined();
  });
});

describe('SmartBookingForm - stale-slot conflict recovery', () => {
  it('shows a recovery notice and returns to the slots step when confirm hits a race-condition conflict', async () => {
    const user = userEvent.setup();

    findRankedAvailableSlots
      .mockResolvedValueOnce({ slots: [SLOT], failedInstructors: [] })
      .mockResolvedValueOnce({
        slots: [{ ...SLOT, startTime: '14:00', endTime: '16:00' }],
        failedInstructors: [],
      });

    createLesson.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          success: false,
          error: 'Scheduling conflict: Vehicle is already assigned to another lesson',
          conflictType: 'vehicle_busy',
        },
      },
    });

    renderForm({ preselectedStudent: STUDENT });

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    const instructorHeader = (await screen.findAllByText('John Smith'))[0];
    await user.click(instructorHeader);
    const slotButton = await screen.findByText(/10:00 AM - 12:00 PM/i);
    await user.click(slotButton);

    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    // Recovery: back on the slots step with a notice, and the search ran a
    // second time (proving the re-search actually happened, not just the UI text)
    expect(await screen.findByText('That slot was just taken - here are updated options.')).toBeInTheDocument();
    expect(findRankedAvailableSlots).toHaveBeenCalledTimes(2);

    // The re-search's fresh 2-4pm slot is available once its instructor group is expanded
    const instructorHeaderAgain = (await screen.findAllByText('John Smith'))[0];
    await user.click(instructorHeaderAgain);
    expect(await screen.findByText(/2:00 PM - 4:00 PM/i)).toBeInTheDocument();
  });
});

describe('SmartBookingForm - preselected-instructor mode', () => {
  it('scopes the search to the preselected instructor and shows it locked', async () => {
    const user = userEvent.setup();
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });

    renderForm({ preselectedStudent: STUDENT, preselectedInstructor: INSTRUCTOR });

    // Instructor is shown as a locked card, not a picker
    const instructorLabel = await screen.findByText('Instructor', { selector: 'label' });
    const instructorSection = instructorLabel.closest('div')?.parentElement as HTMLElement;
    expect(within(instructorSection).getByText('John Smith')).toBeInTheDocument();

    const findButton = await screen.findByRole('button', { name: /find available times/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    await waitFor(() => expect(findRankedAvailableSlots).toHaveBeenCalledTimes(1));
    expect(findRankedAvailableSlots).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'instructor-1' })
    );
  });
});

// "Book again" prefill mode (item 5): only prefilledInstructorId/etc. are
// passed, never the locked preselectedInstructor - the wizard must land on
// 'setup' (canSkipToConfirm stays false) with a real, changeable instructor
// selector, not a locked display.
describe('SmartBookingForm - "Book again" prefill mode', () => {
  it('lands on the setup step (not confirm) with prefilled fields, and shows a changeable instructor selector', async () => {
    renderForm({
      preselectedStudent: STUDENT,
      prefilledInstructorId: 'instructor-1',
      prefilledDuration: 90,
      prefilledLessonType: 'classroom',
      prefilledTimePreference: 'afternoon',
      prefilledPickupAddress: '456 Prior Lesson Ave, 90008',
    });

    // Still on setup, not skipped ahead to confirm - the locked-preselect
    // gate (student+instructor+date+time all required) never fires here.
    expect(await screen.findByText('Aisha Williams')).toBeInTheDocument();
    expect(screen.queryByText('Booking Summary')).not.toBeInTheDocument();

    // A real <select>, pre-populated with the prefilled instructor but
    // changeable - not the locked display card preselectedInstructor renders.
    const instructorSelect = await screen.findByLabelText(/instructor/i) as HTMLSelectElement;
    expect(instructorSelect.tagName).toBe('SELECT');
    expect(instructorSelect.value).toBe('instructor-1');

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Priya Patel')).toBeInTheDocument());
    await user.selectOptions(instructorSelect, 'instructor-2');
    expect(instructorSelect.value).toBe('instructor-2');
  });

  it('sends the newly-selected instructor (not the original prefill) once changed, and duration/lessonType/timePreference from the prefill', async () => {
    const user = userEvent.setup();
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });

    renderForm({
      preselectedStudent: STUDENT,
      prefilledInstructorId: 'instructor-1',
      prefilledDuration: 90,
      prefilledLessonType: 'classroom',
      prefilledTimePreference: 'afternoon',
      prefilledPickupAddress: '456 Prior Lesson Ave, 90008',
    });

    const instructorSelect = await screen.findByLabelText(/instructor/i) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText('Priya Patel')).toBeInTheDocument());
    await user.selectOptions(instructorSelect, 'instructor-2');

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    await waitFor(() => expect(findRankedAvailableSlots).toHaveBeenCalledTimes(1));
    expect(findRankedAvailableSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        instructorId: 'instructor-2',
        duration: 90,
        timePreference: 'afternoon',
      })
    );
  });

  it('does not render the free-choice instructor selector for the Reschedule flow (locked preselectedInstructor)', async () => {
    renderForm({ preselectedStudent: STUDENT, preselectedInstructor: INSTRUCTOR });

    // The locked display card renders (already covered by the
    // preselected-instructor describe block above); the new <select>
    // must not also appear alongside it.
    await screen.findByText('Instructor', { selector: 'label' });
    expect(screen.queryByRole('combobox', { name: /instructor/i })).not.toBeInTheDocument();
  });
});
