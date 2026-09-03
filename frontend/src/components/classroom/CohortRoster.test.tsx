import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    <QueryClientProvider client={queryClient}>
      <CohortRoster cohort={cohort(cohortOverrides)} onCohortUpdated={() => {}} />
    </QueryClientProvider>
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
