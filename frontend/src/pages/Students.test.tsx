import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StudentsPage } from './Students';
import { studentsApi, lessonsApi, dashboardApi, guardiansApi, searchApi, enrollmentsApi, feeFlagsApi } from '@/api';
import type { Student, Guardian, Lesson, StudentProgress } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn(), getById: vi.fn() },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn(), getMostRecentByStudent: vi.fn().mockResolvedValue({ data: null }) },
    dashboardApi: { ...actual.dashboardApi, getNoShowAlerts: vi.fn() },
    guardiansApi: {
      ...actual.guardiansApi,
      getAll: vi.fn(),
      getById: vi.fn(),
      getStudentsForGuardian: vi.fn().mockResolvedValue({ data: [] }),
      findCandidates: vi.fn().mockResolvedValue({ data: [] }),
    },
    searchApi: { ...actual.searchApi, people: vi.fn() },
    enrollmentsApi: { ...actual.enrollmentsApi, complete: vi.fn() },
    feeFlagsApi: { ...actual.feeFlagsApi, markStudentFeesPaid: vi.fn().mockResolvedValue({ data: [] }) },
  };
});

// SmartBookingForm pulls in the full booking wizard (date presets, slot
// search, etc.) - irrelevant to proving what prop value Students.tsx's
// handleBookAgain hands it. Stub it down to just the one prop under test.
vi.mock('@/components/scheduling/SmartBookingForm', () => ({
  SmartBookingForm: (props: { prefilledDuration?: number }) => (
    <div data-testid="smart-booking-form" data-prefilled-duration={JSON.stringify(props.prefilledDuration)} />
  ),
}));

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

afterEach(cleanup);

function emptyStudent(overrides: Partial<Student>): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    email: 'test@example.com',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    totalHoursCompleted: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

function emptyGuardian(overrides: Partial<Guardian>): Guardian {
  return {
    id: 'guardian-1',
    tenantId: 'tenant-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Guardian;
}

function renderStudentsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Regression coverage: the backend attaches a needsGuardian flag (true only
// for minors with no linked guardian record) to every student read, and
// rejects marking such a student's program complete. needsGuardian no
// longer has its own standalone filter chip - it's one of Needs
// Attention's OVERLAY reasons (a student can be genuinely Scheduled/Ready
// to Book AND need a guardian at the same time - both are shown, neither
// is hidden by the other), surfaced via a per-row "Needs guardian" amber
// flag next to the status badge.
describe('Students list - needsGuardian flagging folds into Needs Attention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  const readyToBookEnrollment = {
    id: 'enrollment-ready',
    programType: 'driver_training' as const,
    status: 'active' as const,
    enrollmentDate: new Date('2026-01-01'),
    completed: false,
    completionReason: null,
    withdrawnReason: null,
  };

  it('shows a "Needs guardian" flag on an affected student row, additively alongside their base status', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({ id: 'minor-1', fullName: 'Minor No Guardian', needsGuardian: true, activeEnrollment: readyToBookEnrollment }),
        emptyStudent({ id: 'adult-1', fullName: 'Adult Fine', needsGuardian: false, activeEnrollment: readyToBookEnrollment }),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Minor No Guardian')).toBeInTheDocument();
    });

    const minorRow = screen.getByText('Minor No Guardian').closest('tr')!;
    expect(within(minorRow).getByText('Needs guardian')).toBeInTheDocument();
    // Additive, not exclusive (per the standing design decision): the
    // student's base status badge is still shown alongside the flag, not
    // replaced by it.
    expect(within(minorRow).getByText(/ready to book/i)).toBeInTheDocument();

    const adultRow = screen.getByText('Adult Fine').closest('tr')!;
    expect(within(adultRow).queryByText('Needs guardian')).not.toBeInTheDocument();
  });

  it('there is no standalone "Needs Guardian" filter chip in the bar', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'minor-1', fullName: 'Minor No Guardian', needsGuardian: true })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Minor No Guardian')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^needs guardian$/i })).not.toBeInTheDocument();
  });

  it('the "Needs Attention" filter includes a needs-guardian student even when their base status is Ready to Book', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({ id: 'minor-1', fullName: 'Minor No Guardian', needsGuardian: true }),
        emptyStudent({ id: 'adult-1', fullName: 'Adult Fine', needsGuardian: false }),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Adult Fine')).toBeInTheDocument();
    });

    const filterButton = screen.getByRole('button', { name: /^needs attention/i });
    await userEvent.click(filterButton);

    expect(screen.getByText('Minor No Guardian')).toBeInTheDocument();
    expect(screen.queryByText('Adult Fine')).not.toBeInTheDocument();
  });
});

