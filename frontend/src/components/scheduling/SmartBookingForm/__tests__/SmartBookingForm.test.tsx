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

// Mutable so individual tests can override the tenant's defaultLessonCost
// without a full vi.mock reset - defaults back to 150 in beforeEach.
let mockTenantSettings: { defaultLessonCost: number | string } | null = { defaultLessonCost: 150 };
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ settings: mockTenantSettings }),
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
  mockTenantSettings = { defaultLessonCost: 150 };
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

    // Success step, not an immediate close - onBookingComplete is deferred
    // until the user explicitly clicks "Done" (or "Book Another Lesson").
    expect(await screen.findByText('Lesson Booked!')).toBeInTheDocument();
    expect(onBookingComplete).not.toHaveBeenCalled();

    // Cache invalidation already fired on the booking itself, independent
    // of onBookingComplete's timing - confirms list views stay live even
    // while the wizard remains open on the success step.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['availability'] })
    );
    const predicateCall = invalidateSpy.mock.calls.find(
      ([arg]) => typeof (arg as { predicate?: unknown })?.predicate === 'function'
    );
    expect(predicateCall).toBeDefined();

    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onBookingComplete).toHaveBeenCalledWith('lesson-1');
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
    const instructorLabel = await screen.findByText('Instructor', { selector: 'h3' });
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

  // Regression: Postgres numeric columns (lessons.duration) come back
  // through the API as strings ("60.00", not 60) - Students.tsx's
  // handleBookAgain is supposed to coerce this before it ever reaches
  // prefilledDuration, but this proves the wizard is ALSO safe on its own
  // if a future caller forgets, since an uncoerced string here used to
  // reach schedulingService's slot-generation arithmetic and silently
  // string-concatenate instead of adding (540 + "60.00" = "54060.00"),
  // producing zero search results every time.
  it('coerces a string-typed prefilledDuration (real Postgres numeric-column shape) to a number before searching', async () => {
    const user = userEvent.setup();
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });

    renderForm({
      preselectedStudent: STUDENT,
      prefilledInstructorId: 'instructor-1',
      prefilledDuration: '60.00' as unknown as number,
      prefilledLessonType: 'behind_wheel',
      prefilledTimePreference: 'any',
      prefilledPickupAddress: '456 Prior Lesson Ave, 90008',
    });

    const durationSelect = await screen.findByTitle('Select lesson duration') as HTMLSelectElement;
    expect(durationSelect.value).toBe('60');

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    await waitFor(() => expect(findRankedAvailableSlots).toHaveBeenCalledTimes(1));
    const [callArgs] = findRankedAvailableSlots.mock.calls[0];
    expect(callArgs.duration).toBe(60);
    expect(typeof callArgs.duration).toBe('number');
  });

  it('does not render the free-choice instructor selector for the Reschedule flow (locked preselectedInstructor)', async () => {
    renderForm({ preselectedStudent: STUDENT, preselectedInstructor: INSTRUCTOR });

    // The locked display card renders (already covered by the
    // preselected-instructor describe block above); the new <select>
    // must not also appear alongside it.
    await screen.findByText('Instructor', { selector: 'h3' });
    expect(screen.queryByRole('combobox', { name: /instructor/i })).not.toBeInTheDocument();
  });
});

// Reschedule flow regression guard: when student+instructor+date+time are
// ALL preselected (canSkipToConfirm), there's no meaningful "book another"
// - onBookingComplete must still fire immediately on confirm, exactly as
// it did before the success step existed.
describe('SmartBookingForm - Reschedule flow (canSkipToConfirm) skips the success step', () => {
  it('calls onBookingComplete immediately on confirm, without showing the success step', async () => {
    const user = userEvent.setup();
    createLesson.mockResolvedValue({ data: { id: 'lesson-reschedule-1' } });

    const { onBookingComplete } = renderForm({
      preselectedStudent: STUDENT,
      preselectedInstructor: INSTRUCTOR,
      preselectedDate: new Date('2026-08-03T00:00:00'),
      preselectedTime: { start: '10:00', end: '12:00' },
    });

    // Jumps straight to confirm - no setup/slots search at all.
    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
    expect(findRankedAvailableSlots).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    await waitFor(() => expect(onBookingComplete).toHaveBeenCalledWith('lesson-reschedule-1'));
    // The success step's own text never appears - this path bypasses it entirely.
    expect(screen.queryByText('Lesson Booked!')).not.toBeInTheDocument();
  });
});

