import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstructorMyProfilePage } from './MyProfile';
import { instructorsApi } from '@/api';
import type { Instructor } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    instructorsApi: {
      ...actual.instructorsApi,
      getMe: vi.fn(),
    },
  };
});

vi.mock('@/components/instructors/CalendarFeedSettings', () => ({
  CalendarFeedSettings: ({ instructorId }: { instructorId: string }) => (
    <div data-testid="calendar-feed-settings">feed for {instructorId}</div>
  ),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'instructor', instructorId: 'instructor-self-1' } }),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantNow: { today: '2026-08-17' } }),
}));

afterEach(cleanup);

function instructor(overrides: Partial<Instructor>): Instructor {
  return {
    id: 'instructor-self-1',
    tenantId: 'tenant-1',
    fullName: 'Pat Instructor',
    email: 'pat@example.com',
    phone: '6195551234',
    employmentType: 'w2_employee',
    hireDate: new Date('2026-01-01'),
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Instructor;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstructorMyProfilePage />
    </QueryClientProvider>
  );
}

describe('InstructorMyProfilePage', () => {
  it('fetches via GET /instructors/me, not a by-id lookup', async () => {
    (instructorsApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: instructor({}) });

    renderPage();

    await waitFor(() => {
      expect(instructorsApi.getMe).toHaveBeenCalled();
      expect(screen.getByText('Pat Instructor')).toBeInTheDocument();
    });
  });

  it('shows license number and expiration when present', async () => {
    (instructorsApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: instructor({
        instructorLicenseNumber: 'I1234567',
        instructorLicenseExpiration: new Date('2028-01-20') as unknown as Date,
      }),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/I1234567/)).toBeInTheDocument();
    });
  });

  it('mounts CalendarFeedSettings scoped to this instructor\'s own id', async () => {
    (instructorsApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: instructor({}) });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('calendar-feed-settings')).toHaveTextContent('feed for instructor-self-1');
    });
  });
});
