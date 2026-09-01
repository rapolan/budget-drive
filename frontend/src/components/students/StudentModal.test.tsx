import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { StudentModal } from './StudentModal';
import { studentsApi, guardiansApi, lessonsApi, enrollmentsApi, feeFlagsApi } from '@/api';
import type { Student, GuardianCandidate, Lesson, Enrollment } from '@/types';

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
    lessonsApi: {
      getAll: vi.fn().mockResolvedValue({ data: [] }),
      getMostRecentByStudent: vi.fn().mockResolvedValue({ data: null }),
    },
    instructorsApi: { getAll: vi.fn().mockResolvedValue({ data: [] }) },
    enrollmentsApi: {
      getForStudent: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ data: {} }),
      update: vi.fn().mockResolvedValue({ data: {} }),
      complete: vi.fn().mockResolvedValue({ data: {} }),
      reopen: vi.fn().mockResolvedValue({ data: {} }),
    },
    feeFlagsApi: {
      getOutstandingForStudent: vi.fn().mockResolvedValue({ data: [] }),
      waive: vi.fn(),
      recordPayment: vi.fn(),
      markStudentFeesPaid: vi.fn().mockResolvedValue({ data: [] }),
    },
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

function renderModal(
  student: Student | null = null,
  extraProps: Partial<ComponentProps<typeof StudentModal>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentModal student={student} onClose={() => {}} {...extraProps} />
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

// The success state after creating a student offers an optional "Book
// Lesson" action wired to the onBookLesson prop, preselecting the
// just-created student for the parent page's booking flow (Students.tsx
// wires this to SmartBookingForm). Creating a student without booking must
// stay a one-click path - the action is additive, never required, and
// "Close" alone is enough to finish.
describe('StudentModal - create success offers an optional "Book Lesson" action', () => {
  const createdStudent = {
    id: 'student-new-1',
    tenantId: 'tenant-1',
    fullName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    phone: '5550100',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    totalHoursCompleted: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  } as Student;

  beforeEach(() => {
    vi.clearAllMocks();
    (studentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: createdStudent });
  });

  function fillAndSubmitAdult() {
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_email_input')[0], {
      target: { value: 'jane.doe@example.com' },
    });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '1990-01-01' } });

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);
  }

  it('shows "Book Lesson" after a successful create when onBookLesson is provided, and clicking it calls onBookLesson with the created student and closes the modal', async () => {
    const onBookLesson = vi.fn();
    const onClose = vi.fn();
    renderModal(null, { onBookLesson, onClose });

    fillAndSubmitAdult();

    await waitFor(() => expect(screen.getByText(/student added!/i)).toBeInTheDocument());
    expect(screen.getByText(/Jane Doe is ready for their first lesson/i)).toBeInTheDocument();

    const bookButton = screen.getByRole('button', { name: /book lesson/i });
    fireEvent.click(bookButton);

    expect(onBookLesson).toHaveBeenCalledWith(createdStudent, null);
    expect(onClose).toHaveBeenCalled();
  });

  it('creating a student stays a one-click path - "Close" dismisses without booking, even when onBookLesson is provided', async () => {
    const onBookLesson = vi.fn();
    const onClose = vi.fn();
    renderModal(null, { onBookLesson, onClose });

    fillAndSubmitAdult();

    await waitFor(() => expect(screen.getByText(/student added!/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(onClose).toHaveBeenCalled();
    expect(onBookLesson).not.toHaveBeenCalled();
  });

  it('does not show "Book Lesson" when onBookLesson is not provided - booking remains optional, not required', async () => {
    renderModal(null, {});

    fillAndSubmitAdult();

    await waitFor(() => expect(screen.getByText(/student added!/i)).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /book lesson/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
  });
});

// Create-mode auto-scroll: as each section is completed, the next one
// scrolls into view instead of requiring the user to scroll manually.
// scrollIntoView/matchMedia are polyfilled globally in src/test/setup.ts
// (jsdom implements neither) - here they're spied on to assert calls.
describe('StudentModal - create-mode auto-scroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  });

  it('scrolls the Address section into view once Basic Info is complete', () => {
    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    // A real 10-digit number, not the file's usual '5550100' placeholder -
    // Basic Info's completion check uses hasAtLeastOnePhone (>=10 digits),
    // the same stricter validity check the submit button itself gates on.
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5551234567' } });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth', block: 'start' })
    );
  });

  it('scrolls the Guardian section into view once Address is complete', () => {
    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5551234567' } });
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.change(document.getElementsByName('student_street_input')[0], { target: { value: '123 Main St' } });
    fireEvent.change(document.getElementsByName('student_city_input')[0], { target: { value: 'San Diego' } });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    fireEvent.change(document.getElementsByName('student_zip_input')[0], { target: { value: '92101' } });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not re-trigger a scroll when a field is edited again after its section was already complete', () => {
    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5551234567' } });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);

    // Editing the now-complete section again must never re-fire the jump -
    // this is what keeps the feature from fighting the user's own scrolling.
    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Janet' } });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('uses an instant jump instead of a smooth scroll when prefers-reduced-motion is set', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList));

    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5551234567' } });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto', block: 'start' })
    );
  });

  it('never auto-scrolls in edit mode', () => {
    const student = editableStudent();
    renderModal(student);

    const firstNameInputs = document.getElementsByName('student_firstname_input');
    if (firstNameInputs.length > 0) {
      fireEvent.change(firstNameInputs[0], { target: { value: 'Updated' } });
    }
    const phoneInputs = document.getElementsByName('student_phone_input');
    if (phoneInputs.length > 0) {
      fireEvent.change(phoneInputs[0], { target: { value: '5559999' } });
    }

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls to the bottom (success block) once the student is created', async () => {
    const created = {
      id: 'student-new-2',
      tenantId: 'tenant-1',
      fullName: 'Jane Doe',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '5550100',
      status: 'active',
      enrollmentDate: new Date('2026-01-01'),
      totalHoursCompleted: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as Student;
    (studentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: created });

    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Jane' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Doe' } });
    fireEvent.change(document.getElementsByName('student_email_input')[0], { target: { value: 'jane.doe@example.com' } });
    fireEvent.change(document.getElementsByName('student_phone_input')[0], { target: { value: '5550100' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '1990-01-01' } });
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByText(/student added!/i)).toBeInTheDocument());

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'end' })
    );
  });
});