// "Book Another": returns to SETUP (not slots) with student, instructor
// choice, duration, lesson type, and time preference intact - only what's
// specific to the lesson just booked (slot/cost/notes/lesson-number) is
// reset, and the date range is pre-advanced to start the day after the
// just-booked lesson so the common case (booking the next one in a
// sequence) needs no editing before the user runs a fresh search.
describe('SmartBookingForm - "Book Another" preserves preferences and returns to setup', () => {
  it('lands on the setup step (not slots) with preferences intact, and pre-advances the date range to the day after the just-booked lesson', async () => {
    const user = userEvent.setup();

    findRankedAvailableSlots.mockResolvedValueOnce({ slots: [SLOT], failedInstructors: [] });
    createLesson.mockResolvedValue({ data: { id: 'lesson-1' } });

    renderForm({ preselectedStudent: STUDENT });

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    const instructorHeader = await screen.findByText('John Smith');
    await user.click(instructorHeader);
    const slotButton = await screen.findByText(/10:00 AM - 12:00 PM/i);
    await user.click(slotButton);

    const confirmButton = await screen.findByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    expect(await screen.findByText('Lesson Booked!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /book another lesson/i }));

    // Back on the setup step (not slots) - no automatic re-search fires.
    expect(await screen.findByText('Aisha Williams')).toBeInTheDocument();
    expect(screen.queryByText('Available Time Slots')).not.toBeInTheDocument();
    expect(findRankedAvailableSlots).toHaveBeenCalledTimes(1);

    // Date range pre-advanced: SLOT.date is '2026-08-03', so the new range
    // starts '2026-08-04' - the day after - carrying forward the original
    // 13-day span (next2Weeks: 08-04 to 08-17) rather than collapsing to a
    // single day or resetting to a different preset.
    const fromInput = screen.getByLabelText('From') as HTMLInputElement;
    const toInput = screen.getByLabelText('To') as HTMLInputElement;
    await waitFor(() => expect(fromInput.value).toBe('2026-08-04'));
    expect(toInput.value).toBe('2026-08-17');

    // Running a fresh search from here sends the pre-advanced range, and
    // the same student/duration/timePreference preferences as before.
    findRankedAvailableSlots.mockResolvedValueOnce({ slots: [SLOT], failedInstructors: [] });
    const findButtonAgain = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButtonAgain).not.toBeDisabled());
    await user.click(findButtonAgain);

    await waitFor(() => expect(findRankedAvailableSlots).toHaveBeenCalledTimes(2));
    const [firstCallArgs] = findRankedAvailableSlots.mock.calls[0];
    const [secondCallArgs] = findRankedAvailableSlots.mock.calls[1];
    expect(secondCallArgs).toEqual(
      expect.objectContaining({
        studentId: firstCallArgs.studentId,
        duration: firstCallArgs.duration,
        timePreference: firstCallArgs.timePreference,
        startDate: '2026-08-04',
        endDate: '2026-08-17',
      })
    );
  });
});

