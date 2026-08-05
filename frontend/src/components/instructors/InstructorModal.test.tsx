import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

    fireEvent.change(screen.getByPlaceholderText('John Smith'), {
      target: { name: 'fullName', value: 'Test Instructor' },
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
