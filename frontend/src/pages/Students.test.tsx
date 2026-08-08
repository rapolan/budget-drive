import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StudentsPage } from './Students';
import { studentsApi, lessonsApi, dashboardApi, guardiansApi, searchApi } from '@/api';
import type { Student, Guardian } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn(), getById: vi.fn() },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn() },
    dashboardApi: { ...actual.dashboardApi, getNoShowAlerts: vi.fn() },
    guardiansApi: {
      ...actual.guardiansApi,
      getAll: vi.fn(),
      getById: vi.fn(),
      getStudentsForGuardian: vi.fn().mockResolvedValue({ data: [] }),
      findCandidates: vi.fn().mockResolvedValue({ data: [] }),
    },
    searchApi: { ...actual.searchApi, people: vi.fn() },
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