// "Book Lesson" on an existing student's record is the single booking
// entry point - there is no separate "Book Again" button. When a most
// recent lesson exists, clicking it passes that lesson along so the
// caller (Students.tsx) can prefill the wizard; with no history it's
// still shown, just passing null.
describe('StudentModal - "Book Lesson" entry point (edit mode)', () => {
  function mostRecentLesson(overrides: Partial<Lesson> = {}): Lesson {
    return {
      id: 'lesson-1',
      tenantId: 'tenant-1',
      studentId: 'student-1',
      instructorId: 'instructor-1',
      vehicleId: 'vehicle-1',
      date: '2026-08-01',
      startTime: '14:00:00',
      endTime: '16:00:00',
      duration: 120,
      lessonType: 'behind_wheel',
      pickupAddress: '123 Main St, 90008',
      cost: 75,
      status: 'completed',
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
      ...overrides,
    } as Lesson;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (lessonsApi.getMostRecentByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
  });

  it('when the student has a most recent lesson, clicking "Book Lesson" calls onBookLesson with the student and that lesson, then closes', async () => {
    const lesson = mostRecentLesson();
    (lessonsApi.getMostRecentByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: lesson });
    const onBookLesson = vi.fn();
    const onClose = vi.fn();
    const student = editableStudent();

    renderModal(student, { onBookLesson, onClose });

    await waitFor(() => expect(lessonsApi.getMostRecentByStudent).toHaveBeenCalled());
    const bookButton = await screen.findByRole('button', { name: /book lesson/i });
    fireEvent.click(bookButton);

    expect(onBookLesson).toHaveBeenCalledWith(student, lesson);
    expect(onClose).toHaveBeenCalled();
  });

  it('when the student has no lesson history, "Book Lesson" is still shown and calls onBookLesson with null instead of a lesson', async () => {
    (lessonsApi.getMostRecentByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
    const onBookLesson = vi.fn();
    const student = editableStudent();

    renderModal(student, { onBookLesson });

    await waitFor(() => expect(lessonsApi.getMostRecentByStudent).toHaveBeenCalled());
    const bookButton = await screen.findByRole('button', { name: /book lesson/i });
    fireEvent.click(bookButton);

    expect(onBookLesson).toHaveBeenCalledWith(student, null);
  });

  it('does not show "Book Lesson" when onBookLesson is not provided, even with lesson history', async () => {
    (lessonsApi.getMostRecentByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mostRecentLesson() });

    renderModal(editableStudent(), {});

    await waitFor(() => expect(lessonsApi.getMostRecentByStudent).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /book lesson/i })).not.toBeInTheDocument();
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

  it('shows the required-guardian asterisk and blank guardian fields for a new minor student', () => {
    renderModal(); // create mode, student is null

    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });

    expect(screen.getByTitle('Required for minors before their program can be marked complete')).toBeInTheDocument();
    // Fields-first (item 1 of the add-flow UX fix): the blank guardian
    // entry fields are the default landing spot, not a search box. "First"
    // also matches the student's own first-name field, so scope the query.
    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    expect(newGuardianSection.querySelector('input[placeholder="First"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link existing guardian/i })).toBeInTheDocument();
  });

  it('does not show the required-guardian asterisk for a new adult student, but the fields are still available', () => {
    renderModal();

    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '1990-01-01' } });

    expect(screen.queryByTitle('Required for minors before their program can be marked complete')).not.toBeInTheDocument();
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

  // Regression coverage: hasAtLeastOnePhone only checked the student's own
  // phone/emergencyContactPhone, so a minor whose real contact is a staged
  // guardian's phone couldn't enable Create at all, even though the backend
  // (createStudentWithGuardian) accepts exactly this case.
  it('enables Create and submits for a minor with no phone of their own when a staged guardian has a phone', async () => {
    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Minor' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });
    // Deliberately no student_phone_input and no student_email_input.

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const firstNameInput = newGuardianSection.querySelector('input[placeholder="First"]') as HTMLInputElement;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    const phoneInput = newGuardianSection.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'Guardian' } });
    fireEvent.change(lastNameInput, { target: { value: 'Contact' } });
    fireEvent.change(phoneInput, { target: { value: '5551234567' } });

    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    await waitFor(() => expect(guardiansApi.findExactMatch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/no guardians linked yet/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/phone required/i)).not.toBeInTheDocument();

    const createButton = screen.getByRole('button', { name: /create student/i });
    expect(createButton).not.toBeDisabled();

    fireEvent.click(createButton);

    await waitFor(() => expect(studentsApi.createWithGuardian).toHaveBeenCalledTimes(1));
    expect(studentsApi.create).not.toHaveBeenCalled();
  });

  it('keeps Create disabled for a minor with no phone/email of their own and no guardian staged', () => {
    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Minor' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '2015-01-01' } });
    // No phone, no email, and the new-guardian fields are left blank -
    // never staged via "Add Guardian".

    const createButton = screen.getByRole('button', { name: /create student/i });
    expect(createButton).toBeDisabled();
  });

  it('keeps Create disabled for an adult with no phone of their own, even if a guardian is staged', async () => {
    renderModal();

    fireEvent.change(document.getElementsByName('student_firstname_input')[0], { target: { value: 'Adult' } });
    fireEvent.change(document.getElementsByName('student_lastname_input')[0], { target: { value: 'Student' } });
    fireEvent.change(document.getElementsByName('student_email_input')[0], { target: { value: 'adult@example.com' } });
    fireEvent.change(screen.getByTitle('Date of Birth'), { target: { value: '1990-01-01' } });

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const firstNameInput = newGuardianSection.querySelector('input[placeholder="First"]') as HTMLInputElement;
    const lastNameInput = newGuardianSection.querySelector('input[placeholder="Last"]') as HTMLInputElement;
    const phoneInput = newGuardianSection.querySelector('input[type="tel"]') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'Guardian' } });
    fireEvent.change(lastNameInput, { target: { value: 'Contact' } });
    fireEvent.change(phoneInput, { target: { value: '5551234567' } });
    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    const form = screen.getByTitle('Date of Birth').closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText(/phone required/i)).toBeInTheDocument();
    expect(studentsApi.createWithGuardian).not.toHaveBeenCalled();
    expect(studentsApi.create).not.toHaveBeenCalled();
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

  // Regression coverage: submitGuardianForEdit and stageGuardian each called
  // guardiansApi.findExactMatch with a bare, unguarded await. If that call
  // rejected (429 from the rate limiter, a network error, a 500), the
  // "Add Guardian" click silently did nothing - no error, no staged row,
  // no loading state (the button's label/disabled state only reacts to
  // linkGuardianMutation, a mutation this code path never reaches). This
  // exercises the real click path (fields-first form + "Add Guardian"
  // button), not a shortcut, and a mocked rejection rather than a resolved
  // empty result - the gap the previous tests didn't cover.
  it('shows a visible error and keeps the fields populated when findExactMatch rejects while staging a new guardian', async () => {
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Too many requests'), { response: { data: { error: 'Too many requests. Please try again later.' } } })
    );

    renderModal();
    fillBasicFields();

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const firstNameInput = newGuardianSection.querySelector('input[placeholder="First"]') as HTMLInputElement;
    const emailInput = newGuardianSection.querySelector('input[placeholder="email@example.com"]') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'Some' } });
    fireEvent.change(emailInput, { target: { value: 'some.person@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    expect(await screen.findByText(/too many requests/i)).toBeInTheDocument();
    // Nothing was staged, and the fields the user typed are still there -
    // the failure is visible, not a silent data loss.
    expect(screen.queryByText('Some Person')).not.toBeInTheDocument();
    expect(firstNameInput.value).toBe('Some');
    expect(emailInput.value).toBe('some.person@example.com');
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

  // Regression coverage (edit-mode counterpart to the create-mode test in
  // "atomic create with guardian"): submitGuardianForEdit had the same
  // unguarded findExactMatch await - a rejection (429, network error, 500)
  // made "Add Guardian" silently do nothing in edit mode too, since
  // linkToStudent (and the mutation driving the button's label/disabled
  // state) was never reached.
  it('shows a visible error and keeps the fields populated when findExactMatch rejects while adding a guardian in edit mode', async () => {
    (guardiansApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (guardiansApi.findExactMatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Too many requests'), { response: { data: { error: 'Too many requests. Please try again later.' } } })
    );

    renderModal(editableStudent({ id: 'student-1' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /add guardian/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add guardian/i }));

    const newGuardianSection = screen.getByText('New Guardian').closest('div')!.parentElement!;
    const firstNameInput = newGuardianSection.querySelector('input[placeholder="First"]') as HTMLInputElement;
    const emailInput = newGuardianSection.querySelector('input[placeholder="email@example.com"]') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'Some' } });
    fireEvent.change(emailInput, { target: { value: 'some.person@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /^add guardian$/i }));

    expect(await screen.findByText(/too many requests/i)).toBeInTheDocument();
    expect(firstNameInput.value).toBe('Some');
    expect(emailInput.value).toBe('some.person@example.com');
    expect(guardiansApi.linkToStudent).not.toHaveBeenCalled();
    expect(guardiansApi.create).not.toHaveBeenCalled();
  });
});

// Regression coverage: the turning-18 admin actions (keep on hours track /
// switch to lessons track / mark complete) call studentsApi.update /
// studentsApi.complete, both of which target the now-deleted
// /students/:id trackOverride field and the removed /students/:id/complete
// route. These moved to enrollmentsApi.update/complete against the
// student's active driver_training enrollment (Constraint A/D) - this
// suite pins that the modal calls the enrollment endpoints with the
// enrollment's id, not the student's id.
describe('StudentModal turning-18 admin actions - target the enrollment, not the student', () => {
  function enrollmentFixture(overrides: Partial<Enrollment> = {}): Enrollment {
    return {
      id: 'enrollment-1',
      tenantId: 'tenant-1',
      studentId: 'student-1',
      programType: 'driver_training',
      status: 'active',
      enrollmentDate: new Date('2026-01-01'),
      hoursRequired: 6,
      trackOverride: null,
      assignedInstructorId: null,
      licenseType: 'car',
      totalCost: null,
      completed: false,
      completedAt: null,
      completedBy: null,
      completionReason: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenedReason: null,
      withdrawnAt: null,
      withdrawnBy: null,
      withdrawnReason: null,
      externalDeCompleted: false,
      externalDeCompletedDate: null,
      externalDeProvider: null,
      manualCompletedHours: null,
      deDeliveryMode: null,
      completionHash: null,
      ledgerTxid: null,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  function turningEighteenStudent(overrides: Partial<Student> = {}): Student {
    const adultBirthYear = new Date().getFullYear() - 19;
    return editableStudent({
      dateOfBirth: new Date(`${adultBirthYear}-01-01`),
      activeEnrollment: {
        id: 'enrollment-1',
        programType: 'driver_training',
        status: 'active',
        enrollmentDate: new Date('2026-01-01'),
        completed: false,
        completionReason: null,
        withdrawnReason: null,
      },
      progress: {
        track: 'hours',
        hoursCompleted: 1,
        hoursRequired: 6,
        hoursScheduled: 0,
        needsDateOfBirth: false,
        displayLabel: '1 / 6 hrs',
        percentComplete: 17,
      },
      ...overrides,
    });
  }

  beforeEach(() => {
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [enrollmentFixture()],
    });
  });

  it('trackOverrideMutation calls enrollmentsApi.update with the enrollment id, not studentsApi.update', async () => {
    renderModal(turningEighteenStudent());

    fireEvent.click(screen.getByRole('button', { name: /^progress$/i }));

    const keepOnHoursButton = await screen.findByRole('button', { name: /keep on hours track/i });
    fireEvent.click(keepOnHoursButton);

    await waitFor(() =>
      expect(enrollmentsApi.update).toHaveBeenCalledWith('enrollment-1', { trackOverride: 'hours' })
    );
  });

  it('completeMutation calls enrollmentsApi.complete with the enrollment id, not studentsApi.complete', async () => {
    renderModal(turningEighteenStudent());

    fireEvent.click(screen.getByRole('button', { name: /^progress$/i }));

    const markCompleteButton = await screen.findByRole('button', { name: /mark program complete/i });
    fireEvent.click(markCompleteButton);

    fireEvent.click(screen.getByRole('button', { name: /confirm complete/i }));

    await waitFor(() =>
      expect(enrollmentsApi.complete).toHaveBeenCalledWith('enrollment-1')
    );
  });

  it('item 1: the complete path shows only a confirm dialog, with no reason field at all', async () => {
    renderModal(turningEighteenStudent());

    fireEvent.click(screen.getByRole('button', { name: /^progress$/i }));

    const markCompleteButton = await screen.findByRole('button', { name: /mark program complete/i });
    fireEvent.click(markCompleteButton);

    expect(screen.queryByPlaceholderText(/completion reason/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reason \(optional\)/i)).not.toBeInTheDocument();

    const confirmButton = await screen.findByRole('button', { name: /confirm complete/i });
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(enrollmentsApi.complete).toHaveBeenCalledWith('enrollment-1')
    );
  });

  // Item 3: external driver_education prerequisite - display + edit on the
  // driver_training enrollment, display-only (no booking gate).
  it('displays "Not recorded" by default, and saves externalDeCompleted/date/provider via enrollmentsApi.update on the enrollment id', async () => {
    renderModal(turningEighteenStudent());

    fireEvent.click(screen.getByRole('button', { name: /^progress$/i }));

    expect(await screen.findByText(/not recorded as completed elsewhere/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByLabelText(/completed driver education elsewhere/i));
    fireEvent.change(screen.getByLabelText(/completion date/i), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'Acme Driving School' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(enrollmentsApi.update).toHaveBeenCalledWith('enrollment-1', {
        externalDeCompleted: true,
        externalDeCompletedDate: '2026-03-01',
        externalDeProvider: 'Acme Driving School',
      })
    );
  });

  it('displays the completed date and provider once recorded', async () => {
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        enrollmentFixture({
          externalDeCompleted: true,
          externalDeCompletedDate: new Date('2026-02-15'),
          externalDeProvider: 'Acme Driving School',
        }),
      ],
    });

    renderModal(turningEighteenStudent());
    fireEvent.click(screen.getByRole('button', { name: /^progress$/i }));

    expect(await screen.findByText(/acme driving school/i)).toBeInTheDocument();
  });
});

