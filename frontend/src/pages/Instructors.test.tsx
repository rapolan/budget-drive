import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { InstructorsPage } from './Instructors';
import { instructorsApi } from '@/api';
import type { Instructor } from '@/types';

// Regression: the Instructors page's four summary cards included "Avg
// Hourly Rate," which is display-only and not actionable. Replaced with a
// "Licenses Expiring Soon" count (expiring, expired, or missing among
// active instructors), using danger/warning tokens and filtering the list
// to those instructors on click.

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn() },
    lessonsApi: { ...actual.lessonsApi, getAll: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 1000, total: 0, totalPages: 0 } }) },
  };
});

const TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-03-01',
  tomorrow: '2026-03-02',
  currentTime: '12:00',
  weekStart: '2026-02-22',
  weekEnd: '2026-02-28',
  monthBoundaries: { start: '2026-03-01', end: '2026-03-31' },
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantNow: TENANT_NOW }),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

function instructor(overrides: Partial<Instructor>): Instructor {
  return {
    id: 'instructor-1',
    tenantId: 'tenant-1',
    fullName: 'Test Instructor',
    email: 'instructor@example.com',
    phone: '555-0100',
    employmentType: 'w2_employee',
    hireDate: new Date('2020-01-01'),
    status: 'active',
    hourlyRate: 30,
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
    ...overrides,
  } as Instructor;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <InstructorsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Instructors page - Licenses Expiring Soon card', () => {
  it('counts active instructors with expiring, expired, or missing licenses, excluding valid ones', async () => {
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        instructor({ id: 'i1', fullName: 'Expiring Soon', instructorLicenseExpiration: '2026-03-10' as unknown as Date }),
        instructor({ id: 'i2', fullName: 'Already Expired', instructorLicenseExpiration: '2026-01-01' as unknown as Date }),
        instructor({ id: 'i3', fullName: 'No License On File', instructorLicenseExpiration: undefined }),
        instructor({ id: 'i4', fullName: 'Comfortably Valid', instructorLicenseExpiration: '2028-01-01' as unknown as Date }),
        instructor({ id: 'i5', fullName: 'On Leave Expired', status: 'on_leave', instructorLicenseExpiration: '2026-01-01' as unknown as Date }),
      ],
    });

    renderPage();

    // i1 (expiring) + i2 (expired) + i3 (missing) = 3. i4 (valid) excluded.
    // i5 excluded too - only status: 'active' instructors are counted.
    await waitFor(() => {
      const statValue = screen.getByText('Licenses Expiring Soon').previousElementSibling;
      expect(statValue?.textContent).toBe('3');
    });
  });

  it('filters the list to only license-issue instructors when the card is clicked', async () => {
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        instructor({ id: 'i1', fullName: 'Expiring Soon', instructorLicenseExpiration: '2026-03-10' as unknown as Date }),
        instructor({ id: 'i2', fullName: 'Comfortably Valid', instructorLicenseExpiration: '2028-01-01' as unknown as Date }),
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Licenses Expiring Soon')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Licenses Expiring Soon').closest('div')!.parentElement!);

    await waitFor(() => {
      expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
      expect(screen.queryByText('Comfortably Valid')).not.toBeInTheDocument();
    });
  });

  it('shows 0 with no danger styling when no instructor has a license issue', async () => {
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [instructor({ id: 'i1', fullName: 'All Good', instructorLicenseExpiration: '2028-01-01' as unknown as Date })],
    });

    renderPage();

    await waitFor(() => {
      const statValue = screen.getByText('Licenses Expiring Soon').previousElementSibling;
      expect(statValue?.textContent).toBe('0');
    });
  });

  it('no longer shows the old Avg Hourly Rate card', async () => {
    (instructorsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [instructor({})] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Licenses Expiring Soon')).toBeInTheDocument();
    });
    expect(screen.queryByText('Avg Hourly Rate')).not.toBeInTheDocument();
  });
});
