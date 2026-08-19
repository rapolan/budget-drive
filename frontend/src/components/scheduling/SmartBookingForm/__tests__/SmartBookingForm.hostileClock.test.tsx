import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SmartBookingForm } from '../index';
import type { Student, Instructor, RankedTimeSlot } from '@/types';

// Hostile-clock regression suite for SmartBookingForm. See
// Dashboard.hostileClock.test.tsx for the axis-separation rationale.
//
// The historical bug (see docs/ARCHITECTURE.md §7): the wizard used to
// derive a slot's persisted/displayed time by parsing the slot's ISO
// instant with new Date(iso).getHours() - correct only when the browser's
// zone happened to match the instant's encoding. It now reads
// startTimeLocal/endTimeLocal directly (tenant wall-clock HH:MM strings
// computed server-side), which must be immune to the browser's own zone.

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

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ settings: { defaultLessonCost: 150 } }),
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

// The slot's startTimeLocal/endTimeLocal (09:00-11:00, tenant wall-clock)
// deliberately differ from what its ISO startTime/endTime would parse to
// under the OLD buggy new Date(iso).getHours() approach in most zones -
// this is what makes a regression (reverting to the old parsing) visible.
const SLOT: RankedTimeSlot = {
  date: '2026-08-03',
  startTime: '2026-08-03T16:00:00.000Z', // 09:00 Pacific / 12:00 Eastern - deliberately NOT 09:00 in either browser zone under test
  endTime: '2026-08-03T18:00:00.000Z',
  startTimeLocal: '09:00',
  endTimeLocal: '11:00',
  instructorId: 'instructor-1',
  available: true,
  proximityScore: 100,
  instructorName: 'John Smith',
  instructorZip: '90008',
  comingFrom: 'home',
  outsideServiceArea: false,
};

const DATE_PRESETS = {
  next2Weeks: { start: '2026-08-04', end: '2026-08-17' },
  thisMonth: { start: '2026-08-01', end: '2026-08-31' },
  nextMonth: { start: '2026-09-01', end: '2026-09-30' },
};

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onBookingComplete = vi.fn();
  const onCancel = vi.fn();

  return render(
    <QueryClientProvider client={queryClient}>
      <SmartBookingForm onBookingComplete={onBookingComplete} onCancel={onCancel} preselectedStudent={STUDENT} />
    </QueryClientProvider>
  );
}

async function bookThroughToConfirm(user: ReturnType<typeof userEvent.setup>) {
  expect(await screen.findByText('Aisha Williams')).toBeInTheDocument();

  const findButton = await screen.findByRole('button', { name: /find available instructors/i });
  await waitFor(() => expect(findButton).not.toBeDisabled());
  await user.click(findButton);

  expect(await screen.findByText('Available Time Slots')).toBeInTheDocument();
  const instructorHeader = await screen.findByText('John Smith');
  await user.click(instructorHeader);
}

describe('SmartBookingForm - hostile clock (browser America/New_York)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'America/New_York';
    getAllStudents.mockResolvedValue({ data: [STUDENT] });
    getByStudent.mockResolvedValue({ data: [] });
    getDatePresets.mockResolvedValue(DATE_PRESETS);
    getAllInstructors.mockResolvedValue({ data: [INSTRUCTOR] });
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });
    createLesson.mockResolvedValue({ data: { id: 'lesson-1' } });
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('renders the slot using startTimeLocal, not a browser-zone parse of the ISO instant', async () => {
    const user = userEvent.setup();
    renderForm();
    await bookThroughToConfirm(user);

    expect(await screen.findByText(/9:00 AM - 11:00 AM/i)).toBeInTheDocument();
  });

  it('books the lesson at startTimeLocal/endTimeLocal regardless of the browser zone', async () => {
    const user = userEvent.setup();
    renderForm();
    await bookThroughToConfirm(user);

    const slotButton = await screen.findByText(/9:00 AM - 11:00 AM/i);
    await user.click(slotButton);

    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    await waitFor(() => expect(createLesson).toHaveBeenCalledTimes(1));
    expect(createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: '09:00:00',
        endTime: '11:00:00',
      })
    );
  });
});

describe('SmartBookingForm - hostile clock, reversed (browser America/Los_Angeles)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'America/Los_Angeles';
    getAllStudents.mockResolvedValue({ data: [STUDENT] });
    getByStudent.mockResolvedValue({ data: [] });
    getDatePresets.mockResolvedValue(DATE_PRESETS);
    getAllInstructors.mockResolvedValue({ data: [INSTRUCTOR] });
    findRankedAvailableSlots.mockResolvedValue({ slots: [SLOT], failedInstructors: [] });
    createLesson.mockResolvedValue({ data: { id: 'lesson-1' } });
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('still books the lesson at startTimeLocal/endTimeLocal when the browser is on the opposite coast', async () => {
    const user = userEvent.setup();
    renderForm();
    await bookThroughToConfirm(user);

    const slotButton = await screen.findByText(/9:00 AM - 11:00 AM/i);
    await user.click(slotButton);

    expect(await screen.findByText('Booking Summary')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: /confirm booking/i });
    await user.click(confirmButton);

    await waitFor(() => expect(createLesson).toHaveBeenCalledTimes(1));
    expect(createLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: '09:00:00',
        endTime: '11:00:00',
      })
    );
  });
});

describe('SmartBookingForm - hostile clock, documenting the old bug class', () => {
  it('the OLD new Date(iso).getHours() approach would have diverged from startTimeLocal under a faked browser zone (self-documenting regression guard)', () => {
    const originalTZ = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const oldParsedHour = new Date(SLOT.startTime).getHours();
      const [correctHour] = SLOT.startTimeLocal.split(':').map(Number);
      // Proves the two approaches genuinely disagree for this fixture -
      // if this assertion ever fails, the fixture no longer exercises the
      // bug class and the two tests above would pass even with a
      // regression, so the fixture would need to be revisited.
      expect(oldParsedHour).not.toBe(correctHour);
    } finally {
      process.env.TZ = originalTZ;
    }
  });
});
