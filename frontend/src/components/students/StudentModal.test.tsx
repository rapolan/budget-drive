import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { StudentModal } from './StudentModal';
import { studentsApi, guardiansApi } from '@/api';
import type { Student, GuardianCandidate } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      create: vi.fn(),
      createWithGuardian: vi.fn(),
    },
    guardiansApi: {
      ...actual.guardiansApi,
      findCandidates: vi.fn().mockResolvedValue({ data: [] }),
      findExactMatch: vi.fn().mockResolvedValue({ data: [] }),
      getStudentsForGuardian: vi.fn().mockResolvedValue({ data: [] }),
      getForStudent: vi.fn().mockResolvedValue({ data: [] }),
    },
    lessonsApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
    instructorsApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
  };
});

function guardianCandidate(overrides: Partial<GuardianCandidate> = {}): GuardianCandidate {
  return {
    id: 'guardian-1',
    tenantId: 'tenant-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    linkedStudentNames: [],
    ...overrides,
  } as GuardianCandidate;
}

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

function renderModal(student: Student | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentModal student={student} onClose={() => {}} />
    </QueryClientProvider>
  );
}

function editableStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Existing Student',
    email: 'existing@example.com',
    phone: '5550100',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    totalHoursCompleted: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
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

// Regression coverage: the backend made students.email nullable - required
// only for adults (18+ by dateOfBirth), optional for minors. StudentModal
// previously hard-required email for every student (HTML `required` +
// disabled-button predicate), which blocked saving minors with no email
// even though the backend now allows it.
describe('StudentModal create form - email conditional on age', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
  });

  function fillBasicFields(dob: string) {
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: dob } });
  }

  it('marks the email input as optional (not required) for a minor', () => {
    renderModal();
    fillBasicFields('2015-01-01'); // well under 18

    const emailInput = document.getElementsByName('student_email_input')[0] as HTMLInputElement;
    expect(emailInput).not.toBeRequired();
    expect(screen.getByText(/optional for minors/i)).toBeInTheDocument();
  });

  it('marks the email input as required for an adult', () => {
    renderModal();
    fillBasicFields('1990-01-01'); // well over 18

    const emailInput = document.getElementsByName('student_email_input')[0] as HTMLInputElement;
    expect(emailInput).toBeRequired();
  });

  it('a minor saves successfully with no email', async () => {
    renderModal();
    fillBasicFields('2015-01-01');

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.email).toBe('');
    expect(screen.queryByText(/email is required/i)).not.toBeInTheDocument();
  });

  it('blocks submission with a clear message when an adult has no email', () => {
    renderModal();
    fillBasicFields('1990-01-01');

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText(/email is required for adult students/i)).toBeInTheDocument();
    expect(studentsApi.create).not.toHaveBeenCalled();
  });

  it('an adult saves successfully once an email is provided', async () => {
    renderModal();
    fillBasicFields('1990-01-01');
    fireEvent.change(document.getElementsByName('student_email_input')[0], {
      target: { value: 'adult@example.com' },
    });

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.email).toBe('adult@example.com');
  });
});

// Regression coverage: the backend rejects marking a minor's program
// complete while needsGuardian is true, but the frontend previously gave
// no indication of this requirement anywhere in the form - an admin would
// only discover it after a rejected save. This surfaces the requirement
// proactively in the Parent/Guardian section.
describe('StudentModal - needsGuardian surfaced in the guardian section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a warning when editing an existing student with needsGuardian=true', () => {
    renderModal(editableStudent({ needsGuardian: true }));
    expect(screen.getByText(/needs a linked guardian record/i)).toBeInTheDocument();
  });

  it('shows no warning when editing an existing student with needsGuardian=false', () => {
    renderModal(editableStudent({ needsGuardian: false }));
    expect(screen.queryByText(/needs a linked guardian record/i)).not.toBeInTheDocument();
  });

  it('shows the "recommended for minors" hint and the guardian picker entry point for a new minor student', () => {
    renderModal(); // create mode, student is null

    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });

    expect(screen.getByText(/recommended for minors/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link a guardian/i })).toBeInTheDocument();
  });

  it('does not show the "recommended for minors" hint for a new adult student, but the picker is still available', () => {
    renderModal();

    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '1990-01-01' } });

    expect(screen.queryByText(/recommended for minors/i)).not.toBeInTheDocument();
    // Adults may also link a guardian - it's optional either way, not gated by age.
    expect(screen.getByRole('button', { name: /link a guardian/i })).toBeInTheDocument();
  });
});

