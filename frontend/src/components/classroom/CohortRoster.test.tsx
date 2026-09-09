import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CohortRoster } from './CohortRoster';
import { classroomApi } from '@/api';
import type { DeCohort, CohortRoster as CohortRosterData } from '@/api/classroom';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    classroomApi: {
      ...actual.classroomApi,
      getCohortRoster: vi.fn(),
      recordAttendance: vi.fn(),
      searchRosterAddCandidates: vi.fn(),
      joinCohort: vi.fn(),
      getCohorts: vi.fn().mockResolvedValue({ data: [] }),
      removeCohortEnrollment: vi.fn(),
      getCohortAttendanceGaps: vi.fn(),
      closeCohort: vi.fn(),
    },
    studentsApi: {
      ...actual.studentsApi,
      create: vi.fn(),
      createWithGuardian: vi.fn(),
    },
    guardiansApi: {
      ...actual.guardiansApi,
      findCandidates: vi.fn().mockResolvedValue({ data: [] }),
      findExactMatch: vi.fn().mockResolvedValue({ data: [] }),
      getStudentsForGuardian: vi.fn().mockResolvedValue({ data: [] }),
      getForStudent: vi.fn().mockResolvedValue({ data: [] }),
    },
    lessonsApi: {
      getAll: vi.fn().mockResolvedValue({ data: [] }),
      getMostRecentByStudent: vi.fn().mockResolvedValue({ data: null }),
    },
    instructorsApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
    enrollmentsApi: {
      getForStudent: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn(),
    },
    feeFlagsApi: {
      getOutstandingForStudent: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: null,
    tenantType: 'school',
    settings: { defaultHoursRequired: 6 },
    loading: false,
    error: null,
    refreshSettings: vi.fn(),
    updateTheme: vi.fn(),
  }),
}));

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
    enrolledCount: 5,
    sessions: [],
    ...overrides,
  };
}

function roster(overrides: Partial<CohortRosterData> = {}): CohortRosterData {
  return {
    sessions: [],
    students: [],
    ...overrides,
  };
}

function renderRoster(cohortOverrides: Partial<DeCohort> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CohortRoster cohort={cohort(cohortOverrides)} onCohortUpdated={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });
  (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
});

afterEach(cleanup);

// Regression coverage for the nested-modal sizing bug: AddStudentPanel
// used to render StudentModal INSIDE its own ModalShell (max-w-lg),
// clamping StudentModal's own ModalShell (max-w-2xl, sized for the full
// create form) to the smaller width. CohortRoster now owns which single
// surface is mounted - switching to "New student" closes AddStudentPanel
// and mounts StudentModal as a sibling, never both at once.
describe('CohortRoster - Add student surfaces never nest', () => {
  it('switching to "New student" closes AddStudentPanel and opens StudentModal as a sibling, not nested inside it', async () => {
    renderRoster();

    fireEvent.click(await screen.findByRole('button', { name: /add student/i }));
    expect(await screen.findByText('Add student to Fall Weekend Class')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new student/i }));

    // AddStudentPanel's own picker chrome is gone - it was replaced, not
    // kept mounted underneath.
    expect(screen.queryByText('Add student to Fall Weekend Class')).not.toBeInTheDocument();

    // StudentModal is mounted as its own top-level surface.
    expect(await screen.findByText(/fill in the details below/i)).toBeInTheDocument();

    // Exactly one ModalShell (one rounded-3xl backdrop card) is present -
    // never two nested inside each other.
    const shells = document.querySelectorAll('.rounded-3xl');
    expect(shells).toHaveLength(1);
  });

  it('the create form pre-sets Driver Education / Classroom / this cohort when reached via New student', async () => {
    (classroomApi.getCohorts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [cohort({ id: 'cohort-1', name: 'Fall Weekend Class', capacity: 20, enrolledCount: 5 })],
    });

    renderRoster();

    fireEvent.click(await screen.findByRole('button', { name: /add student/i }));
    fireEvent.click(await screen.findByRole('button', { name: /new student/i }));

    expect(await screen.findByRole('button', { name: 'Driver Education' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/create & enroll in fall weekend class/i)).toBeInTheDocument();
  });

  it('closing the create form returns to a clean state, not back into the picker', async () => {
    renderRoster();

    fireEvent.click(await screen.findByRole('button', { name: /add student/i }));
    fireEvent.click(await screen.findByRole('button', { name: /new student/i }));
    await screen.findByText(/fill in the details below/i);

    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));

    expect(screen.queryByText(/fill in the details below/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Add student to Fall Weekend Class')).not.toBeInTheDocument();
  });
});

