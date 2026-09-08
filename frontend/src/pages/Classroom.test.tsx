import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClassroomPage } from './Classroom';
import { classroomApi, instructorsApi, enrollmentsApi } from '@/api';
import type { DeCohort, CohortRoster, OnlineDeInProgressEntry, OnlineDeCompletedEntry } from '@/api/classroom';
import type { Instructor } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    classroomApi: {
      ...actual.classroomApi,
      getCohorts: vi.fn(),
      createCohort: vi.fn(),
      getCohortRoster: vi.fn(),
      recordAttendance: vi.fn(),
      searchMakeUpCandidates: vi.fn(),
      searchRosterAddCandidates: vi.fn(),
      joinCohort: vi.fn(),
      getOnlineDeInProgress: vi.fn(),
      getOnlineDeCompleted: vi.fn(),
    },
    instructorsApi: {
      ...actual.instructorsApi,
      getAll: vi.fn(),
    },
    enrollmentsApi: {
      ...actual.enrollmentsApi,
      update: vi.fn(),
      complete: vi.fn(),
    },
  };
});

function cohort(overrides: Partial<DeCohort> = {}): DeCohort {
  return {
    id: 'cohort-1',
    tenantId: 'tenant-1',
    name: 'Fall Weekend Class',
    teacherInstructorId: null,
    capacity: 20,
    status: 'scheduled',
    createdBy: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    enrolledCount: 1,
    sessions: [
      { id: 'session-1', tenantId: 'tenant-1', cohortId: 'cohort-1', curriculumDay: 1, sessionDate: '2026-10-03', startTime: '08:00', endTime: '14:00' },
      { id: 'session-2', tenantId: 'tenant-1', cohortId: 'cohort-1', curriculumDay: 2, sessionDate: '2026-10-04', startTime: '08:00', endTime: '14:00' },
      { id: 'session-3', tenantId: 'tenant-1', cohortId: 'cohort-1', curriculumDay: 3, sessionDate: '2026-10-10', startTime: '08:00', endTime: '14:00' },
      { id: 'session-4', tenantId: 'tenant-1', cohortId: 'cohort-1', curriculumDay: 4, sessionDate: '2026-10-11', startTime: '08:00', endTime: '14:00' },
    ],
    ...overrides,
  };
}

function roster(overrides: Partial<CohortRoster> = {}): CohortRoster {
  return {
    sessions: [
      { id: 'session-1', curriculumDay: 1, sessionDate: '2026-10-03' },
      { id: 'session-2', curriculumDay: 2, sessionDate: '2026-10-04' },
      { id: 'session-3', curriculumDay: 3, sessionDate: '2026-10-10' },
      { id: 'session-4', curriculumDay: 4, sessionDate: '2026-10-11' },
    ],
    students: [
      {
        enrollmentId: 'enrollment-1',
        studentId: 'student-1',
        studentName: 'Leo Whitfield',
        attendance: {
          'session-1': { present: true, isHomeCohort: true },
          'session-2': { present: false, isHomeCohort: true },
          'session-3': { present: false, isHomeCohort: true },
          'session-4': { present: false, isHomeCohort: true },
        },
        attendedCurriculumDayCount: 1,
        missingCurriculumDays: [2, 3, 4],
      },
    ],
    ...overrides,
  };
}

function renderClassroomPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClassroomPage />
    </QueryClientProvider>
  );
}

function onlineEntry(overrides: Partial<OnlineDeInProgressEntry> = {}): OnlineDeInProgressEntry {
  return {
    enrollmentId: 'online-enrollment-1',
    studentId: 'student-1',
    studentName: 'Jamie Online',
    manualCompletedHours: 12,
    hoursRequired: 30,
    ...overrides,
  };
}

function onlineCompletedEntry(overrides: Partial<OnlineDeCompletedEntry> = {}): OnlineDeCompletedEntry {
  return {
    enrollmentId: 'online-enrollment-2',
    studentId: 'student-2',
    studentName: 'Dana Finished',
    manualCompletedHours: 30,
    completedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [{ id: 'instructor-1', fullName: 'Ms. Rivera', isDeTeacher: true } as Instructor],
  });
  (classroomApi.getOnlineDeInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  (classroomApi.getOnlineDeCompleted as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe('Classroom page - cohort list', () => {
  it('shows an empty state when no classes are scheduled', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderClassroomPage();

    expect(await screen.findByText(/no classes scheduled yet/i)).toBeInTheDocument();
  });

  it('lists cohorts with their enrollment count', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [cohort()] });

    renderClassroomPage();

    expect(await screen.findByText('Fall Weekend Class')).toBeInTheDocument();
    expect(screen.getByText('1/20 enrolled')).toBeInTheDocument();
  });
});

