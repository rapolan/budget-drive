import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeeklyAvailabilityGrid } from './WeeklyAvailabilityGrid';
import { schedulingApi } from '@/api';
import type { InstructorAvailability } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    schedulingApi: {
      ...actual.schedulingApi,
      getInstructorAvailability: vi.fn(),
      getSchedulingSettings: vi.fn(),
      setWeekAvailability: vi.fn(),
    },
  };
});

afterEach(cleanup);

const INSTRUCTOR_ID = 'instructor-1';

function availabilityRow(overrides: Partial<InstructorAvailability> = {}): InstructorAvailability {
  return {
    id: 'row-1',
    tenantId: 'tenant-1',
    instructorId: INSTRUCTOR_ID,
    dayOfWeek: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
    maxStudents: 3,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function mockDefaults() {
  (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (schedulingApi.getSchedulingSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
    defaultMaxStudentsPerDay: 3,
  });
}

describe('WeeklyAvailabilityGrid - loading and seeding all 7 days', () => {
  it('always renders all 7 days, even when the instructor has no availability rows at all', async () => {
    mockDefaults();

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      expect(await screen.findByText(day)).toBeInTheDocument();
    }
    // All unchecked -> all "Not working"
    expect(screen.getAllByText('Not working')).toHaveLength(7);
  });

  it('checks the box and shows start/end/max-students inputs for a day with an active row', async () => {
    (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue([
      availabilityRow({ dayOfWeek: 1, startTime: '08:00:00', endTime: '14:00:00', maxStudents: 2 }),
    ]);
    (schedulingApi.getSchedulingSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      defaultMaxStudentsPerDay: 3,
    });

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    const mondayCheckbox = await screen.findByLabelText('Monday works this day');
    expect(mondayCheckbox).toBeChecked();

    const startInput = screen.getByLabelText('Start') as HTMLInputElement;
    expect(startInput.value).toBe('08:00');
    const endInput = screen.getByLabelText('End') as HTMLInputElement;
    expect(endInput.value).toBe('14:00');

    // Every other day still unchecked and collapsed.
    expect(screen.getAllByText('Not working')).toHaveLength(6);
  });
});

describe('WeeklyAvailabilityGrid - unchecking restores previous times in-session', () => {
  it('unchecking a day collapses it, and re-checking within the session restores its times', async () => {
    const user = userEvent.setup();
    (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue([
      availabilityRow({ dayOfWeek: 1, startTime: '08:00:00', endTime: '14:00:00', maxStudents: 2 }),
    ]);
    (schedulingApi.getSchedulingSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      defaultMaxStudentsPerDay: 3,
    });

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    const mondayCheckbox = await screen.findByLabelText('Monday works this day');
    expect(mondayCheckbox).toBeChecked();

    await user.click(mondayCheckbox);
    expect(mondayCheckbox).not.toBeChecked();
    expect(screen.getAllByText('Not working')).toHaveLength(7);

    await user.click(mondayCheckbox);
    expect(mondayCheckbox).toBeChecked();

    const startInput = screen.getByLabelText('Start') as HTMLInputElement;
    expect(startInput.value).toBe('08:00');
    const endInput = screen.getByLabelText('End') as HTMLInputElement;
    expect(endInput.value).toBe('14:00');
  });
});

describe('WeeklyAvailabilityGrid - copy to all checked days', () => {
  it('copies start time, end time, and max students from one row onto every other checked day', async () => {
    const user = userEvent.setup();
    (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue([
      availabilityRow({ dayOfWeek: 1, startTime: '08:00:00', endTime: '14:00:00', maxStudents: 2 }),
      availabilityRow({ id: 'row-2', dayOfWeek: 3, startTime: '10:00:00', endTime: '16:00:00', maxStudents: 4 }),
    ]);
    (schedulingApi.getSchedulingSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      defaultMaxStudentsPerDay: 3,
    });

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    await screen.findByLabelText('Monday works this day');
    // Also check Friday so there are 3 checked days - copying from Monday
    // should reach both Wednesday (already checked) and Friday (newly checked).
    const fridayCheckbox = screen.getByLabelText('Friday works this day');
    await user.click(fridayCheckbox);

    const copyButtons = screen.getAllByRole('button', { name: /copy to all checked days/i });
    // First copy button corresponds to Monday (rendered first, dayOfWeek 1).
    await user.click(copyButtons[0]);

    // Wednesday (dayOfWeek 3) now matches Monday's times/cap.
    expect(document.getElementById('start-3')).toHaveValue('08:00');
    expect(document.getElementById('end-3')).toHaveValue('14:00');

    // Friday (dayOfWeek 5, just checked, defaulted to 09:00-17:00) now also matches Monday.
    expect(document.getElementById('start-5')).toHaveValue('08:00');
    expect(document.getElementById('end-5')).toHaveValue('14:00');
  });

  it('does not fire an API call when copying - it is a local edit applied on the next save', async () => {
    const user = userEvent.setup();
    (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue([
      availabilityRow({ dayOfWeek: 1 }),
      availabilityRow({ id: 'row-2', dayOfWeek: 2 }),
    ]);
    (schedulingApi.getSchedulingSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      defaultMaxStudentsPerDay: 3,
    });

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    await screen.findByLabelText('Monday works this day');
    const copyButtons = screen.getAllByRole('button', { name: /copy to all checked days/i });
    await user.click(copyButtons[0]);

    expect(schedulingApi.setWeekAvailability).not.toHaveBeenCalled();
  });
});

describe('WeeklyAvailabilityGrid - summary line', () => {
  it('shows the count of working days and total hours across them', async () => {
    (schedulingApi.getInstructorAvailability as ReturnType<typeof vi.fn>).mockResolvedValue([
      availabilityRow({ dayOfWeek: 1, startTime: '09:00:00', endTime: '17:00:00' }), // 8 hrs
      availabilityRow({ id: 'row-2', dayOfWeek: 5, startTime: '10:00:00', endTime: '16:00:00' }), // 6 hrs
    ]);
    (schedulingApi.getSchedulingSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      defaultMaxStudentsPerDay: 3,
    });

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    const summary = await screen.findByTestId('week-summary');
    expect(summary).toHaveTextContent('2 days · 14 hrs');
  });
});

