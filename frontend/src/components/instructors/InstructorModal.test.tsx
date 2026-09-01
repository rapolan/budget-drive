import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstructorModal } from './InstructorModal';
import { instructorsApi } from '@/api';
import type { Instructor } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    instructorsApi: {
      ...actual.instructorsApi,
      create: vi.fn(),
    },
  };
});

vi.mock('@/api/users', () => ({
  usersApi: { invite: vi.fn() },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenantNow: {
      timezone: 'America/Los_Angeles',
      today: '2026-03-01',
      tomorrow: '2026-03-02',
      currentTime: '12:00',
      weekStart: '2026-02-22',
      weekEnd: '2026-02-28',
      monthBoundaries: { start: '2026-03-01', end: '2026-03-31' },
    },
  }),
}));

afterEach(cleanup);

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstructorModal instructor={null} onClose={() => {}} />
    </QueryClientProvider>
  );
}

function renderModalEditing(instructor: Instructor) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstructorModal instructor={instructor} onClose={() => {}} />
    </QueryClientProvider>
  );
}

describe('InstructorModal create failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a visible error message when instructor creation fails, instead of failing silently', async () => {
    (instructorsApi.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      message: 'Request failed with status code 500',
      response: { data: { error: 'Internal server error' } },
    });

    renderModal();

    fireEvent.change(screen.getByPlaceholderText('First'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last'), {
      target: { value: 'Instructor' },
    });
    fireEvent.change(screen.getByPlaceholderText('instructor@email.com'), {
      target: { name: 'email', value: 'test.instructor@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 123-4567'), {
      target: { name: 'phone', value: '555-0100' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create instructor/i }));

    await waitFor(() => {
      expect(screen.getByText('Internal server error')).toBeInTheDocument();
    });
  });
});

describe('InstructorModal form fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins first/middle/last name into fullName on submit', async () => {
    (instructorsApi.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: 'instructor-1' },
    });

    renderModal();

    fireEvent.change(screen.getByPlaceholderText('First'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Middle'), { target: { value: 'Q' } });
    fireEvent.change(screen.getByPlaceholderText('Last'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('instructor@email.com'), {
      target: { name: 'email', value: 'jane.doe@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 123-4567'), {
      target: { value: '5550100' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create instructor/i }));

    await waitFor(() => {
      expect(instructorsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Jane Q Doe' })
      );
    });
  });

  it('formats the phone input as (XXX) XXX-XXXX while typing', () => {
    renderModal();

    const phoneInput = screen.getByPlaceholderText('(555) 123-4567') as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '5551234567' } });

    expect(phoneInput.value).toBe('(555) 123-4567');
  });

  it('hourly rate shows blank (not "0") when unset, and typing over it never produces a leading zero', () => {
    renderModal();

    const rateInput = screen.getByPlaceholderText('35.00') as HTMLInputElement;
    expect(rateInput.value).toBe('');

    fireEvent.change(rateInput, { target: { value: '5' } });
    expect(rateInput.value).toBe('5');
    expect(rateInput.value).not.toBe('05');

    fireEvent.change(rateInput, { target: { value: '' } });
    expect(rateInput.value).toBe('');
  });

  // Regression: Postgres numeric columns (instructors.hourly_rate) come back
  // through the API as strings ("25.00", not 25) - `|| 0` only falls back on
  // falsy values, it doesn't coerce a non-empty string, so editing an
  // existing instructor used to show the raw string in the number input.
  it('coerces a string-typed hourlyRate to a number when editing an existing instructor', () => {
    renderModalEditing({
      id: 'instructor-1',
      tenantId: 'tenant-1',
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      phone: '5550100',
      employmentType: 'w2_employee',
      hireDate: new Date('2026-01-01'),
      status: 'active',
      hourlyRate: '25.00' as unknown as number,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as Instructor);

    const rateInput = screen.getByPlaceholderText('35.00') as HTMLInputElement;
    expect(rateInput.value).toBe('25');
  });
});

describe('InstructorModal driver education classroom teacher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the credential fields until "Qualified to teach" is checked, then submits them', async () => {
    (instructorsApi.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: 'instructor-1' },
    });

    renderModal();

    expect(screen.queryByLabelText(/credential number/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/qualified to teach driver education classes/i));

    expect(screen.getByLabelText(/credential number/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/credential number/i), { target: { value: 'DE-CRED-1' } });

    fireEvent.change(screen.getByPlaceholderText('First'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('instructor@email.com'), {
      target: { name: 'email', value: 'jane.doe@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('(555) 123-4567'), { target: { value: '5550100' } });

    fireEvent.click(screen.getByRole('button', { name: /create instructor/i }));

    await waitFor(() => {
      expect(instructorsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ isDeTeacher: true, deCredentialNumber: 'DE-CRED-1' })
      );
    });
  });

  it('pre-fills isDeTeacher and the credential fields when editing an existing DE-flagged instructor', () => {
    renderModalEditing({
      id: 'instructor-1',
      tenantId: 'tenant-1',
      fullName: 'Ms. Rivera',
      email: 'rivera@example.com',
      phone: '5550100',
      employmentType: 'w2_employee',
      hireDate: new Date('2026-01-01'),
      status: 'active',
      isDeTeacher: true,
      deCredentialNumber: 'DE-CRED-9',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as Instructor);

    const checkbox = screen.getByLabelText(/qualified to teach driver education classes/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect((screen.getByLabelText(/credential number/i) as HTMLInputElement).value).toBe('DE-CRED-9');
  });
});
