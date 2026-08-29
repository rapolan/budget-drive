import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CertificatesPage } from './Certificates';
import { certificatesApi } from '@/api';
import type { AwaitingCertificateEntry } from '@/api/certificates';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    certificatesApi: {
      ...actual.certificatesApi,
      getWorklist: vi.fn(),
      getCounts: vi.fn(),
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
// date - see WorklistRow's issueDate initial state. Confirmed already
// correct; this pins the behavior.
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