// Constraint B: the frontend calls the backend matching endpoint and
// renders exactly what it returns - no client-side ranking/dedup. Only the
// query-param routing (which single field a free-text box maps to) is
// decided client-side.
describe('StudentModal - guardian type-ahead (Constraint B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('shows candidates with disambiguating context and a permanent "create new" option', async () => {
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        guardianCandidate({ id: 'g1', firstName: 'Jane', lastName: 'Smith', linkedStudentNames: ['Alice Smith', 'Bob Smith'] }),
      ],
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Smith' } });

    await waitFor(() => {
      expect(guardiansApi.findCandidates).toHaveBeenCalledWith({ lastName: 'Smith' });
    });

    expect(await screen.findByText(/Jane Smith/)).toBeInTheDocument();
    expect(screen.getByText(/Parent of: Alice Smith, Bob Smith/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new guardian instead/i })).toBeInTheDocument();
  });

  it('routes an email-shaped query to the email param, not lastName', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), {
      target: { value: 'jane@example.com' },
    });

    await waitFor(() => {
      expect(guardiansApi.findCandidates).toHaveBeenCalledWith({ email: 'jane@example.com' });
    });
  });

  it('selecting a candidate shows it as selected and never calls a link/create endpoint before submit', async () => {
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [guardianCandidate({ id: 'g1', firstName: 'Jane', lastName: 'Doe' })],
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });

    const candidateButton = await screen.findByText(/Jane Doe/);
    fireEvent.click(candidateButton);

    expect(screen.getByText('Change')).toBeInTheDocument();
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
  });

  it('"Create new guardian instead" reveals editable fields and is always present regardless of results', async () => {
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [guardianCandidate({ id: 'g1' })],
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });
    await screen.findByText(/Jane Doe/);

    fireEvent.click(screen.getByRole('button', { name: /create new guardian instead/i }));

    expect(screen.getByText('New Guardian')).toBeInTheDocument();
  });
});

// Constraint A: creating a student with a guardian must go through the
// single atomic endpoint, never create() followed by a separate link call.
describe('StudentModal - atomic create with guardian (Constraint A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [guardianCandidate({ id: 'g1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' })],
    });
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { student: { id: 'student-1', fullName: 'Minor Student' }, guardian: { id: 'g1' }, link: { id: 'link-1' } },
    });
  });

  function fillBasicFields() {
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Minor' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });
  }

  it('calls studentsApi.createWithGuardian (not create) when an existing guardian is selected, and never calls create()', async () => {
    renderModal();
    fillBasicFields();

    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });
    const candidateButton = await screen.findByText(/Jane Doe/);
    fireEvent.click(candidateButton);

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    expect(studentsApi.create).not.toHaveBeenCalled();

    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardian).toEqual({ mode: 'existing', guardianId: 'g1', relationship: undefined, isPrimary: true });
  });

  it('calls studentsApi.createWithGuardian with mode=new when creating a new guardian, and never calls create()', async () => {
    renderModal();
    fillBasicFields();

    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.click(screen.getByRole('button', { name: /create new guardian instead/i }));

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const firstNameInput = newGuardianSection.querySelector('input[placeholder="First"]') as HTMLInputElement;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'New' } });
    fireEvent.change(lastNameInput, { target: { value: 'Guardian' } });

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    expect(studentsApi.create).not.toHaveBeenCalled();

    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardian.mode).toBe('new');
    expect(payload.guardian.firstName).toBe('New');
    expect(payload.guardian.lastName).toBe('Guardian');
  });

  it('plain create() is still used when no guardian is being linked (adults, or minors deferring guardian setup)', async () => {
    renderModal();
    fillBasicFields();

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledTimes(1));
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
  });
});