// Item 4: the Enrollments tab - lists a person's enrollments, and gates
// "add" independently per program type (driver_education when none exists,
// driver_training only when there's no ACTIVE one - the returning-student
// case the partial unique index exists to support).
describe('StudentModal - Enrollments tab (Item 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
    return {
      id: 'enrollment-1',
      tenantId: 'tenant-1',
      studentId: 'student-1',
      programType: 'driver_training',
      status: 'active',
      enrollmentDate: new Date('2026-01-01'),
      hoursRequired: 6,
      trackOverride: null,
      assignedInstructorId: null,
      licenseType: 'car',
      totalCost: null,
      completed: false,
      completedAt: null,
      completedBy: null,
      completionReason: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenedReason: null,
      withdrawnAt: null,
      withdrawnBy: null,
      withdrawnReason: null,
      externalDeCompleted: false,
      externalDeCompletedDate: null,
      externalDeProvider: null,
      manualCompletedHours: null,
      deDeliveryMode: null,
      completionHash: null,
      ledgerTxid: null,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }

  it('offers only "add driver education" when an active driver_training enrollment already exists', async () => {
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [enrollment()],
    });

    renderModal(editableStudent({ id: 'student-1' }));
    fireEvent.click(screen.getByRole('button', { name: /^enrollments$/i }));

    // Wait for the real enrollment row (not just the always-visible "add"
    // buttons, which render identically before data loads too - both
    // canAdd* flags default true against an empty enrollments array).
    await screen.findByText(/^driver training$/i);

    expect(screen.getByRole('button', { name: /add driver education enrollment/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add driver training enrollment/i })).not.toBeInTheDocument();
  });

  it('offers "add driver training" (the returning-student case) once the only driver_training enrollment has completed', async () => {
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [enrollment({ status: 'completed', completed: true, completionReason: 'Passed road test' })],
    });

    renderModal(editableStudent({ id: 'student-1' }));
    fireEvent.click(screen.getByRole('button', { name: /^enrollments$/i }));

    await screen.findByText(/^driver training$/i);
    expect(screen.getByRole('button', { name: /add driver training enrollment/i })).toBeInTheDocument();
  });

  it('creates a driver_education enrollment via enrollmentsApi.create with the manually entered hours, only after the explicit confirm click', async () => {
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [enrollment()],
    });

    renderModal(editableStudent({ id: 'student-1' }));
    fireEvent.click(screen.getByRole('button', { name: /^enrollments$/i }));

    await screen.findByText(/^driver training$/i);
    const addButton = screen.getByRole('button', { name: /add driver education enrollment/i });
    fireEvent.click(addButton);

    // Nothing committed yet - only the form appeared.
    expect(enrollmentsApi.create).not.toHaveBeenCalled();

    const hoursInput = screen.getByLabelText(/hours completed/i);
    fireEvent.change(hoursInput, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /^add enrollment$/i }));

    await waitFor(() =>
      expect(enrollmentsApi.create).toHaveBeenCalledWith('student-1', {
        programType: 'driver_education',
        manualCompletedHours: 30,
      })
    );
  });

  it('reopen requires a non-empty reason and calls enrollmentsApi.reopen with the enrollment id and reason', async () => {
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [enrollment({ status: 'completed', completed: true })],
    });

    renderModal(editableStudent({ id: 'student-1' }));
    fireEvent.click(screen.getByRole('button', { name: /^enrollments$/i }));

    const reopenButton = await screen.findByRole('button', { name: /reopen/i });
    fireEvent.click(reopenButton);

    const confirmButton = await screen.findByRole('button', { name: /confirm reopen/i });
    expect(confirmButton).toBeDisabled();

    const reasonInput = screen.getByPlaceholderText(/marked complete by mistake/i);
    fireEvent.change(reasonInput, { target: { value: 'Booked by mistake' } });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(enrollmentsApi.reopen).toHaveBeenCalledWith('enrollment-1', 'Booked by mistake')
    );
  });

  it('shows the certificate notice after a reopen response confirms one exists, and it can be dismissed', async () => {
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [enrollment({ status: 'completed', completed: true })],
    });
    (enrollmentsApi.reopen as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...enrollment({ status: 'active', completed: false }), certificateExists: true },
    });

    renderModal(editableStudent({ id: 'student-1' }));
    fireEvent.click(screen.getByRole('button', { name: /^enrollments$/i }));

    fireEvent.click(await screen.findByRole('button', { name: /reopen/i }));
    fireEvent.change(screen.getByPlaceholderText(/marked complete by mistake/i), { target: { value: 'Wrong student' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reopen/i }));

    const notice = await screen.findByText(/reopening did not void, unlink/i);
    expect(notice).toBeInTheDocument();

    const dismissButtons = screen.getAllByRole('button');
    const closeButton = dismissButtons.find(b => b.querySelector('.lucide-x') && b.closest('.bg-status-warning-bg'));
    fireEvent.click(closeButton!);
    expect(screen.queryByText(/reopening did not void, unlink/i)).not.toBeInTheDocument();
  });
});