// The filter bar is exactly 6 working-state chips (All/Scheduled/Ready to
// Book/Needs Attention/Completed/Inactive). new_this_month is stat-card-
// only; turning_18/no_show_followup/needs_guardian have no chip at all
// (turning_18 stays reachable only via Dashboard's deep-link; the other
// two folded entirely into Needs Attention).
describe('Students list - filter bar is exactly 6 chips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Solo Student' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });

  it('renders exactly the 6 named chips and none of the removed ones', async () => {
    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Solo Student')).toBeInTheDocument());

    for (const label of ['All', 'Scheduled', 'Ready to Book', 'Needs Attention', 'Completed', 'Inactive']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`, 'i') })).toBeInTheDocument();
    }

    expect(screen.queryByRole('button', { name: /^new$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^turning 18/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^needs guardian$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^no.show/i })).not.toBeInTheDocument();
  });

  it('"New This Month" is a stat card, not a filter chip - no filter narrows to it', async () => {
    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Solo Student')).toBeInTheDocument());

    expect(screen.getByText('New This Month')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new this month/i })).not.toBeInTheDocument();
  });
});

// Color swap (item 5): Scheduled is now green/success ("on track, all
// set"), Ready to Book is now blue/info ("neutral, between lessons") -
// reversed from the original assignment. Checked at the chip level here;
// StudentStatusBadge.test.tsx covers the status-column pill itself.
describe('Students list - Scheduled/Ready to Book color swap on filter chips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Solo Student' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });

  it('the Scheduled chip uses success/green tokens, not info/blue', async () => {
    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Solo Student')).toBeInTheDocument());

    const chip = screen.getByRole('button', { name: /^scheduled/i });
    expect(chip.className).toContain('status-success');
    expect(chip.className).not.toContain('text-primary');
  });

  it('the Ready to Book chip uses info/blue tokens, not success/green', async () => {
    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Solo Student')).toBeInTheDocument());

    const chip = screen.getByRole('button', { name: /^ready to book/i });
    expect(chip.className).toContain('text-primary');
    expect(chip.className).not.toContain('status-success');
  });
});

// Regression coverage: completion was previously only reachable by opening
// a student and navigating to the Enrollments tab. This is a GUIDED
// surfacing, not a freely editable status dropdown, and the eligibility
// rule is deliberately split by track (progress.track is read as already
// computed by computeStudentProgress, never recomputed here - see
// progressCalculationOwnership.test.ts):
//   - HOURS track (minors): percentComplete is measured against the real
//     DMV-required hours, an objective finish line - the action
//     auto-surfaces once it hits 100%.
//   - LESSONS track (adults): lessonsRequired is defined as lessonsBooked
//     itself, so no percentage ever means "finished" - the action is
//     always available once they have at least one completed lesson,
//     never gated on percentComplete.
// Confirming still requires a non-empty reason, same guarded shape as
// StudentModal's own enrollment-tab flow.
describe('Students list - guided Mark complete action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  const activeEligibleEnrollment = {
    id: 'enrollment-ready',
    programType: 'driver_training' as const,
    status: 'active' as const,
    enrollmentDate: new Date('2026-01-01'),
    completed: false,
    completionReason: null,
    withdrawnReason: null,
  };

  it('[hours track / minor] shows "Mark complete" once progress reaches 100% of required hours', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'ready-1',
          fullName: 'Ready Student',
          activeEnrollment: activeEligibleEnrollment,
          progress: { track: 'hours', percentComplete: 100, displayLabel: '6 / 6 hrs', needsDateOfBirth: false } as StudentProgress,
        }),
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Ready Student')).toBeInTheDocument();
    });

    expect(screen.getAllByTitle('Mark complete').length).toBeGreaterThan(0);
  });

  it('[hours track / minor] does not show "Mark complete" below 100% of required hours', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'not-ready-1',
          fullName: 'Not Ready Student',
          activeEnrollment: activeEligibleEnrollment,
          progress: { track: 'hours', percentComplete: 67, displayLabel: '4 / 6 hrs', needsDateOfBirth: false } as StudentProgress,
        }),
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Not Ready Student')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Mark complete')).not.toBeInTheDocument();
  });

  it('[lessons track / adult] shows "Mark complete" with at least one completed lesson, regardless of percentComplete', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'adult-ready-1',
          fullName: 'Adult With Progress',
          activeEnrollment: activeEligibleEnrollment,
          // Only 5 of 8 booked lessons done (63%) - nowhere near "100%",
          // but the lessons track has no objective finish line, so this
          // must still be eligible: it's the admin's judgment call, not a
          // computed milestone.
          progress: {
            track: 'lessons',
            percentComplete: 63,
            lessonsCompleted: 5,
            lessonsBooked: 8,
            lessonsRequired: 8,
            displayLabel: '5 of 8 lessons (63%)',
            needsDateOfBirth: false,
          } as StudentProgress,
        }),
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Adult With Progress')).toBeInTheDocument();
    });

    expect(screen.getAllByTitle('Mark complete').length).toBeGreaterThan(0);
  });

  it('[lessons track / adult] does not show "Mark complete" with zero completed lessons', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'adult-not-ready-1',
          fullName: 'Adult No Lessons Yet',
          activeEnrollment: activeEligibleEnrollment,
          progress: {
            track: 'lessons',
            percentComplete: 0,
            lessonsCompleted: 0,
            lessonsBooked: 0,
            lessonsRequired: 0,
            displayLabel: 'No lessons booked',
            needsDateOfBirth: false,
          } as StudentProgress,
        }),
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Adult No Lessons Yet')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Mark complete')).not.toBeInTheDocument();
  });

  it('does not show "Mark complete" for an enrollment already completed', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'done-1',
          fullName: 'Already Done',
          activeEnrollment: { ...activeEligibleEnrollment, status: 'completed', completed: true },
          progress: { track: 'completed', percentComplete: 100, displayLabel: 'Completed', needsDateOfBirth: false } as StudentProgress,
        }),
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Already Done')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Mark complete')).not.toBeInTheDocument();
  });

  it('does not show "Mark complete" for a student with no active enrollment', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'none-1', fullName: 'No Enrollment', activeEnrollment: null })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('No Enrollment')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Mark complete')).not.toBeInTheDocument();
  });

  it('clicking Mark complete shows a simple confirm dialog with no reason field, and confirms in one call (item 1)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (enrollmentsApi.complete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { ...activeEligibleEnrollment, completed: true } });

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'ready-2',
          fullName: 'Ready Student Two',
          activeEnrollment: activeEligibleEnrollment,
          progress: { track: 'hours', percentComplete: 100, displayLabel: '6 / 6 hrs', needsDateOfBirth: false } as StudentProgress,
        }),
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Ready Student Two')).toBeInTheDocument();
    });

    const markCompleteButton = screen.getAllByTitle('Mark complete')[0];
    await userEvent.click(markCompleteButton);

    // Item 1 regression: the reason step is gone entirely - only a
    // confirm dialog remains, and it's enabled immediately.
    const confirmButton = await screen.findByRole('button', { name: /confirm complete/i });
    expect(confirmButton).not.toBeDisabled();
    expect(screen.queryByPlaceholderText(/finished all required hours/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/completion reason/i)).not.toBeInTheDocument();
    expect(screen.getByText(/mark ready student two complete\?/i)).toBeInTheDocument();

    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(enrollmentsApi.complete).toHaveBeenCalledWith('enrollment-ready');
    });
  });

  // Regression coverage: the table view's confirm used to render its
  // Cancel/Confirm buttons in a `justify-between`-spread row stretched
  // across the full colSpan width, pushing them out to the far-right edge
  // of the table (where the old sticky action column used to be) even
  // though the row action that opened it lives under the name on the left.
  // The confirm now renders in a width-constrained block anchored under
  // the name, so Cancel/Confirm never drift away from where the user
  // clicked.
  it('renders the table-view confirm compactly under the name, not stretched full-width', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({
          id: 'ready-3',
          fullName: 'Ready Student Three',
          activeEnrollment: activeEligibleEnrollment,
          progress: { track: 'hours', percentComplete: 100, displayLabel: '6 / 6 hrs', needsDateOfBirth: false } as StudentProgress,
        }),
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Ready Student Three')).toBeInTheDocument();
    });

    const markCompleteButton = screen.getAllByTitle('Mark complete')[0];
    await userEvent.click(markCompleteButton);

    const confirmText = await screen.findByText(/mark ready student three complete\?/i);
    // The confirm's own wrapper (text + buttons together) is width-
    // constrained and NOT spread with justify-between across the row -
    // that's what let Cancel/Confirm drift to the far-right edge before.
    const confirmWrapper = confirmText.parentElement as HTMLElement;
    expect(confirmWrapper.className).toMatch(/max-w-sm/);
    expect(confirmWrapper.className).not.toMatch(/justify-between/);
  });
});

// Coverage for the new Students | Guardians segmented toggle - a shared
// page shell with two independent list sources, not a new top-level nav
// item or a "Clients"/"People" parent section.
describe('Students page - Guardians tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Jessica Park' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    (guardiansApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyGuardian({ id: 'guardian-1', firstName: 'Jane', lastName: 'Doe' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });

  it('shows the Students list by default and switches to the Guardians list on toggle click', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Jessica Park')).toBeInTheDocument();
    });
    expect(guardiansApi.getAll).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Guardians' }));

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
    expect(screen.queryByText('Jessica Park')).not.toBeInTheDocument();
  });

  it('the "Add" button label and action follow the active tab', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Jessica Park')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /add student/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Guardians' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument();
    });
  });

  it('clicking a guardian row opens the guardian detail modal', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    renderStudentsPage();

    await userEvent.click(screen.getByRole('button', { name: 'Guardians' }));
    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Jane Doe'));

    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});

// Guardian-first enrollment (the phone-call flow): "Enroll another student"
// opens the student form pre-seeded with the guardian already linked and a
// specific set of carried-over fields - never date of birth, permit
// details, or anything else student-specific.
describe('Students page - guardian-first enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
    });
    (guardiansApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'guardian-1',
          tenantId: 'tenant-1',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        } as Guardian,
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    (guardiansApi.getStudentsForGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'student-1',
          fullName: 'Alice Doe',
          lastName: 'Doe',
          addressLine1: '123 Main St',
          city: 'Springfield',
          state: 'CA',
          zipCode: '90001',
          emergencyContactFirstName: 'Jane',
          emergencyContactLastName: 'Doe',
          emergencyContactPhone: '5550100',
          isPrimary: true,
          relationship: 'mother',
        },
      ],
    });
  });

  it('opens the student form pre-filled from the guardian\'s primary student, without date of birth', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    renderStudentsPage();

    await userEvent.click(screen.getByRole('button', { name: 'Guardians' }));
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Jane Doe'));

    const enrollButton = await screen.findByRole('button', { name: /enroll another student/i });
    await userEvent.click(enrollButton);

    // The student form opened in create mode with the guardian pre-selected.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create student/i })).toBeInTheDocument();
    });

    const lastNameInput = document.getElementsByName('student_lastname_input')[0] as HTMLInputElement;
    expect(lastNameInput.value).toBe('Doe');

    const streetInput = document.getElementsByName('student_street_input')[0] as HTMLInputElement;
    expect(streetInput.value).toBe('123 Main St');

    const dobInput = document.getElementsByName('student_dob_input')[0] as HTMLInputElement;
    expect(dobInput.value).toBe('');
  });
});

// Unified search: typing in the shared search bar overlays mixed
// student+guardian results regardless of which tab is active, and reverts
// to the tab's normal view when cleared.
describe('Students page - unified search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Jessica Park' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    (guardiansApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyGuardian({ id: 'guardian-1', firstName: 'Jane', lastName: 'Smith' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });

  it('shows mixed typed results while on the Students tab, including a guardian match', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (searchApi.people as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { type: 'student', id: 'student-1', name: 'Jessica Park', email: 'jessica@example.com', phone: null },
        { type: 'guardian', id: 'guardian-1', name: 'Jane Smith', email: null, phone: '5550100' },
      ],
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Jessica Park')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/search students and guardians/i);
    await userEvent.type(searchInput, 'Smith');

    await waitFor(() => expect(searchApi.people).toHaveBeenCalledWith('Smith'));

    expect(await screen.findByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Guardian')).toBeInTheDocument();
  });

  it('hides the status filter chips while searching', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (searchApi.people as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Jessica Park')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^All/ })).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/search students and guardians/i);
    await userEvent.type(searchInput, 'xyz');

    await waitFor(() => expect(searchApi.people).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });

  it('reverts to the normal tab view when the search box is cleared', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (searchApi.people as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Jessica Park')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/search students and guardians/i);
    await userEvent.type(searchInput, 'xyz');
    await waitFor(() => expect(searchApi.people).toHaveBeenCalled());

    await userEvent.clear(searchInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^All/ })).toBeInTheDocument();
    });
  });

  it('clicking a guardian result from the Students tab opens the guardian detail modal', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (searchApi.people as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ type: 'guardian', id: 'guardian-1', name: 'Jane Smith', email: null, phone: '5550100' }],
    });
    (guardiansApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: emptyGuardian({ id: 'guardian-1', firstName: 'Jane', lastName: 'Smith' }),
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Jessica Park')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/search students and guardians/i);
    await userEvent.type(searchInput, 'Smith');
    const resultRow = await screen.findByText('Jane Smith');
    await userEvent.click(resultRow);

    await waitFor(() => expect(guardiansApi.getById).toHaveBeenCalledWith('guardian-1'));
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});

// Regression: Postgres numeric columns (lessons.duration) come back through
// the API as strings ("60.00", not 60). handleBookLesson must coerce before
// building bookAgainPrefill, or the wizard's duration state initializes as
// that string, which schedulingService's slot-generation arithmetic then
// silently string-concatenates instead of adding (540 + "60.00" =
// "54060.00"), producing zero search results every time.
//
// There is no separate "Book Again" button - "Book Lesson" prefills from
// the student's most recent lesson automatically when one exists.
describe('Students page - "Book Lesson" duration coercion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Pepper Pottsss' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });

  it('coerces mostRecentLesson.duration to a number before it reaches the booking wizard', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');

    (lessonsApi.getMostRecentByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'lesson-1',
        instructorId: 'instructor-1',
        // Real Postgres numeric-column shape: a string, not a number.
        duration: '60.00' as unknown as number,
        lessonType: 'behind_wheel',
        startTime: '09:00:00',
        pickupAddress: '123 Main St',
      } as Lesson,
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Pepper Pottsss')).toBeInTheDocument());

    await userEvent.click(screen.getByText('Pepper Pottsss'));

    // The modal's own header "Book Lesson" button, not the table row's
    // icon-only "Book lesson" button underneath it (same accessible name
    // pattern, case-insensitively) - scope by the modal's close button,
    // the one unambiguous anchor for "inside the open modal."
    const modalContainer = (await screen.findByLabelText('Close modal')).closest('div')!.parentElement!;
    const bookButton = await within(modalContainer).findByRole('button', { name: /book lesson/i });
    await userEvent.click(bookButton);

    const form = await screen.findByTestId('smart-booking-form');
    const prefilledDuration = JSON.parse(form.getAttribute('data-prefilled-duration')!);
    expect(prefilledDuration).toBe(60);
    expect(typeof prefilledDuration).toBe('number');
  });
});

// The dedicated right-side Actions column was removed entirely - actions
// now live UNDER the student's name (item 1 of the Students-list actions
// rework), since the name is always on-screen while a far-right column
// requires scrolling right regardless of how it's revealed. Same per-row
// hover-reveal mechanics as before (Gmail/Linear/Notion pattern), just
// relocated: hidden by default, faded in via opacity in a height that's
// unconditionally reserved (so a hovered row never reflows its neighbors)
// when hovering ANYWHERE on the row or when a row's action receives
// keyboard focus, and always visible on a touch/coarse-pointer device (no
// hover to trigger the reveal there). jsdom doesn't evaluate
// @media(hover:hover) or actually run :hover/:focus-within, so this is a
// structural check on the className contract itself, not a rendered-
// computed-style assertion (that's covered live via Playwright instead -
// see e2e-screenshots/).
describe('Students list - row actions live under the name, not a right-side column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Hover Test Student' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
  });

  it('there is no dedicated Actions column - the Edit action lives in the same cell as the student name, not a separate sticky cell', async () => {
    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Hover Test Student')).toBeInTheDocument());

    const nameCell = screen.getByText('Hover Test Student').closest('td')!;
    const editButton = screen.getByLabelText('Edit student');
    const actionsCell = editButton.closest('td')!;

    expect(actionsCell).toBe(nameCell);
    expect(actionsCell.className).not.toMatch(/\bsticky\b/);

    const row = actionsCell.closest('tr')!;
    expect(row.className).toMatch(/\bgroup\b/);

    // No table column is headed "Actions" any more.
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('the actions wrapper is hidden-by-default and reveals on hover/focus only behind a (hover: hover) media guard, with a base opacity-100 fallback for touch', async () => {
    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Hover Test Student')).toBeInTheDocument());

    const editButton = screen.getByLabelText('Edit student');
    const actionsWrapper = editButton.closest('div')!;

    // Touch/no-hover fallback: visible unconditionally by default.
    expect(actionsWrapper.className).toMatch(/(^|\s)opacity-100(\s|$)/);
    // A fixed min-height is reserved unconditionally (not only when
    // actions are shown), so a hovered row never reflows its neighbors.
    expect(actionsWrapper.className).toMatch(/min-h-\[/);
    // The hide/reveal behavior is gated behind an explicit hover-capable
    // media guard - never applied unconditionally, which is what would
    // make it invisible on a touch device with no hover.
    expect(actionsWrapper.className).toContain('[@media(hover:hover)]:opacity-0');
    expect(actionsWrapper.className).toContain('[@media(hover:hover)]:group-hover:opacity-100');
    // Keyboard accessibility: focusing any action inside the row must
    // reveal it the same way hover does - group-focus-within, not
    // group-hover alone.
    expect(actionsWrapper.className).toContain('[@media(hover:hover)]:group-focus-within:opacity-100');
  });

  it('every icon-only action has an accessible label', async () => {
    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Hover Test Student')).toBeInTheDocument());

    expect(screen.getByLabelText('Book a lesson')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit student')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete student')).toBeInTheDocument();
  });
});

describe('Students list - fee actions (Paid / Waive) under the name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('shows Mark-fees-paid and Waive-fees icons when a student has an outstanding fee', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Fee Student', hasOutstandingFee: true, outstandingFeeAmount: 50 })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Fee Student')).toBeInTheDocument());

    expect(screen.getByLabelText('Mark outstanding fees paid')).toBeInTheDocument();
    expect(screen.getByLabelText('Waive outstanding fees')).toBeInTheDocument();
  });

  it('does not show fee action icons when a student has no outstanding fee', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'No Fee Student', hasOutstandingFee: false })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('No Fee Student')).toBeInTheDocument());

    expect(screen.queryByLabelText('Mark outstanding fees paid')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Waive outstanding fees')).not.toBeInTheDocument();
  });

  it('clicking "Mark outstanding fees paid" confirms, then calls feeFlagsApi.markStudentFeesPaid with the student id', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (feeFlagsApi.markStudentFeesPaid as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Fee Student', hasOutstandingFee: true, outstandingFeeAmount: 50 })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Fee Student')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Mark outstanding fees paid'));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(feeFlagsApi.markStudentFeesPaid).toHaveBeenCalledWith('student-1'));

    confirmSpy.mockRestore();
  });

  it('does not call markStudentFeesPaid when the confirm dialog is declined', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'student-1', fullName: 'Fee Student', hasOutstandingFee: true, outstandingFeeAmount: 50 })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Fee Student')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Mark outstanding fees paid'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(feeFlagsApi.markStudentFeesPaid).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});

// Program-aware Students page (see docs/ARCHITECTURE.md's Students-page
// section): the program filter (All/BTW/DE) reads only the already-attached
// activeEnrollment/deEnrollment fields, and a dual-program student must
// appear exactly once per filter view it matches - never duplicated.
describe('Students list - program filter (item 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  const btwEnrollment = {
    id: 'enrollment-btw',
    programType: 'driver_training' as const,
    status: 'active' as const,
    enrollmentDate: new Date('2026-01-01'),
    completed: false,
    completionReason: null,
    withdrawnReason: null,
  };

  const deEnrollment = {
    id: 'enrollment-de',
    status: 'active' as const,
    completed: false,
    deDeliveryMode: 'online' as const,
    manualCompletedHours: 10,
    cohortName: null,
  };

  it('"Every Program" shows every student, one row each', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({ id: 'de-only', fullName: 'DE Only Student', activeEnrollment: null, deEnrollment }),
        emptyStudent({ id: 'btw-only', fullName: 'BTW Only Student', activeEnrollment: btwEnrollment, deEnrollment: null }),
        emptyStudent({ id: 'both', fullName: 'Dual Program Student', activeEnrollment: btwEnrollment, deEnrollment }),
      ],
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => expect(screen.getByText('DE Only Student')).toBeInTheDocument());
    expect(screen.getAllByText('DE Only Student')).toHaveLength(1);
    expect(screen.getAllByText('BTW Only Student')).toHaveLength(1);
    expect(screen.getAllByText('Dual Program Student')).toHaveLength(1);
  });

  it('"Behind-the-Wheel" filter shows only students with a BTW enrollment', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({ id: 'de-only', fullName: 'DE Only Student', activeEnrollment: null, deEnrollment }),
        emptyStudent({ id: 'btw-only', fullName: 'BTW Only Student', activeEnrollment: btwEnrollment, deEnrollment: null }),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('DE Only Student')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Behind-the-Wheel/ }));

    expect(screen.getByText('BTW Only Student')).toBeInTheDocument();
    expect(screen.queryByText('DE Only Student')).not.toBeInTheDocument();
  });

  it('"Driver Education" filter shows only students with a DE enrollment', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({ id: 'de-only', fullName: 'DE Only Student', activeEnrollment: null, deEnrollment }),
        emptyStudent({ id: 'btw-only', fullName: 'BTW Only Student', activeEnrollment: btwEnrollment, deEnrollment: null }),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('DE Only Student')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Driver Education/ }));

    expect(screen.getByText('DE Only Student')).toBeInTheDocument();
    expect(screen.queryByText('BTW Only Student')).not.toBeInTheDocument();
  });

  it('a dual-program student appears in both the BTW and DE filtered views, still one row each time', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'both', fullName: 'Dual Program Student', activeEnrollment: btwEnrollment, deEnrollment })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('Dual Program Student')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Behind-the-Wheel/ }));
    expect(screen.getAllByText('Dual Program Student')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /^Driver Education/ }));
    expect(screen.getAllByText('Dual Program Student')).toHaveLength(1);
  });

  it('the Program column shows "DE·BTW" for a dual-program student, "DE" and "BTW" for single-program students', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({ id: 'de-only', fullName: 'DE Only Student', activeEnrollment: null, deEnrollment }),
        emptyStudent({ id: 'btw-only', fullName: 'BTW Only Student', activeEnrollment: btwEnrollment, deEnrollment: null }),
        emptyStudent({ id: 'both', fullName: 'Dual Program Student', activeEnrollment: btwEnrollment, deEnrollment }),
      ],
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('DE Only Student')).toBeInTheDocument());

    expect(within(screen.getByText('DE Only Student').closest('tr')!).getByText('DE')).toBeInTheDocument();
    expect(within(screen.getByText('BTW Only Student').closest('tr')!).getByText('BTW')).toBeInTheDocument();
    expect(within(screen.getByText('Dual Program Student').closest('tr')!).getByText('DE·BTW')).toBeInTheDocument();
  });

  it('a DE-only student shows DE status ("X/4 days" or hours), not BTW\'s "No Active Enrollment" text', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'de-only', fullName: 'DE Only Student', activeEnrollment: null, deEnrollment })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('DE Only Student')).toBeInTheDocument());

    const row = screen.getByText('DE Only Student').closest('tr')!;
    expect(within(row).getAllByText('10 hours logged').length).toBeGreaterThan(0);
    expect(within(row).queryByText(/no active enrollment/i)).not.toBeInTheDocument();
  });

  it('a BTW student shows BTW status under "Every Program", not DE status', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'btw-only', fullName: 'BTW Only Student', activeEnrollment: btwEnrollment, deEnrollment: null })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();
    await waitFor(() => expect(screen.getByText('BTW Only Student')).toBeInTheDocument());

    const row = screen.getByText('BTW Only Student').closest('tr')!;
    expect(within(row).getByText(/ready to book/i)).toBeInTheDocument();
  });
});
