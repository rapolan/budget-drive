import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_email_input')[0], {
      target: { value: 'jane.doe@example.com' },
    });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], {
      target: { value: '5550100' },
    });

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText(/date of birth is required/i)).toBeInTheDocument();
    expect(studentsApi.create).not.toHaveBeenCalled();
  });
});

// Regression coverage: the backend guardian-feature session renamed
// emergencyContactName -> emergencyContactFirstName/emergencyContactLastName
// (and emergencyContact2Name -> its first/last split) and dropped the
// legacy emergencyContact field entirely. StudentModal previously still
// submitted the old field names, which the backend silently ignored -
// parent contact names typed into the form were discarded on save with
// no error. This locks the submitted payload to the new field contract.
describe('StudentModal create form - emergency contact field contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
  });

  it('renders separate first/last name inputs for the parent/guardian contact', () => {
    renderModal();
    expect(document.getElementsByName('guardian_firstname_input')).toHaveLength(1);
    expect(document.getElementsByName('guardian_lastname_input')).toHaveLength(1);
    // The old single combined-name input no longer exists.
    expect(document.getElementsByName('guardian_name_input')).toHaveLength(0);
  });

  it('submits emergencyContactFirstName/emergencyContactLastName and omits the legacy fields', async () => {
    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_email_input')[0], {
      target: { value: 'jane.doe@example.com' },
    });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2010-01-01' } });

    fireEvent.change(document.getElementsByName('guardian_firstname_input')[0], { target: { value: 'Parent' } });
    fireEvent.change(document.getElementsByName('guardian_lastname_input')[0], { target: { value: 'Contact' } });
    fireEvent.change(document.getElementsByName('guardian_phone_input')[0], { target: { value: '5551234567' } });

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(payload.emergencyContactFirstName).toBe('Parent');
    expect(payload.emergencyContactLastName).toBe('Contact');
    expect(payload).not.toHaveProperty('emergencyContact');
    expect(payload).not.toHaveProperty('emergencyContactName');
    expect(payload).not.toHaveProperty('emergencyContact2Name');
  });
});