describe('Classroom page - create a class', () => {
  it('disables submit until all 4 curriculum-day dates and a name are filled in', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderClassroomPage();
    await waitFor(() => expect(screen.getByText(/no classes scheduled yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /new class/i }));

    const submit = screen.getByRole('button', { name: /create class/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/class name/i), { target: { value: 'Fall Weekend Class' } });
    fireEvent.change(screen.getByLabelText(/day 1/i), { target: { value: '2026-10-03' } });
    fireEvent.change(screen.getByLabelText(/day 2/i), { target: { value: '2026-10-04' } });
    fireEvent.change(screen.getByLabelText(/day 3/i), { target: { value: '2026-10-10' } });
    expect(submit).toBeDisabled(); // day 4 still missing

    fireEvent.change(screen.getByLabelText(/day 4/i), { target: { value: '2026-10-11' } });
    expect(submit).not.toBeDisabled();
  });

  it('submits the 4 sessions covering curriculum days 1-4', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (classroomApi.createCohort as ReturnType<typeof vi.fn>).mockResolvedValue({ data: cohort() });
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });

    renderClassroomPage();
    await waitFor(() => expect(screen.getByText(/no classes scheduled yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /new class/i }));
    fireEvent.change(screen.getByLabelText(/class name/i), { target: { value: 'Fall Weekend Class' } });
    fireEvent.change(screen.getByLabelText(/day 1/i), { target: { value: '2026-10-03' } });
    fireEvent.change(screen.getByLabelText(/day 2/i), { target: { value: '2026-10-04' } });
    fireEvent.change(screen.getByLabelText(/day 3/i), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText(/day 4/i), { target: { value: '2026-10-11' } });

    fireEvent.click(screen.getByRole('button', { name: /create class/i }));

    await waitFor(() => {
      expect(classroomApi.createCohort).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fall Weekend Class',
          sessions: [
            { curriculumDay: 1, sessionDate: '2026-10-03' },
            { curriculumDay: 2, sessionDate: '2026-10-04' },
            { curriculumDay: 3, sessionDate: '2026-10-10' },
            { curriculumDay: 4, sessionDate: '2026-10-11' },
          ],
        })
      );
    });
  });
});

describe('Classroom page - roster', () => {
  it('shows a checkbox grid with the student\'s missing-days badge', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [cohort()] });
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });

    renderClassroomPage();
    fireEvent.click(await screen.findByText('Fall Weekend Class'));

    expect(await screen.findByText('Leo Whitfield')).toBeInTheDocument();
    expect(screen.getByText(/missing 3 days/i)).toBeInTheDocument();

    const day1Checkbox = screen.getByLabelText(/leo whitfield present day 1/i) as HTMLInputElement;
    expect(day1Checkbox.checked).toBe(true);
    const day2Checkbox = screen.getByLabelText(/leo whitfield present day 2/i) as HTMLInputElement;
    expect(day2Checkbox.checked).toBe(false);
  });

  it('tags a make-up guest whose home cohort is elsewhere', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [cohort()] });
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: roster({
        students: [
          {
            enrollmentId: 'enrollment-2',
            studentId: 'student-2',
            studentName: 'Mia Torres',
            attendance: {
              'session-1': { present: false, isHomeCohort: true },
              'session-2': { present: false, isHomeCohort: true },
              'session-3': { present: true, isHomeCohort: false },
              'session-4': { present: false, isHomeCohort: true },
            },
            attendedCurriculumDayCount: 1,
            missingCurriculumDays: [1, 2, 4],
          },
        ],
      }),
    });

    renderClassroomPage();
    fireEvent.click(await screen.findByText('Fall Weekend Class'));

    await screen.findByText('Mia Torres');
    const row = screen.getByText('Mia Torres').closest('tr') as HTMLElement;
    expect(within(row).getByText('(make-up)')).toBeInTheDocument();
  });

  it('calls recordAttendance when a checkbox is toggled', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [cohort()] });
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });
    (classroomApi.recordAttendance as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    renderClassroomPage();
    fireEvent.click(await screen.findByText('Fall Weekend Class'));
    await screen.findByText('Leo Whitfield');

    const day2Checkbox = screen.getByLabelText(/leo whitfield present day 2/i);
    fireEvent.click(day2Checkbox);

    await waitFor(() => {
      expect(classroomApi.recordAttendance).toHaveBeenCalledWith('session-2', {
        enrollmentId: 'enrollment-1',
        present: true,
      });
    });
  });

  it('opens the Add student panel from the roster header', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [cohort()] });
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });
    (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderClassroomPage();
    fireEvent.click(await screen.findByText('Fall Weekend Class'));
    await screen.findByText('Leo Whitfield');

    fireEvent.click(screen.getByRole('button', { name: /add student/i }));

    expect(await screen.findByText('Add student to Fall Weekend Class')).toBeInTheDocument();
  });
});

