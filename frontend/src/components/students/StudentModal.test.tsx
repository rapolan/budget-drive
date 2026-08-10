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
      linkToStudent: vi.fn(),
      unlinkFromStudent: vi.fn(),
      setPrimary: vi.fn(),
      updateRelationship: vi.fn(),
      create: vi.fn(),
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

  it('renders separate first/last name inputs for the parent/guardian contact once enabled', () => {
    renderModal();
    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));
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

    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));
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

describe('StudentModal - progressive emergency contact disclosure (item 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
  });

  it('starts unchecked and hides the contact fields for a blank create-mode student', () => {
    renderModal();
    const checkbox = screen.getByLabelText(/add an emergency contact/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(document.getElementsByName('guardian_firstname_input')).toHaveLength(0);
  });

  it('starts checked and shows the contact fields when editing a student with existing emergency-contact data', () => {
    renderModal(editableStudent({
      emergencyContactFirstName: 'Pat',
      emergencyContactLastName: 'Guardian',
      emergencyContactPhone: '5559998888',
    } as Partial<Student>));

    const checkbox = screen.getByLabelText(/add an emergency contact/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect((document.getElementsByName('guardian_firstname_input')[0] as HTMLInputElement).value).toBe('Pat');
  });

  it('hides the "+ Add secondary contact" button until the first contact has a name or phone', () => {
    renderModal();
    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));

    expect(screen.queryByRole('button', { name: /\+ add secondary contact/i })).not.toBeInTheDocument();

    fireEvent.change(document.getElementsByName('guardian_firstname_input')[0], { target: { value: 'Parent' } });

    expect(screen.getByRole('button', { name: /\+ add secondary contact/i })).toBeInTheDocument();
  });

  it('unchecking the emergency contact checkbox does not clear already-entered data', () => {
    renderModal();
    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));
    fireEvent.change(document.getElementsByName('guardian_firstname_input')[0], { target: { value: 'Parent' } });

    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));
    expect(document.getElementsByName('guardian_firstname_input')).toHaveLength(0);

    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));
    expect((document.getElementsByName('guardian_firstname_input')[0] as HTMLInputElement).value).toBe('Parent');
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

  it('shows the "recommended for minors" hint and blank guardian fields for a new minor student', () => {
    renderModal(); // create mode, student is null

    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });

    expect(screen.getByText(/recommended for minors/i)).toBeInTheDocument();
    // Fields-first (item 1 of the add-flow UX fix): the blank guardian
    // entry fields are the default landing spot, not a search box. "First"
    // also matches the student's own first-name field, so scope the query.
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    expect(newGuardianSection.querySelector('input[placeholder="First"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link existing guardian/i })).toBeInTheDocument();
  });

  it('does not show the "recommended for minors" hint for a new adult student, but the fields are still available', () => {
    renderModal();

    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '1990-01-01' } });

    expect(screen.queryByText(/recommended for minors/i)).not.toBeInTheDocument();
    // Adults may also link a guardian - it's optional either way, not gated by age.
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    expect(newGuardianSection.querySelector('input[placeholder="First"]')).toBeInTheDocument();
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

  it('"Link existing guardian" reveals the search box, shows candidates with disambiguating context, and a "create new" fallback', async () => {
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        guardianCandidate({ id: 'g1', firstName: 'Jane', lastName: 'Smith', linkedStudentNames: ['Alice Smith', 'Bob Smith'] }),
      ],
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });

    const candidateButton = await screen.findByText(/Jane Doe/);
    fireEvent.click(candidateButton);

    expect(screen.getByText('Change')).toBeInTheDocument();
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
  });

  it('"Create new guardian instead" (from the search picker) returns to the editable fields and is always present regardless of results', async () => {
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [guardianCandidate({ id: 'g1' })],
    });

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });
    await screen.findByText(/Jane Doe/);

    fireEvent.click(screen.getByRole('button', { name: /create new guardian instead/i }));

    expect(screen.getByText('New Guardian')).toBeInTheDocument();
  });
});

