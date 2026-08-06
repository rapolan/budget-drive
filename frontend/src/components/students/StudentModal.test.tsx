import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { StudentModal } from './StudentModal';
import { studentsApi } from '@/api';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      create: vi.fn(),
    },
    lessonsApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
    instructorsApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
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

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentModal student={null} onClose={() => {}} />
    </QueryClientProvider>
  );
}

// Regression coverage: date of birth was previously optional on the
// create-student form (no required attribute, not in the disabled
// predicate, handleSubmit performed zero validation of any field).
describe('StudentModal create form - date of birth required', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the date of birth input as required on create', () => {
    renderModal();
    const dobInput = screen.getByTitle('Date of Birth') as HTMLInputElement;
    expect(dobInput).toBeRequired();
  });

  it('blocks submission and shows a validation message when date of birth is missing', () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('First'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('email@example.com'), {
      target: { name: 'email', value: 'jane.doe@example.com' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('(555) 123-4567')[0], {
      target: { value: '5550100' },
    });

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText(/date of birth is required/i)).toBeInTheDocument();
    expect(studentsApi.create).not.toHaveBeenCalled();
  });
});