describe('WeeklyAvailabilityGrid - save the whole week in one request', () => {
  it('sends all 7 days in a single setWeekAvailability call on Save', async () => {
    const user = userEvent.setup();
    mockDefaults();
    (schedulingApi.setWeekAvailability as ReturnType<typeof vi.fn>).mockResolvedValue([
      availabilityRow({ dayOfWeek: 1, startTime: '09:00:00', endTime: '17:00:00', maxStudents: 3 }),
    ]);

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    const mondayCheckbox = await screen.findByLabelText('Monday works this day');
    await user.click(mondayCheckbox);

    const saveButton = screen.getByRole('button', { name: /save week/i });
    await user.click(saveButton);

    await waitFor(() => expect(schedulingApi.setWeekAvailability).toHaveBeenCalledTimes(1));
    const [calledInstructorId, calledDays] = (schedulingApi.setWeekAvailability as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledInstructorId).toBe(INSTRUCTOR_ID);
    expect(calledDays).toHaveLength(7);
    expect(calledDays.find((d: { dayOfWeek: number }) => d.dayOfWeek === 1)).toEqual(
      expect.objectContaining({ dayOfWeek: 1, isActive: true, startTime: '09:00', endTime: '17:00' })
    );
  });

  it('the Save button is disabled until something actually changes', async () => {
    mockDefaults();

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    await screen.findByText('Monday');
    const saveButton = screen.getByRole('button', { name: /save week/i });
    expect(saveButton).toBeDisabled();
  });

  it('shows an error and leaves local edits intact when the save fails', async () => {
    const user = userEvent.setup();
    mockDefaults();
    (schedulingApi.setWeekAvailability as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { error: 'Day 1: startTime must be before endTime' } },
    });

    render(<WeeklyAvailabilityGrid instructorId={INSTRUCTOR_ID} />);

    const mondayCheckbox = await screen.findByLabelText('Monday works this day');
    await user.click(mondayCheckbox);

    const saveButton = screen.getByRole('button', { name: /save week/i });
    await user.click(saveButton);

    expect(await screen.findByText(/Day 1: startTime must be before endTime/i)).toBeInTheDocument();
    // The checkbox stays checked - nothing was lost.
    expect(mondayCheckbox).toBeChecked();
  });
});
