import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CertificatesPage } from './Certificates';
import { certificatesApi } from '@/api';
import type { AwaitingCertificateEntry, CertificateLogEntry } from '@/api/certificates';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    certificatesApi: {
      ...actual.certificatesApi,
      getWorklist: vi.fn(),
      getCounts: vi.fn(),
      getLog: vi.fn(),
      getDetail: vi.fn(),
      record: vi.fn(),
      recordVoid: vi.fn(),
    },
  };
});

function worklistEntry(overrides: Partial<AwaitingCertificateEntry> = {}): AwaitingCertificateEntry {
  return {
    enrollmentId: 'enrollment-1',
    studentId: 'student-1',
    studentName: 'Test Student',
    completedAt: '2026-08-01T00:00:00.000Z',
    suggestedInstructorId: 'instructor-1',
    suggestedInstructorName: 'Devon Ashby',
    ...overrides,
  };
}

function logEntry(overrides: Partial<CertificateLogEntry> = {}): CertificateLogEntry {
  return {
    id: 'cert-1',
    serialNumber: 'CS0000001',
    status: 'issued',
    issueDate: '2026-08-01T00:00:00.000Z',
    voidReason: null,
    studentId: 'student-1',
    studentName: 'Test Student',
    instructorId: 'instructor-1',
    instructorName: 'Devon Ashby',
    ...overrides,
  };
}

function renderCertificatesPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CertificatesPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (certificatesApi.getCounts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { issued: 0, void: 0 } });
});

afterEach(() => {
  cleanup();
});

// Item 1: worklist instructor filter - NOT a date filter. Default "All",
// dropdown lists only instructors with an actual awaiting student.
describe('Certificates - worklist instructor filter', () => {
  it('defaults to All and shows every awaiting student across instructors', async () => {
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        worklistEntry({ enrollmentId: 'e1', studentName: 'Leo Whitfield', suggestedInstructorId: 'i1', suggestedInstructorName: 'Devon Ashby' }),
        worklistEntry({ enrollmentId: 'e2', studentName: 'Mia Torres', suggestedInstructorId: 'i2', suggestedInstructorName: 'Marcus Webb' }),
      ],
    });

    renderCertificatesPage();

    await waitFor(() => expect(screen.getByText('Leo Whitfield')).toBeInTheDocument());
    expect(screen.getByText('Mia Torres')).toBeInTheDocument();
    expect(screen.queryByText(/showing:/i)).not.toBeInTheDocument();
  });

  it('narrows to one instructor\'s awaiting students when selected, and shows an active-filter indicator', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        worklistEntry({ enrollmentId: 'e1', studentName: 'Leo Whitfield', suggestedInstructorId: 'i1', suggestedInstructorName: 'Devon Ashby' }),
        worklistEntry({ enrollmentId: 'e2', studentName: 'Mia Torres', suggestedInstructorId: 'i2', suggestedInstructorName: 'Marcus Webb' }),
      ],
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Leo Whitfield')).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText(/instructor/i, { selector: '#worklist-instructor-filter' }), 'i2');

    expect(screen.queryByText('Leo Whitfield')).not.toBeInTheDocument();
    expect(screen.getByText('Mia Torres')).toBeInTheDocument();
    expect(screen.getByText(/showing: marcus webb/i)).toBeInTheDocument();
  });

  it('does not list an instructor with nothing awaiting', async () => {
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [worklistEntry({ suggestedInstructorId: 'i1', suggestedInstructorName: 'Devon Ashby' })],
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Test Student')).toBeInTheDocument());

    const select = document.getElementById('worklist-instructor-filter') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['All', 'Devon Ashby']);
  });
});

// Item 4 (verification, not a new feature): the record form's issue date
// must default to the enrollment's completion date, not the button-press
// date - see WorklistRow's issueDate initial state.
describe('Certificates - worklist record form issue date default', () => {
  it('defaults the issue date input to entry.completedAt, not today', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [worklistEntry({ studentName: 'Leo Whitfield', completedAt: '2026-07-15T00:00:00.000Z' })],
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Leo Whitfield')).toBeInTheDocument());

    await userEvent.click(screen.getAllByRole('button', { name: /record certificate/i })[0]);

    const issueDateInput = screen.getByLabelText(/issue date/i) as HTMLInputElement;
    expect(issueDateInput.value).toBe('2026-07-15');
  });
});