// Proximity badge consistency (bug fix): GroupedAvailabilityView previously
// only rendered a badge at the instructor-header level using the best score
// across ALL of that instructor's slots, so a slot with a lower score than
// the header could read "Close" in the list and then a different tier on
// ConfirmStep once selected. Each slot row now shows its own badge, computed
// from that slot's own proximityScore - the same value ConfirmStep uses -
// so what you pick is what you saw.
describe('SmartBookingForm - proximity badge consistency', () => {
  it("shows the selected slot's own badge on both the slot row and the confirm step, even when a different slot from the same instructor has a better score", async () => {
    const user = userEvent.setup();
    const CLOSE_SLOT = { ...SLOT, startTime: '10:00', endTime: '12:00', proximityScore: 95 }; // "Very Close"
    const FAR_SLOT = { ...SLOT, startTime: '14:00', endTime: '16:00', proximityScore: 40 }; // "Far"
    findRankedAvailableSlots.mockResolvedValue({ slots: [CLOSE_SLOT, FAR_SLOT], failedInstructors: [] });

    renderForm({ preselectedStudent: STUDENT });

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    const instructorHeader = await screen.findByText('John Smith');
    // Header badge reflects the BEST score across this instructor's slots
    // (95 -> "Very Close"), explicitly labeled "Closest:" so it reads as a
    // summary rather than a per-slot guarantee.
    expect(await screen.findByText('Closest: 🏠 Very Close')).toBeInTheDocument();
    await user.click(instructorHeader);

    // Each slot row shows its OWN badge - the close slot reads "Very Close"...
    const closeSlotRow = (await screen.findByText(/10:00 AM - 12:00 PM/i)).closest('button') as HTMLElement;
    expect(within(closeSlotRow).getByText('🏠 Very Close')).toBeInTheDocument();

    // ...and the far slot (same instructor, lower score) reads "Far", not
    // the instructor's best score.
    const farSlotRow = (await screen.findByText(/2:00 PM - 4:00 PM/i)).closest('button') as HTMLElement;
    expect(within(farSlotRow).getByText('🗺️ Far')).toBeInTheDocument();

    // Selecting the FAR slot: ConfirmStep's badge must match what that
    // slot's own row showed in the list ("Far"), not the instructor
    // header's "Very Close" summary.
    await user.click(farSlotRow);
    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
    expect(screen.getByText('🗺️ Far')).toBeInTheDocument();
    expect(screen.queryByText('🏠 Very Close')).not.toBeInTheDocument();
  });
});

// Lesson-number auto-suggestion (bug fix): the effect that computes it
// previously required studentLessons.length > 0, so a student with ZERO
// prior lessons never got a suggestion at all (stuck on "Not set") even
// though completedOrScheduled.length + 1 is a valid "1" from an empty array.
describe('SmartBookingForm - lesson number auto-suggestion', () => {
  async function getToConfirmStep(user: ReturnType<typeof userEvent.setup>) {
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });
    renderForm({ preselectedStudent: STUDENT });

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    const instructorHeader = await screen.findByText('John Smith');
    await user.click(instructorHeader);
    const slotButton = await screen.findByText(/10:00 AM - 12:00 PM/i);
    await user.click(slotButton);

    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
  }

  it('suggests "1" for a student with zero prior lessons', async () => {
    const user = userEvent.setup();
    getByStudent.mockResolvedValue({ data: [] });

    await getToConfirmStep(user);

    const lessonNumberSelect = screen.getByTitle('Select lesson number') as HTMLSelectElement;
    await waitFor(() => expect(lessonNumberSelect.value).toBe('1'));
  });

  it('suggests "2" for a student with 1 prior completed/scheduled lesson', async () => {
    const user = userEvent.setup();
    getByStudent.mockResolvedValue({
      data: [{ id: 'prior-1', status: 'completed' }],
    });

    await getToConfirmStep(user);

    const lessonNumberSelect = screen.getByTitle('Select lesson number') as HTMLSelectElement;
    await waitFor(() => expect(lessonNumberSelect.value).toBe('2'));
  });

  it('suggests "3" for a student with 2 prior completed/scheduled lessons', async () => {
    const user = userEvent.setup();
    getByStudent.mockResolvedValue({
      data: [
        { id: 'prior-1', status: 'completed' },
        { id: 'prior-2', status: 'scheduled' },
      ],
    });

    await getToConfirmStep(user);

    const lessonNumberSelect = screen.getByTitle('Select lesson number') as HTMLSelectElement;
    await waitFor(() => expect(lessonNumberSelect.value).toBe('3'));
  });
});

