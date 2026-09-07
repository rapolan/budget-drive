import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArchivePage } from './Archive';
import { studentsApi } from '@/api';
import type { ArchiveReadyEntry, HeldStudentEntry, ArchivedStudentEntry } from '@/api/students';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      getArchiveWorklist: vi.fn(),
      getHeldStudents: vi.fn(),
      getArchived: vi.fn(),
      archive: vi.fn(),
      archiveHold: vi.fn(),
      clearArchiveHold: vi.fn(),
      restore: vi.fn(),
    },
  };
});

function worklistEntry(overrides: Partial<ArchiveReadyEntry> = {}): ArchiveReadyEntry {
  return {
    studentId: 'student-1',
    studentName: 'Ada Chen',
    reason: 'permit_expired',
    reasonDate: '2020-01-01',
    programTypes: ['driver_training'],
    ...overrides,
  };
}

function heldEntry(overrides: Partial<HeldStudentEntry> = {}): HeldStudentEntry {
  return {
    studentId: 'student-2',
    studentName: 'Leo Whitfield',
    archiveHoldReason: 'Returning in the fall',
    archiveHeldAt: '2026-06-01T00:00:00.000Z',
    archiveHeldByName: 'Devon Ashby',
    ...overrides,
  };
}

function archivedEntry(overrides: Partial<ArchivedStudentEntry> = {}): ArchivedStudentEntry {
  return {
    studentId: 'student-3',
    studentName: 'Ruby Sandoval',
    archivedAt: '2026-03-15T00:00:00.000Z',
    archiveHash: 'abc123',
    archiveLedgerTxid: null,
    programTypes: ['driver_training'],
    ...overrides,
  };
}

function renderArchivePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ArchivePage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  (studentsApi.getHeldStudents as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  (studentsApi.getArchived as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
});

afterEach(() => {
  cleanup();
});

describe('Archive - eligibility worklist', () => {
  it('defaults to the worklist tab and shows an eligible student with its reason', async () => {
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [worklistEntry()],
    });

    renderArchivePage();

    await waitFor(() => expect(screen.getByText('Ada Chen')).toBeInTheDocument());
    expect(screen.getByText(/permit expired/i)).toBeInTheDocument();
  });

  it('archiving a worklist row calls the archive endpoint and removes it from the list on refetch', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: [worklistEntry()] })
      .mockResolvedValueOnce({ data: [] });
    (studentsApi.archive as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderArchivePage();
    await waitFor(() => expect(screen.getByText('Ada Chen')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^archive$/i }));

    await waitFor(() => expect(studentsApi.archive).toHaveBeenCalledWith('student-1'));
    await waitFor(() => expect(screen.queryByText('Ada Chen')).not.toBeInTheDocument());
  });

  it('holding a student requires a reason and calls archiveHold with it', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [worklistEntry()],
    });
    (studentsApi.archiveHold as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderArchivePage();
    await waitFor(() => expect(screen.getByText('Ada Chen')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /hold active/i }));
    const confirmButton = screen.getByRole('button', { name: /confirm hold/i });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/family said/i), 'Returning in spring');
    expect(confirmButton).not.toBeDisabled();

    await userEvent.click(confirmButton);
    await waitFor(() =>
      expect(studentsApi.archiveHold).toHaveBeenCalledWith('student-1', 'Returning in spring')
    );
  });

  it('shows an "Archive all N eligible" bulk action when the worklist is non-empty', async () => {
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [worklistEntry(), worklistEntry({ studentId: 'student-4', studentName: 'Priya Nair' })],
    });

    renderArchivePage();

    await waitFor(() => expect(screen.getByText(/archive all 2 eligible/i)).toBeInTheDocument());
  });
});

describe('Archive - held tab', () => {
  it('lists a held student with its reason and clears the hold on click', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getHeldStudents as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: [heldEntry()] })
      .mockResolvedValueOnce({ data: [] });
    (studentsApi.clearArchiveHold as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderArchivePage();
    await userEvent.click(screen.getByRole('tab', { name: /held/i }));

    await waitFor(() => expect(screen.getByText('Leo Whitfield')).toBeInTheDocument());
    expect(screen.getByText(/returning in the fall/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /clear hold/i }));
    await waitFor(() => expect(studentsApi.clearArchiveHold).toHaveBeenCalledWith('student-2'));
  });

  it('shows an empty state when nothing is held', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderArchivePage();
    await userEvent.click(screen.getByRole('tab', { name: /held/i }));

    expect(await screen.findByText(/nothing held/i)).toBeInTheDocument();
  });
});

describe('Archive - sealed archive tab', () => {
  it('groups sealed records by year, newest first, with the newest year expanded by default', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getArchived as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        archivedEntry({ studentId: 's1', studentName: 'Newest 2026', archivedAt: '2026-03-15T00:00:00.000Z' }),
        archivedEntry({ studentId: 's2', studentName: 'Older 2020', archivedAt: '2020-06-01T00:00:00.000Z' }),
      ],
    });

    renderArchivePage();
    await userEvent.click(screen.getByRole('tab', { name: /sealed archive/i }));

    expect(await screen.findByText('2026')).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
    // Newest year (2026) defaults expanded - its student is visible.
    expect(screen.getByText('Newest 2026')).toBeInTheDocument();
    // Older year (2020) defaults collapsed - its student is not rendered.
    expect(screen.queryByText('Older 2020')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('2020'));
    expect(await screen.findByText('Older 2020')).toBeInTheDocument();
  });

  it('shows "hash recorded - not yet anchored" for a sealed record with no ledger txid', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getArchived as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [archivedEntry()],
    });

    renderArchivePage();
    await userEvent.click(screen.getByRole('tab', { name: /sealed archive/i }));

    expect(await screen.findByText(/hash recorded - not yet anchored/i)).toBeInTheDocument();
  });

  it('restoring a sealed record is confirm-guarded and calls restore only after confirming', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    (studentsApi.getArchiveWorklist as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    (studentsApi.getArchived as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [archivedEntry()],
    });
    (studentsApi.restore as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    renderArchivePage();
    await userEvent.click(screen.getByRole('tab', { name: /sealed archive/i }));
    await waitFor(() => expect(screen.getByText('Ruby Sandoval')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /restore to active/i }));
    expect(studentsApi.restore).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /confirm restore/i }));
    await waitFor(() => expect(studentsApi.restore).toHaveBeenCalledWith('student-3'));
  });
});
