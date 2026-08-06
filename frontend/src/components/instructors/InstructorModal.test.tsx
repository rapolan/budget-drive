import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InstructorModal } from './InstructorModal';
import { instructorsApi } from '@/api';

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
});