// Item 4 of the DE-lifecycle-edges investigation: removing a student from
// a cohort ends membership only - de_attendance has no FK to
// de_cohort_enrollments, so days already attended are never touched.
describe('CohortRoster - Remove from class', () => {
  const rosterWithStudent = roster({
    sessions: [{ id: 'session-1', curriculumDay: 1, sessionDate: '2026-10-03' }],
    students: [
      {
        enrollmentId: 'enrollment-1',
        studentId: 'student-1',
        studentName: 'Leo Whitfield',
        attendance: {},
        attendedCurriculumDayCount: 0,
        missingCurriculumDays: [1, 2, 3, 4],
      },
    ],
  });

  it('shows a confirm step naming the cohort before removing, and requires an explicit click to proceed', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: rosterWithStudent });

    renderRoster();
    await screen.findByText('Leo Whitfield');

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(
      await screen.findByText(/this ends leo whitfield's membership in fall weekend class/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/their attendance record for days already attended is kept/i)).toBeInTheDocument();
    expect(classroomApi.removeCohortEnrollment).not.toHaveBeenCalled();
  });

  it('confirming calls removeCohortEnrollment with the cohort and enrollment ids', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: rosterWithStudent });
    (classroomApi.removeCohortEnrollment as ReturnType<typeof vi.fn>).mockResolvedValue({ data: undefined });

    renderRoster();
    await screen.findByText('Leo Whitfield');

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm remove/i }));

    await waitFor(() =>
      expect(classroomApi.removeCohortEnrollment).toHaveBeenCalledWith('cohort-1', 'enrollment-1')
    );
  });

  it('cancelling the confirm step does not call removeCohortEnrollment', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: rosterWithStudent });

    renderRoster();
    await screen.findByText('Leo Whitfield');

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));

    expect(
      screen.queryByText(/this ends leo whitfield's membership/i)
    ).not.toBeInTheDocument();
    expect(classroomApi.removeCohortEnrollment).not.toHaveBeenCalled();
  });
});

// Item 5 of the DE-lifecycle-edges investigation: closing a cohort must
// never mark anyone complete - completion stays purely attendance-derived.
// The confirm summary reuses getCohortAttendanceGaps as-is (the same
// primitive the cancellation flow's own make-up list already relies on).
describe('CohortRoster - Close class', () => {
  it('shows a confirm summary separating completed from gapped students, without closing yet', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });
    (classroomApi.getCohortAttendanceGaps as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ enrollmentId: 'enrollment-2', studentId: 'student-2', studentName: 'Mia Torres', missingCurriculumDays: [3, 4] }],
    });

    renderRoster({ enrolledCount: 5 });
    fireEvent.click(await screen.findByRole('button', { name: /close class/i }));

    expect(await screen.findByText(/4 of 5 completed all 4 days/i)).toBeInTheDocument();
    expect(screen.getByText(/mia torres - missing days 3, 4/i)).toBeInTheDocument();
    expect(classroomApi.closeCohort).not.toHaveBeenCalled();
  });

  it('shows "no make-ups needed" when nobody has a gap', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });
    (classroomApi.getCohortAttendanceGaps as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderRoster({ enrolledCount: 3 });
    fireEvent.click(await screen.findByRole('button', { name: /close class/i }));

    expect(await screen.findByText(/3 of 3 completed all 4 days\. everyone is done/i)).toBeInTheDocument();
  });

  it('confirming calls closeCohort', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });
    (classroomApi.getCohortAttendanceGaps as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (classroomApi.closeCohort as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { cohort: cohort({ status: 'completed' }), completedCount: 3, gaps: [] },
    });

    renderRoster({ enrolledCount: 3 });
    fireEvent.click(await screen.findByRole('button', { name: /close class/i }));
    await screen.findByText(/3 of 3 completed/i);

    fireEvent.click(screen.getByRole('button', { name: /confirm close/i }));

    await waitFor(() => expect(classroomApi.closeCohort).toHaveBeenCalledWith('cohort-1'));
  });

  it('hides the "Close class" button once the cohort is already cancelled', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: roster() });

    renderRoster({ status: 'cancelled' });

    await screen.findByRole('button', { name: /add student/i });
    expect(screen.queryByRole('button', { name: /close class/i })).not.toBeInTheDocument();
  });
});

// Item 3: a completed (closed) class is a browse/history record - no
// mutation of any kind is available once cohort.status === 'completed',
// matching the Classroom page's "Completed classes" section requirement
// that a closed cohort has NO actions.
describe('CohortRoster - read-only once completed (item 3)', () => {
  const rosterWithStudent = roster({
    sessions: [{ id: 'session-1', curriculumDay: 1, sessionDate: '2026-10-03' }],
    students: [
      {
        enrollmentId: 'enrollment-1',
        studentId: 'student-1',
        studentName: 'Leo Whitfield',
        attendance: { 'session-1': { present: true, isHomeCohort: true } },
        attendedCurriculumDayCount: 1,
        missingCurriculumDays: [],
      },
    ],
  });

  it('shows a "Completed" badge instead of Close class / Add student', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: rosterWithStudent });

    renderRoster({ status: 'completed' });
    await screen.findByText('Leo Whitfield');

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close class/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add student/i })).not.toBeInTheDocument();
  });

  it('disables attendance checkboxes and hides Remove / Add make-up actions', async () => {
    (classroomApi.getCohortRoster as ReturnType<typeof vi.fn>).mockResolvedValue({ data: rosterWithStudent });

    renderRoster({ status: 'completed' });
    await screen.findByText('Leo Whitfield');

    const checkbox = screen.getByLabelText(/leo whitfield present day 1/i) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add make-up/i })).not.toBeInTheDocument();
  });
});