// Online DE has no cohort of its own - this tab is its completion home
// (item 3 of the DE-lifecycle-edges investigation).
describe('Classroom page - Online tab', () => {
  it('shows an empty state when nothing is in progress', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderClassroomPage();
    fireEvent.click(await screen.findByRole('tab', { name: /online/i }));

    expect(await screen.findByText(/nothing in progress/i)).toBeInTheDocument();
  });

  it('lists an in-progress online DE student with their logged hours', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (classroomApi.getOnlineDeInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [onlineEntry()],
    });

    renderClassroomPage();
    fireEvent.click(await screen.findByRole('tab', { name: /online/i }));

    expect(await screen.findByText('Jamie Online')).toBeInTheDocument();
    expect(screen.getByText('12 / 30 hours logged')).toBeInTheDocument();
  });

  it('saving hours calls enrollmentsApi.update with manualCompletedHours', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (classroomApi.getOnlineDeInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [onlineEntry()],
    });
    (enrollmentsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderClassroomPage();
    fireEvent.click(await screen.findByRole('tab', { name: /online/i }));
    await screen.findByText('Jamie Online');

    const hoursInput = screen.getByLabelText(/hours logged for jamie online/i);
    fireEvent.change(hoursInput, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save hours/i }));

    await waitFor(() =>
      expect(enrollmentsApi.update).toHaveBeenCalledWith('online-enrollment-1', { manualCompletedHours: 20 })
    );
  });

  it('marking complete calls the SAME enrollmentsApi.complete every other completion path uses', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (classroomApi.getOnlineDeInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [onlineEntry()],
    });
    (enrollmentsApi.complete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderClassroomPage();
    fireEvent.click(await screen.findByRole('tab', { name: /online/i }));
    await screen.findByText('Jamie Online');

    fireEvent.click(screen.getByRole('button', { name: /mark complete/i }));

    await waitFor(() => expect(enrollmentsApi.complete).toHaveBeenCalledWith('online-enrollment-1'));
  });

  it('hides the "New class" button while on the Online tab', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderClassroomPage();
    expect(await screen.findByRole('button', { name: /new class/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /online/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /new class/i })).not.toBeInTheDocument());
  });
});

// Item 3: a "Completed classes" browse/history section below the active
// cohort list, mirroring the Certificates page's worklist-then-issued-log
// structure. Closed cohorts (status='completed', set only by "Close
// class") never appear in the active list or picker above.
describe('Classroom page - Completed classes section (item 3)', () => {
  it('keeps a completed cohort out of the active list and shows it in "Completed classes" instead', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [cohort({ id: 'active-1', name: 'Active Class', status: 'scheduled' }), cohort({ id: 'done-1', name: 'Finished Class', status: 'completed' })],
    });

    renderClassroomPage();

    await screen.findByText('Active Class');
    expect(await screen.findByText('Completed classes')).toBeInTheDocument();
    expect(screen.getByText('Finished Class')).toBeInTheDocument();

    // Not duplicated into the active picker above the section header.
    const activePickerButtons = screen.getAllByText('Active Class');
    expect(activePickerButtons).toHaveLength(1);
  });

  it('does not render the "Completed classes" section when nothing is completed', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [cohort({ status: 'scheduled' })] });

    renderClassroomPage();

    await screen.findByText('Fall Weekend Class');
    expect(screen.queryByText('Completed classes')).not.toBeInTheDocument();
  });

  it('selecting a completed cohort shows its read-only final roster with no actions', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [cohort({ id: 'done-1', name: 'Finished Class', status: 'completed' })],
    });
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: roster({
        students: [
          {
            enrollmentId: 'enrollment-1',
            studentId: 'student-1',
            studentName: 'Leo Whitfield',
            attendance: {
              'session-1': { present: true, isHomeCohort: true },
              'session-2': { present: true, isHomeCohort: true },
              'session-3': { present: true, isHomeCohort: true },
              'session-4': { present: true, isHomeCohort: true },
            },
            attendedCurriculumDayCount: 4,
            missingCurriculumDays: [],
          },
        ],
      }),
    });

    renderClassroomPage();
    fireEvent.click(await screen.findByText('Finished Class'));

    await screen.findByText('Leo Whitfield');
    expect(screen.queryByRole('button', { name: /add student/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close class/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});

// Item 4: a "Completed" browse/history section below the Online tab's
// in-progress list. Read-only - certificate issuance is handled by the
// certificate worklist, not here.
describe('Classroom page - Online tab Completed section (item 4)', () => {
  it('does not render the Completed section when nothing is completed', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderClassroomPage();
    fireEvent.click(await screen.findByRole('tab', { name: /online/i }));

    await screen.findByText(/nothing in progress/i);
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('lists a completed online DE student with logged hours and no actions', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (classroomApi.getOnlineDeCompleted as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [onlineCompletedEntry()],
    });

    renderClassroomPage();
    fireEvent.click(await screen.findByRole('tab', { name: /online/i }));

    expect(await screen.findByText('Dana Finished')).toBeInTheDocument();
    expect(screen.getByText(/30 hours logged/i)).toBeInTheDocument();
    const row = screen.getByText('Dana Finished').closest('div')!.parentElement as HTMLElement;
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows both in-progress and completed online students in their own sections', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (classroomApi.getOnlineDeInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [onlineEntry()],
    });
    (classroomApi.getOnlineDeCompleted as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [onlineCompletedEntry()],
    });

    renderClassroomPage();
    fireEvent.click(await screen.findByRole('tab', { name: /online/i }));

    expect(await screen.findByText('Jamie Online')).toBeInTheDocument();
    expect(screen.getByText('Dana Finished')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
  });
});
