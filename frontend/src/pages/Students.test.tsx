import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StudentsPage } from './Students';
import { studentsApi, lessonsApi, dashboardApi, guardiansApi, searchApi, enrollmentsApi } from '@/api';
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
// rejects marking such a student's program complete - but the Students
// list previously had no way to surface which existing records are
// affected, so an admin had no way to find and fix them proactively.
describe('Students list - needsGuardian flagging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (dashboardApi.getNoShowAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('shows a "Needs Guardian" badge on an affected student row', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        emptyStudent({ id: 'minor-1', fullName: 'Minor No Guardian', needsGuardian: true }),
        emptyStudent({ id: 'adult-1', fullName: 'Adult Fine', needsGuardian: false }),
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Minor No Guardian')).toBeInTheDocument();
    });

    const minorRow = screen.getByText('Minor No Guardian').closest('tr')!;
    expect(within(minorRow).getByText('Needs Guardian')).toBeInTheDocument();

    const adultRow = screen.getByText('Adult Fine').closest('tr')!;
    expect(within(adultRow).queryByText('Needs Guardian')).not.toBeInTheDocument();
  });

  it('does not render the "Needs Guardian" filter chip when no student is affected', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [emptyStudent({ id: 'adult-1', fullName: 'Adult Fine', needsGuardian: false })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    renderStudentsPage();

    await waitFor(() => {
      expect(screen.getByText('Adult Fine')).toBeInTheDocument();
    });
    expect(screen.queryByText('Needs Guardian', { selector: 'button *' })).not.toBeInTheDocument();
  });

  it('the "Needs Guardian" filter chip narrows the list to only affected students', async () => {
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

    const filterButton = screen.getByRole('button', { name: /needs guardian/i });
    await userEvent.click(filterButton);

    expect(screen.getByText('Minor No Guardian')).toBeInTheDocument();
    expect(screen.queryByText('Adult Fine')).not.toBeInTheDocument();
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

  it('clicking Mark complete reveals a reason field; confirm is disabled until a reason is entered, then calls enrollmentsApi.complete', async () => {
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

    const confirmButton = await screen.findByRole('button', { name: /confirm complete/i });
    expect(confirmButton).toBeDisabled();

    const reasonInput = screen.getByPlaceholderText(/finished all required hours/i);
    await userEvent.type(reasonInput, 'Passed final road test');
    expect(confirmButton).not.toBeDisabled();

    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(enrollmentsApi.complete).toHaveBeenCalledWith('enrollment-ready', 'Passed final road test');
    });
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
