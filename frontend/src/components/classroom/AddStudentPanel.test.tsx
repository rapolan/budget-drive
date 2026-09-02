import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddStudentPanel } from './AddStudentPanel';
import { classroomApi } from '@/api';
import type { DeCohort, RosterAddCandidate } from '@/api/classroom';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    classroomApi: {
      ...actual.classroomApi,
      searchRosterAddCandidates: vi.fn(),
      joinCohort: vi.fn(),
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

function candidate(overrides: Partial<RosterAddCandidate> = {}): RosterAddCandidate {
  return {
    studentId: 'student-1',
    studentName: 'Alex Adult',
    age: 30,
    isMinor: false,
    enrollmentId: null,
    status: 'none',
    otherCohortName: null,
    ...overrides,
  };
}

function renderPanel(cohortOverrides: Partial<DeCohort> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const onAdded = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <AddStudentPanel cohort={cohort(cohortOverrides)} onClose={onClose} onAdded={onAdded} />
    </QueryClientProvider>
  );
  return { onClose, onAdded };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('AddStudentPanel - Existing student tab', () => {
  it('shows search results with age and DE-enrollment context', async () => {
    (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [candidate({ studentName: 'Jamie Minor', age: 16, isMinor: true, status: 'none' })],
    });

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/search students/i), { target: { value: 'Jamie' } });

    expect(await screen.findByText('Jamie Minor')).toBeInTheDocument();
    expect(screen.getByText(/16, minor/i)).toBeInTheDocument();
    expect(screen.getByText(/no driver education enrollment yet/i)).toBeInTheDocument();
  });

  it('disables "Add to class" for a student already in this cohort', async () => {
    (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [candidate({ studentName: 'Sam Same', enrollmentId: 'enrollment-3', status: 'this_cohort' })],
    });

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/search students/i), { target: { value: 'Sam' } });

    await screen.findByText('Sam Same');
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to class/i })).toBeDisabled();
  });

  it('blocks and clearly shows the other cohort name when the student already has a home cohort elsewhere', async () => {
    (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        candidate({
          studentName: 'Robin Elsewhere',
          enrollmentId: 'enrollment-4',
          status: 'other_cohort',
          otherCohortName: 'Spring Weekday',
        }),
      ],
    });

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/search students/i), { target: { value: 'Robin' } });

    await screen.findByText('Robin Elsewhere');
    expect(screen.getByText(/already enrolled in spring weekday/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to class/i })).toBeDisabled();
  });

  it('adds a joinable student via classroomApi.joinCohort', async () => {
    (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [candidate({ studentName: 'Casey Joinable', enrollmentId: 'enrollment-5', status: 'joinable' })],
    });
    (classroomApi.joinCohort as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const { onAdded } = renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/search students/i), { target: { value: 'Casey' } });

    await screen.findByText('Casey Joinable');
    fireEvent.click(screen.getByRole('button', { name: /add to class/i }));

    await waitFor(() => {
      expect(classroomApi.joinCohort).toHaveBeenCalledWith('cohort-1', 'enrollment-5');
    });
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
  });

  it('disables adding when the cohort is at capacity', async () => {
    (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [candidate({ studentName: 'Casey Joinable', enrollmentId: 'enrollment-5', status: 'joinable' })],
    });

    renderPanel({ capacity: 5, enrolledCount: 5 });
    fireEvent.change(screen.getByPlaceholderText(/search students/i), { target: { value: 'Casey' } });

    await screen.findByText('Casey Joinable');
    expect(screen.getByRole('button', { name: /add to class/i })).toBeDisabled();
    expect(screen.getByText('This class is at capacity (5/5).')).toBeInTheDocument();
  });
});

describe('AddStudentPanel - New student tab', () => {
  it('opens the create-student modal pre-set to enroll in this cohort', async () => {
    (classroomApi.searchRosterAddCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /new student/i }));

    expect(await screen.findByText(/fill in the details below/i)).toBeInTheDocument();
  });

  it('blocks the New student tab when the cohort is at capacity', async () => {
    renderPanel({ capacity: 5, enrolledCount: 5 });
    fireEvent.click(screen.getByRole('button', { name: /new student/i }));

    expect(await screen.findByText(/new students can't be enrolled here/i)).toBeInTheDocument();
    expect(screen.queryByText(/fill in the details below/i)).not.toBeInTheDocument();
  });
});
