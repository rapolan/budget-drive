import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StudentsPage } from './Students';
import { studentsApi, lessonsApi, dashboardApi, guardiansApi } from '@/api';
import type { Student, Guardian } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn() },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn() },
    dashboardApi: { ...actual.dashboardApi, getNoShowAlerts: vi.fn() },
    guardiansApi: { ...actual.guardiansApi, getAll: vi.fn() },
  };
});

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