// Constraint A: creating a student with one or more guardians must go
// through the single atomic endpoint, never create() followed by separate
// link calls - not even for multiple staged guardians (item 4).
describe('StudentModal - atomic create with guardian (Constraint A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        guardianCandidate({ id: 'g1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }),
        guardianCandidate({ id: 'g2', firstName: 'John', lastName: 'Doe', email: 'john@example.com' }),
      ],
    });
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { student: { id: 'student-1', fullName: 'Minor Student' }, guardians: [{ guardian: { id: 'g1' }, link: { id: 'link-1' } }] },
    });
  });

  function fillBasicFields() {
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Minor' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });
  }

  async function stageExistingGuardian(name: RegExp, isFirst = false) {
    if (!isFirst) {
      // After the first stage, the picker collapses; reopening it via
      // "+ Add guardian" lands back on the fields-first default, so
      // "Link existing guardian" is needed again to reach the search box.
      fireEvent.click(screen.getByRole('button', { name: /^\+?\s*add guardian$/i }));
    }
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });
    const candidateButton = await screen.findByText(name);
    fireEvent.click(candidateButton);
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));
  }

  it('calls studentsApi.createWithGuardian (not create) when an existing guardian is staged, and never calls create()', async () => {
    renderModal();
    fillBasicFields();
    await stageExistingGuardian(/Jane Doe/, true);

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    expect(studentsApi.create).not.toHaveBeenCalled();

    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardians).toEqual([{ mode: 'existing', guardianId: 'g1', relationship: undefined, isPrimary: true }]);
  });

  it('calls studentsApi.createWithGuardian with mode=new when a new guardian is staged via the fields-first default, and never calls create()', async () => {
    renderModal();
    fillBasicFields();

    // Fields-first (item 1): no click needed to reach the new-guardian
    // fields - they're already open by default.
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const firstNameInput = newGuardianSection.querySelector('input[placeholder="First"]') as HTMLInputElement;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'New' } });
    fireEvent.change(lastNameInput, { target: { value: 'Guardian' } });
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    expect(studentsApi.create).not.toHaveBeenCalled();

    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardians).toHaveLength(1);
    expect(payload.guardians[0].mode).toBe('new');
    expect(payload.guardians[0].firstName).toBe('New');
    expect(payload.guardians[0].lastName).toBe('Guardian');
  });

  it('plain create() is still used when no guardian is staged (adults, or minors deferring guardian setup)', async () => {
    renderModal();
    fillBasicFields();

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.create).toHaveBeenCalledTimes(1));
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
  });

  it('staging two guardians and submitting sends both in ONE createWithGuardian call - never create() or a separate link call', async () => {
    renderModal();
    fillBasicFields();
    await stageExistingGuardian(/Jane Doe/, true);
    await stageExistingGuardian(/John Doe/);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    expect(studentsApi.create).not.toHaveBeenCalled();
    expect(guardiansApi.linkToStudent).not.toHaveBeenCalled();

    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardians).toHaveLength(2);
    expect(payload.guardians[0]).toMatchObject({ mode: 'existing', guardianId: 'g1', isPrimary: true });
    expect(payload.guardians[1]).toMatchObject({ mode: 'existing', guardianId: 'g2', isPrimary: false });
  });

  it('staging the same guardian twice is blocked locally, with no API call', async () => {
    renderModal();
    fillBasicFields();
    await stageExistingGuardian(/Jane Doe/, true);

    fireEvent.click(screen.getByRole('button', { name: /^\+?\s*add guardian$/i }));
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });
    const candidateButtons = await screen.findAllByText(/Jane Doe/);
    // The first match is the already-staged row; the candidate list result
    // is a later match.
    fireEvent.click(candidateButtons[candidateButtons.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    expect(await screen.findByText(/already staged/i)).toBeInTheDocument();
    expect(guardiansApi.findExactMatch).not.toHaveBeenCalled();
  });

  it('changing which staged guardian is primary before submit is reflected in the submitted payload', async () => {
    renderModal();
    fillBasicFields();
    await stageExistingGuardian(/Jane Doe/, true);
    await stageExistingGuardian(/John Doe/);

    // Jane (g1) is primary by default (staged first) - promote John (g2) instead.
    const stars = screen.getAllByTitle(/set as primary guardian/i);
    fireEvent.click(stars[0]);

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const primaryEntry = payload.guardians.find((g: { isPrimary: boolean }) => g.isPrimary);
    expect(primaryEntry.guardianId).toBe('g2');
  });

  it('"same as guardian" copies immediately with exactly one staged guardian, no radio list', async () => {
    renderModal();
    fillBasicFields();
    await stageExistingGuardian(/Jane Doe/, true);

    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));
    fireEvent.click(screen.getByLabelText(/same as guardian/i));

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect((document.getElementsByName('guardian_firstname_input')[0] as HTMLInputElement).value).toBe('Jane');
  });

  it('"same as guardian" shows a radio per staged guardian with 2+ staged, and copies the selected one', async () => {
    renderModal();
    fillBasicFields();
    await stageExistingGuardian(/Jane Doe/, true);
    await stageExistingGuardian(/John Doe/);

    fireEvent.click(screen.getByLabelText(/add an emergency contact/i));
    fireEvent.click(screen.getByLabelText(/^same as guardian$/i));

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);

    fireEvent.click(screen.getByLabelText(/John Doe/));

    expect((document.getElementsByName('guardian_firstname_input')[0] as HTMLInputElement).value).toBe('John');
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
      data: { student: { id: 'student-1', fullName: 'New Student' }, guardians: [{ guardian: { id: 'g-existing' }, link: { id: 'link-1' } }] },
    });
  });

  function fillBasicFieldsAndNewGuardian(email: string) {
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'New' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });

    // Fields-first (item 1): the new-guardian fields are already open.
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const emailInput = newGuardianSection.querySelector('input[placeholder="email@example.com"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: email } });
  }

  it('shows the confirm panel when staging a new guardian whose email exactly matches an existing one, and does not stage it yet', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'g-existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null }],
    });

    renderModal();
    fillBasicFieldsAndNewGuardian('jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(await screen.findByText(/parent of Alice Smith/i)).toBeInTheDocument();
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
  });

  it('"Link to this guardian" stages the existing match instead of creating a separate record', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'g-existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null }],
    });

    renderModal();
    fillBasicFieldsAndNewGuardian('jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));
    await screen.findByText(/already exists/i);

    fireEvent.click(screen.getByRole('button', { name: /link to this guardian/i }));

    // Staged, not yet submitted - confirm it shows in the sub-panel, then
    // submit the form to see what was actually sent.
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();

    fireEvent.submit(screen.getByTitle('Date of Birth').closest('form')!);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardians[0]).toMatchObject({ mode: 'existing', guardianId: 'g-existing' });
  });

  it('"Create separate record" stages the original new-guardian payload, bypassing the match', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'g-existing', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null }],
    });

    renderModal();
    fillBasicFieldsAndNewGuardian('jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));
    await screen.findByText(/already exists/i);

    fireEvent.click(screen.getByRole('button', { name: /create separate record/i }));

    fireEvent.submit(screen.getByTitle('Date of Birth').closest('form')!);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    const payload = (studentsApi.createWithGuardian as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.guardians[0]).toMatchObject({ mode: 'new', email: 'jane@example.com' });
  });

  it('never checks for duplicates on name alone - only when email or phone is present', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal();
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'New' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });

    // Fields-first (item 1): the new-guardian fields are already open.
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    fireEvent.change(lastNameInput, { target: { value: 'Doe' } }); // matches an existing guardian's surname, but no email/phone entered
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    await waitFor(() => expect(screen.getByText('Doe')).toBeInTheDocument());
    expect(guardiansApi.findExactMatch).not.toHaveBeenCalled();
  });
});