// Item 2: issued log instructor filter, and void behavior under it - a void
// has no instructor by construction, so it must appear under All and
// disappear once a specific instructor is selected.
describe('Certificates - issued log instructor filter', () => {
  it('shows a void record under All but hides it once an instructor is selected', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (certificatesApi.getLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        logEntry({ id: 'c1', studentName: 'Leo Whitfield', instructorId: 'i1', instructorName: 'Devon Ashby' }),
        logEntry({ id: 'c2', status: 'void', studentId: null, studentName: null, instructorId: null, instructorName: null, voidReason: 'Damaged' }),
      ],
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Leo Whitfield')).toBeInTheDocument());
    const table = screen.getByRole('table');
    expect(within(table).getByText('Void')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/instructor/i, { selector: '#log-instructor-filter' }), 'i1');

    expect(screen.getByText('Leo Whitfield')).toBeInTheDocument();
    expect(within(table).queryByText('Void')).not.toBeInTheDocument();
  });

  it('does not list an instructor with nothing issued in the log dropdown', async () => {
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (certificatesApi.getLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [logEntry({ instructorId: 'i1', instructorName: 'Devon Ashby' })],
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('CS0000001')).toBeInTheDocument());

    const select = document.getElementById('log-instructor-filter') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['All', 'Devon Ashby']);
  });
});

// Item 3: table/card toggle on the issued log only - the worklist keeps its
// existing expandable-row format regardless of this toggle.
describe('Certificates - issued log view toggle', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('defaults to table view and switches to cards on toggle, leaving the worklist format untouched', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [worklistEntry({ studentName: 'Leo Whitfield' })],
    });
    (certificatesApi.getLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [logEntry({ studentName: 'Ruby Sandoval' })],
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Ruby Sandoval')).toBeInTheDocument());

    expect(screen.getByRole('table')).toBeInTheDocument();
    // Worklist row for Leo Whitfield is still the expandable button format,
    // not a table row - proves the toggle is log-only.
    expect(screen.getAllByRole('button', { name: /record certificate/i }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /card view/i }));

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Ruby Sandoval')).toBeInTheDocument();
    // Worklist is unaffected by the log's view toggle.
    expect(screen.getAllByRole('button', { name: /record certificate/i }).length).toBeGreaterThan(0);
  });

  it('persists the selected view across a remount (useSessionState)', async () => {
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (certificatesApi.getLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [logEntry({ studentName: 'Ruby Sandoval' })],
    });

    const { default: userEvent } = await import('@testing-library/user-event');
    const { unmount } = renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Ruby Sandoval')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /card view/i }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Ruby Sandoval')).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

// Phase 2 of the compliance-records arc: a "View" action opens the digital
// certificate view for an issued record. A void was never handed to a
// student (getCertificateDetail rejects one server-side), so it gets no
// action at all - nothing to view.
describe('Certificates - digital certificate view', () => {
  it('shows a View action for an issued record but not for a void one', async () => {
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (certificatesApi.getLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        logEntry({ id: 'c1', studentName: 'Ruby Sandoval' }),
        logEntry({ id: 'c2', status: 'void', studentId: null, studentName: null, instructorId: null, instructorName: null, voidReason: 'Lost' }),
      ],
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Ruby Sandoval')).toBeInTheDocument());

    expect(screen.getAllByRole('button', { name: /^view$/i })).toHaveLength(1);
  });

  it('opens the certificate view with the assembled document when View is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (certificatesApi.getWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (certificatesApi.getLog as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [logEntry({ id: 'c1', studentName: 'Ruby Sandoval' })],
    });
    (certificatesApi.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'c1',
        serialNumber: 'CS0000001',
        formType: 'DL_400D',
        status: 'issued',
        issueDateLocal: 'August 1, 2026',
        school: {
          businessName: 'Budget Driving School',
          licenseNumber: 'E1234',
          addressLine1: '123 Main St',
          addressLine2: null,
          city: 'Sacramento',
          state: 'CA',
          zipCode: '95814',
          phone: '916-555-0100',
        },
        student: { fullName: 'Ruby Sandoval', dateOfBirthLocal: 'May 10, 2009' },
        completionDateLocal: 'July 30, 2026',
        instructor: { fullName: 'Devon Ashby', licenseNumber: 'INS-1' },
      },
    });

    renderCertificatesPage();
    await waitFor(() => expect(screen.getByText('Ruby Sandoval')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^view$/i }));

    expect(await screen.findByText('Certificate of Completion of Behind-The-Wheel Training')).toBeInTheDocument();
    expect(screen.getByText('Budget Driving School')).toBeInTheDocument();
    expect(screen.getByText(/DMV License No\. E1234/)).toBeInTheDocument();
    expect(screen.getAllByText('Devon Ashby').length).toBeGreaterThan(0);
    expect(screen.getByText(/Serial No\. CS0000001/)).toBeInTheDocument();
  });
});
