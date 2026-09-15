import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VehicleModal } from './VehicleModal';
import { vehiclesApi, instructorsApi } from '@/api';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    vehiclesApi: { ...actual.vehiclesApi, create: vi.fn(), update: vi.fn() },
    instructorsApi: { ...actual.instructorsApi, getAll: vi.fn().mockResolvedValue({ data: [] }) },
  };
});

afterEach(cleanup);

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VehicleModal vehicle={null} onClose={() => {}} />
    </QueryClientProvider>
  );
}

// Regression coverage: the form's `required` HTML attributes on make,
// model, year, licensePlate, vin, registrationExpiration, and
// insuranceExpiration silently blocked native form submission (no
// network request at all) whenever any were empty - exactly what a
// school entering "I know who owns this, I'll fill in the rest later"
// hits on day one. Only Ownership Type stays required.
describe('VehicleModal - create with only ownership info', () => {
  it('submits successfully with ONLY Ownership Type filled in - no other field blocks the browser-native submit', async () => {
    const user = userEvent.setup();
    vi.mocked(vehiclesApi.create).mockResolvedValue({
      success: true,
      data: { id: 'vehicle-1', ownershipType: 'school_owned', currentMileage: 0, status: 'active' } as any,
    });

    renderModal();

    // Ownership Type already defaults to 'school_owned' - submit immediately.
    await user.click(screen.getByRole('button', { name: /create vehicle/i }));

    await waitFor(() => {
      expect(vehiclesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownershipType: 'school_owned' })
      );
    });
  });

  it('shows the owning-instructor picker only when Ownership Type is Instructor Owned, and requires it', async () => {
    const user = userEvent.setup();
    vi.mocked(instructorsApi.getAll).mockResolvedValue({
      success: true,
      data: [{ id: 'instructor-1', fullName: 'Jane Driver' }],
    } as any);

    renderModal();

    expect(screen.queryByLabelText(/owning instructor/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /ownership type/i }), 'instructor_owned');

    expect(await screen.findByText(/owning instructor/i)).toBeInTheDocument();
    expect(await screen.findByText('Jane Driver')).toBeInTheDocument();
  });

  it('displays a mutation error instead of silently doing nothing (the reported "Create button does nothing" symptom)', async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error('request failed'), {
      response: { data: { error: 'ownerInstructorId is required when ownershipType is instructor_owned' } },
    });
    vi.mocked(vehiclesApi.create).mockRejectedValue(error);

    renderModal();

    await user.click(screen.getByRole('button', { name: /create vehicle/i }));

    expect(await screen.findByText(/ownerInstructorId is required/i)).toBeInTheDocument();
  });
});