// Constraint C: never merge silently. A new guardian whose email/phone
// exactly matches an existing record must surface a confirm panel with an
// explicit choice, never an automatic link, and never on name alone.
describe('StudentModal - duplicate guardian confirm (Constraint C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.getStudentsForGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 's1', fullName: 'Alice Smith' }],
    });
    (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { student: { id: 'student-1', fullName: 'New Student' }, guardian: { id: 'g-existing' }, link: { id: 'link-1' } },
    });
  });

  function fillBasicFieldsAndNewGuardian(email: string) {
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'New' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.click(screen.getByRole('button', { name: /create new guardian instead/i }));

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const emailInput = newGuardianSection.querySelector('input[placeholder="email@example.com"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: email } });
  }

  it('shows the confirm panel when a new guardian email exactly matches an existing one, and does not submit yet', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'g-existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null }],
    });

    renderModal();
    fillBasicFieldsAndNewGuardian('jane@example.com');

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(await screen.findByText(/parent of Alice Smith/i)).toBeInTheDocument();
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
  });

  it('"Link to this guardian" links the existing match instead of creating a separate record', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'g-existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null }],
    });

    renderModal();
    fillBasicFieldsAndNewGuardian('jane@example.com');

    fireEvent.submit(screen.getByTitle('Date of Birth').closest('form')!);
    await screen.findByText(/already exists/i);

    fireEvent.click(screen.getByRole('button', { name: /link to this guardian/i }));

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardian).toMatchObject({ mode: 'existing', guardianId: 'g-existing' });
  });

  it('"Create separate record" proceeds with the original new-guardian payload, bypassing the match', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'g-existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null }],
    });

    renderModal();
    fillBasicFieldsAndNewGuardian('jane@example.com');

    fireEvent.submit(screen.getByTitle('Date of Birth').closest('form')!);
    await screen.findByText(/already exists/i);

    fireEvent.click(screen.getByRole('button', { name: /create separate record/i }));

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardian).toMatchObject({ mode: 'new', email: 'jane@example.com' });
  });

  it('never checks for duplicates on name alone - only when email or phone is present', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal();
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'New' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: /link a guardian/i }));
    fireEvent.click(screen.getByRole('button', { name: /create new guardian instead/i }));
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    fireEvent.change(lastNameInput, { target: { value: 'Doe' } }); // matches an existing guardian's surname, but no email/phone entered

    fireEvent.submit(screen.getByTitle('Date of Birth').closest('form')!);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    expect(guardiansApi.findExactMatch).not.toHaveBeenCalled();
  });
});

// Siblings display: derived from shared guardians, shown on the student
// detail view for existing students only.
describe('StudentModal - siblings display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('shows a "Siblings" line listing other students linked to the same guardian(s)', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'guardian-1', firstName: 'Jane', lastName: 'Doe' }],
    });
    (guardiansApi.getStudentsForGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { id: 'student-1', fullName: 'Existing Student' }, // self - must be excluded
        { id: 'student-2', fullName: 'Sibling One' },
        { id: 'student-3', fullName: 'Sibling Two' },
      ],
    });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => {
      expect(screen.getByText(/siblings:/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Sibling One, Sibling Two')).toBeInTheDocument();
  });

  it('shows nothing when the student has no siblings', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'guardian-1', firstName: 'Jane', lastName: 'Doe' }],
    });
    (guardiansApi.getStudentsForGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'student-1', fullName: 'Existing Student' }], // only self
    });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => {
      expect(guardiansApi.getStudentsForGuardian).toHaveBeenCalled();
    });
    expect(screen.queryByText(/siblings:/i)).not.toBeInTheDocument();
  });

  it('does not fetch siblings for a new (not-yet-created) student', () => {
    renderModal(); // create mode
    expect(guardiansApi.getForStudent).not.toHaveBeenCalled();
  });
});