// Item 2: a persistent actions bar (Mark Complete when eligible, fee
// Paid/Waive when outstanding), visible regardless of which tab is
// active - not buried inside one tab. "Edit" isn't included (the whole
// modal already is the edit surface) and "Book Lesson" stays where it
// already was (the header, already always visible) rather than being
// duplicated. Eligibility/endpoints are the same ones the Students list
// uses (isReadyToMarkComplete, feeFlagsApi.markStudentFeesPaid) - one
// source of truth, per item 2's explicit requirement.
describe('StudentModal - persistent actions bar (Item 2)', () => {
  function readyToCompleteStudent(overrides: Partial<Student> = {}): Student {
    return editableStudent({
      activeEnrollment: {
        id: 'enrollment-1',
        programType: 'driver_training',
        status: 'active',
        enrollmentDate: new Date('2026-01-01'),
        completed: false,
        completionReason: null,
        withdrawnReason: null,
      },
      progress: {
        track: 'hours',
        hoursCompleted: 6,
        hoursRequired: 6,
        hoursScheduled: 0,
        needsDateOfBirth: false,
        displayLabel: '6 / 6 hrs',
        percentComplete: 100,
      },
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (feeFlagsApi.getOutstandingForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  });

  it('shows a "Mark Complete" button on the Details tab (no tab-switching needed) when the student is eligible', async () => {
    renderModal(readyToCompleteStudent());

    expect(await screen.findByRole('button', { name: /mark complete/i })).toBeInTheDocument();
  });

  it('does not show "Mark Complete" when the student is not eligible', async () => {
    renderModal(editableStudent({
      activeEnrollment: {
        id: 'enrollment-1',
        programType: 'driver_training',
        status: 'active',
        enrollmentDate: new Date('2026-01-01'),
        completed: false,
        completionReason: null,
        withdrawnReason: null,
      },
      progress: {
        track: 'hours',
        hoursCompleted: 2,
        hoursRequired: 6,
        hoursScheduled: 0,
        needsDateOfBirth: false,
        displayLabel: '2 / 6 hrs',
        percentComplete: 33,
      },
    }));

    await screen.findByText('Existing Student');
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument();
  });

  it('clicking "Mark Complete" switches to the Enrollments tab and opens that tab\'s existing confirm flow (no duplicate flow, no reason field)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (enrollmentsApi.getForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{
        id: 'enrollment-1',
        tenantId: 'tenant-1',
        studentId: 'student-1',
        programType: 'driver_training',
        status: 'active',
        enrollmentDate: new Date('2026-01-01'),
        hoursRequired: 6,
        completed: false,
        completedAt: null,
        completionReason: null,
        withdrawnAt: null,
        withdrawnReason: null,
      }],
    });

    renderModal(readyToCompleteStudent());
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /mark complete/i }));

    // Landed on the Enrollments tab, and its own confirm dialog (the one
    // existing implementation of this flow) is now open - item 1: no
    // reason field at all, just a confirm.
    expect(await screen.findByText(/mark .* complete\?/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Completion reason')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /confirm complete/i })).not.toBeDisabled();
  });

  it('shows an outstanding-fee summary with Mark Paid and Waive when the student has an outstanding fee', async () => {
    (feeFlagsApi.getOutstandingForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'flag-1', tenantId: 'tenant-1', studentId: 'student-1', lessonId: 'lesson-1', amount: 50, reason: 'No-show', status: 'outstanding', waivedBy: null, waivedReason: null, waivedAt: null, paidPaymentId: null, paidAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    });

    renderModal(editableStudent());

    expect(await screen.findByText(/1 outstanding fee/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark paid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^waive$/i })).toBeInTheDocument();
  });

  it('does not show the fee summary when there are no outstanding fees', async () => {
    renderModal(editableStudent());

    await screen.findByText('Existing Student');
    expect(screen.queryByText(/outstanding fee/i)).not.toBeInTheDocument();
  });

  it('"Mark Paid" confirms, then calls feeFlagsApi.markStudentFeesPaid with the student id', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (feeFlagsApi.getOutstandingForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'flag-1', tenantId: 'tenant-1', studentId: 'student-1', lessonId: 'lesson-1', amount: 50, reason: 'No-show', status: 'outstanding', waivedBy: null, waivedReason: null, waivedAt: null, paidPaymentId: null, paidAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    });

    renderModal(editableStudent());
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /mark paid/i }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(feeFlagsApi.markStudentFeesPaid).toHaveBeenCalledWith('student-1'));

    confirmSpy.mockRestore();
  });

  it('"Waive" switches to the Progress tab, where the existing waive-with-reason form lives (no duplicate flow)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (feeFlagsApi.getOutstandingForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'flag-1', tenantId: 'tenant-1', studentId: 'student-1', lessonId: 'lesson-1', amount: 50, reason: 'No-show', status: 'outstanding', waivedBy: null, waivedReason: null, waivedAt: null, paidPaymentId: null, paidAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    });

    renderModal(editableStudent());
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^waive$/i }));

    // The Progress tab's own per-flag Waive button (distinct from the
    // persistent bar's summary-level one clicked above) is now visible.
    expect(await screen.findByText(/\$50\.00 - No-show/i)).toBeInTheDocument();
  });

  it('opening the modal with initialTab="progress" (the list\'s Waive shortcut) lands directly on the Progress tab', async () => {
    (feeFlagsApi.getOutstandingForStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'flag-1', tenantId: 'tenant-1', studentId: 'student-1', lessonId: 'lesson-1', amount: 50, reason: 'No-show', status: 'outstanding', waivedBy: null, waivedReason: null, waivedAt: null, paidPaymentId: null, paidAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    });

    renderModal(editableStudent(), { initialTab: 'progress' });

    expect(await screen.findByText(/\$50\.00 - No-show/i)).toBeInTheDocument();
  });
});
