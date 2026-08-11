import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SmartBookingForm } from '../index';
import type { Student, Instructor, RankedTimeSlot } from '@/types';

const findRankedAvailableSlots = vi.fn();
const getDatePresets = vi.fn();
const createLesson = vi.fn();
const getAllStudents = vi.fn();
const getByStudent = vi.fn();

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

  getAllStudents.mockResolvedValue({ data: [STUDENT] });
  getByStudent.mockResolvedValue({ data: [] });
  getDatePresets.mockResolvedValue(DATE_PRESETS);
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