// Default lesson cost (tenant_settings.default_lesson_cost): prefills the
// Confirm step's cost field from the tenant's configured default, still
// freely editable per lesson - never a substitute for a real per-lesson
// price the user has actually entered.
describe('SmartBookingForm - default lesson cost prefill', () => {
  async function getToConfirmStep(user: ReturnType<typeof userEvent.setup>) {
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });
    renderForm({ preselectedStudent: STUDENT });

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    const instructorHeader = await screen.findByText('John Smith');
    await user.click(instructorHeader);
    const slotButton = await screen.findByText(/10:00 AM - 12:00 PM/i);
    await user.click(slotButton);

    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
  }

  it('prefills the cost field from the tenant default', async () => {
    const user = userEvent.setup();
    mockTenantSettings = { defaultLessonCost: 175 };

    await getToConfirmStep(user);

    const costInput = screen.getByTitle('Lesson cost') as HTMLInputElement;
    await waitFor(() => expect(costInput.value).toBe('175'));
  });

  // Regression: Postgres numeric columns come back through the API as
  // strings (e.g. "150.00", not 150) - the real tenant_settings response
  // shape, unlike a plain-number test fixture. cost.toFixed() in the
  // Confirm Booking button label throws if cost is ever left as a string.
  it('prefills correctly even when the tenant default arrives as a numeric string (real API shape)', async () => {
    const user = userEvent.setup();
    mockTenantSettings = { defaultLessonCost: '175.00' };

    await getToConfirmStep(user);

    const costInput = screen.getByTitle('Lesson cost') as HTMLInputElement;
    await waitFor(() => expect(costInput.value).toBe('175'));
    expect(screen.getByRole('button', { name: /confirm booking - \$175\.00/i })).toBeInTheDocument();
  });

  it('preserves an explicitly-entered cost rather than reverting to the tenant default', async () => {
    const user = userEvent.setup();
    mockTenantSettings = { defaultLessonCost: 150 };
    createLesson.mockResolvedValue({ data: { id: 'lesson-1' } });

    await getToConfirmStep(user);

    const costInput = screen.getByTitle('Lesson cost') as HTMLInputElement;
    await waitFor(() => expect(costInput.value).toBe('150'));

    await user.clear(costInput);
    await user.type(costInput, '99');
    expect(costInput.value).toBe('99');

    const confirmButton = screen.getByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    await waitFor(() => expect(createLesson).toHaveBeenCalledTimes(1));
    expect(createLesson).toHaveBeenCalledWith(
      expect.objectContaining({ cost: 99 })
    );
  });
});

describe('SmartBookingForm - "Book Another" done button', () => {
  it('"Done" closes without booking again - a one-click exit from the success step', async () => {
    const user = userEvent.setup();
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });
    createLesson.mockResolvedValue({ data: { id: 'lesson-1' } });

    const { onBookingComplete } = renderForm({ preselectedStudent: STUDENT });

    const findButton = await screen.findByRole('button', { name: /find available instructors/i });
    await waitFor(() => expect(findButton).not.toBeDisabled());
    await user.click(findButton);

    const instructorHeader = await screen.findByText('John Smith');
    await user.click(instructorHeader);
    const slotButton = await screen.findByText(/10:00 AM - 12:00 PM/i);
    await user.click(slotButton);

    const confirmButton = await screen.findByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    expect(await screen.findByText('Lesson Booked!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(onBookingComplete).toHaveBeenCalledWith('lesson-1');
    // Only the one search ran - "Done" never re-triggers a search.
    expect(findRankedAvailableSlots).toHaveBeenCalledTimes(1);
  });
});
