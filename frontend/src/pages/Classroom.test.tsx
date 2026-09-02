import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClassroomPage } from './Classroom';
import { classroomApi, instructorsApi } from '@/api';
import type { DeCohort, CohortRoster } from '@/api/classroom';
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
    },
    instructorsApi: {
      ...actual.instructorsApi,
      getAll: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [{ id: 'instructor-1', fullName: 'Ms. Rivera', isDeTeacher: true } as Instructor],
  });
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