// Regression coverage: opening the edit modal for an existing student must
// populate the form from that student's data. (Root cause of a reported
// "blank fields" bug turned out to be seed data missing firstName/lastName,
// not this populate path - but the path itself had no direct test, so it's
// covered here going forward.)
describe('StudentModal edit form - populates from the existing student', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('renders the existing student\'s name, email, and date of birth in the form inputs', () => {
    renderModal(
      editableStudent({
        firstName: 'Marcus',
        lastName: 'Lee',
        email: 'marcus.lee@email.com',
        dateOfBirth: new Date('2005-09-17'),
      })
    );

    const firstNameInput = document.getElementsByName('student_firstname_input')[0] as HTMLInputElement;
    const lastNameInput = document.getElementsByName('student_lastname_input')[0] as HTMLInputElement;
    const emailInput = document.getElementsByName('student_email_input')[0] as HTMLInputElement;
    const dobInput = screen.getByTitle('Date of Birth') as HTMLInputElement;

    expect(firstNameInput.value).toBe('Marcus');
    expect(lastNameInput.value).toBe('Lee');
    expect(emailInput.value).toBe('marcus.lee@email.com');
    expect(dobInput.value).toBe('2005-09-17');
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

// Item 3: the guardian sub-panel is now available in edit mode, calling the
// API immediately for each action (unlike create mode's staged local state,
// item 4) - this is what lets existing/seeded students finally get
// guardians through the UI (the type-ahead used to be enabled: !isEditing).
describe('StudentModal - guardian sub-panel in edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.getStudentsForGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('renders one row per linked guardian when editing an existing student', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { id: 'guardian-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null, relationship: 'mother', isPrimary: true },
        { id: 'guardian-2', firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: null, relationship: 'father', isPrimary: false },
      ],
    });

    renderModal(editableStudent());

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('clicking unlink on a row calls guardiansApi.unlinkFromStudent with the student and guardian ids', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { id: 'guardian-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null, relationship: 'mother', isPrimary: false },
        { id: 'guardian-2', firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: null, relationship: 'father', isPrimary: true },
      ],
    });
    (guardiansApi.unlinkFromStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[0]);

    await waitFor(() => expect(guardiansApi.unlinkFromStudent).toHaveBeenCalledWith('student-1', 'guardian-1'));
  });

  it('clicking "Add guardian" opens the blank fields directly (fields-first), not a search box', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal(editableStudent());

    await waitFor(() => expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add guardian/i }));

    // "First" also matches the student's own first-name field, so scope to
    // the New Guardian fields section.
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    expect(newGuardianSection.querySelector('input[placeholder="First"]')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search by name, email, or phone/i)).not.toBeInTheDocument();
  });

  it('"Link existing guardian" switches to the type-ahead picker, and the candidates query is no longer disabled in edit mode', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal(editableStudent());

    await waitFor(() => expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add guardian/i }));
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });

    await waitFor(() => {
      expect(guardiansApi.findCandidates).toHaveBeenCalledWith({ lastName: 'Doe' });
    });
  });

  it('selecting a candidate and confirming calls guardiansApi.linkToStudent immediately (not createWithGuardian)', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [guardianCandidate({ id: 'guardian-9', firstName: 'Jane', lastName: 'Doe' })],
    });
    (guardiansApi.linkToStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'link-1' } });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add guardian/i }));
    fireEvent.click(screen.getByRole('button', { name: /link existing guardian/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by name, email, or phone/i), { target: { value: 'Doe' } });

    const candidateButton = await screen.findByText(/Jane Doe/);
    fireEvent.click(candidateButton);

    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    await waitFor(() => expect(guardiansApi.linkToStudent).toHaveBeenCalledWith('student-1', {
      guardianId: 'guardian-9',
      relationship: undefined,
    }));
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
  });

  it('changing the relationship select on a row calls guardiansApi.updateRelationship', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'guardian-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null, relationship: 'mother', isPrimary: true }],
    });
    (guardiansApi.updateRelationship as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    const select = screen.getByDisplayValue('Mother');
    fireEvent.change(select, { target: { value: 'grandparent' } });

    await waitFor(() =>
      expect(guardiansApi.updateRelationship).toHaveBeenCalledWith('student-1', 'guardian-1', 'grandparent')
    );
  });

  it('clicking the star on a non-primary row calls guardiansApi.setPrimary', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { id: 'guardian-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null, relationship: 'mother', isPrimary: true },
        { id: 'guardian-2', firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: null, relationship: 'father', isPrimary: false },
      ],
    });
    (guardiansApi.setPrimary as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Set as primary guardian'));

    await waitFor(() => expect(guardiansApi.setPrimary).toHaveBeenCalledWith('student-1', 'guardian-2'));
  });

  it('disables unlink for a minor with exactly one linked guardian', async () => {
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 10);

    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'guardian-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null, relationship: 'mother', isPrimary: true }],
    });

    renderModal(editableStudent({ id: 'student-1', dateOfBirth: minorDob }));

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeDisabled();
  });

  it('enables unlink for an adult with exactly one linked guardian', async () => {
    const adultDob = new Date();
    adultDob.setFullYear(adultDob.getFullYear() - 25);

    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'guardian-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: null, relationship: 'mother', isPrimary: true }],
    });

    renderModal(editableStudent({ id: 'student-1', dateOfBirth: adultDob }));

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Unlink' })).not.toBeDisabled();
  });

  // Item 2: inline match hint. Same candidate endpoint the type-ahead uses
  // (Constraint B), just triggered by typing into the fields instead of a
  // search box.
  it('typing a matching last name into the fields surfaces an inline match hint', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [guardianCandidate({ id: 'guardian-9', firstName: 'Ana', lastName: 'Rodriguez', linkedStudentNames: ['Diego Rodriguez'] })],
    });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add guardian/i }));

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    fireEvent.change(lastNameInput, { target: { value: 'Rodriguez' } });

    expect(await screen.findByText(/Ana Rodriguez/)).toBeInTheDocument();
    expect(screen.getByText(/parent of Diego Rodriguez/i)).toBeInTheDocument();
    expect(screen.getByText(/link instead\?/i)).toBeInTheDocument();
  });

  it('clicking the inline match hint links that guardian and collapses the form', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.findCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [guardianCandidate({ id: 'guardian-9', firstName: 'Ana', lastName: 'Rodriguez' })],
    });
    (guardiansApi.linkToStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'link-1' } });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add guardian/i }));

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    fireEvent.change(lastNameInput, { target: { value: 'Rodriguez' } });

    const hint = await screen.findByText(/link instead\?/i);
    fireEvent.click(hint);
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    await waitFor(() => expect(guardiansApi.linkToStudent).toHaveBeenCalledWith('student-1', {
      guardianId: 'guardian-9',
      relationship: undefined,
    }));
    // Collapses back to the row list, not left open on the fields.
    await waitFor(() => expect(screen.queryByText('New Guardian')).not.toBeInTheDocument());
  });

  // Item 3: ignoring the inline hint (or never triggering it - e.g. an
  // email/phone match with no visible hint interaction) and submitting
  // anyway still hits the save-time exact-match backstop, unchanged.
  it('ignoring the inline hint and submitting still triggers the exact-match duplicate confirm', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.getStudentsForGuardian as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 's1', fullName: 'Diego Rodriguez' }],
    });
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'guardian-9', firstName: 'Ana', lastName: 'Rodriguez', email: 'ana@example.com', phone: null }],
    });

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add guardian/i }));

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const emailInput = newGuardianSection.querySelector('input[placeholder="email@example.com"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'ana@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(guardiansApi.linkToStudent).not.toHaveBeenCalled();
  });
});
