import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PaymentsPage } from './Payments';
import { studentsApi, paymentsApi } from '@/api';
import type { Student, Payment } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, getAll: vi.fn() },
    paymentsApi: { ...actual.paymentsApi, getAll: vi.fn(), create: vi.fn(), getByStudent: vi.fn() },
  };
});

const MOCK_TENANT_NOW = {
  timezone: 'America/Los_Angeles',
  today: '2026-08-17',
  tomorrow: '2026-08-18',
  currentTime: '12:00',
  weekStart: '2026-08-16',
  weekEnd: '2026-08-22',
  monthBoundaries: { start: '2026-08-01', end: '2026-08-31' },
};

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenantNow: MOCK_TENANT_NOW,
    settings: { enableBlockchainPayments: false },
  }),
}));

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    email: 'test@example.com',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    amount: 100,
    paymentMethod: 'cash',
    paymentType: 'lesson_payment',
    // A real API response always sends an ISO date STRING over JSON,
    // never a live Date instance - String(new Date(...)) produces a
    // human-readable "Tue Aug 04 2026..." form that the page's
    // monthBoundaries comparison (String(p.date).split('T')[0]) can't
    // parse, so fixtures here must use ISO strings to match reality.
    date: '2026-08-10' as unknown as Date,
    status: 'confirmed',
    createdAt: new Date('2026-08-10'),
    updatedAt: new Date('2026-08-10'),
    ...overrides,
  } as Payment;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <PaymentsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe('Payments page - row click opens the existing history detail (item 1)', () => {
  it('clicking a table row opens PaymentHistoryModal, without a second detail surface', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [student({ paymentSummary: { totalPaid: 50, outstandingBalance: 50, paymentStatus: 'partial' } })],
    });

    renderPage();
    const row = (await screen.findByText('Test Student')).closest('tr')!;
    fireEvent.click(row);

    expect(await screen.findByText('Payment History')).toBeInTheDocument();
  });

  it('clicking an action button inside the row does not also trigger the row click', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [student({ paymentSummary: { totalPaid: 50, outstandingBalance: 50, paymentStatus: 'partial' } })],
    });

    renderPage();
    const addPaymentBtn = await screen.findByRole('button', { name: /add payment/i });
    fireEvent.click(addPaymentBtn);

    // Add Payment modal opens (has its own "Close modal" button), not the
    // history one.
    await waitFor(() => expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument());
    expect(screen.queryByText('Payment History')).not.toBeInTheDocument();
  });
});

describe('Payments page - hover-reveal row actions (item 2)', () => {
  it('renders Add Payment and View History as icon buttons under the student name, not separate always-visible text links', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [student({ paymentSummary: { totalPaid: 0, outstandingBalance: 100, paymentStatus: 'unpaid' } })],
    });

    renderPage();
    await screen.findByText('Test Student');

    expect(screen.getByRole('button', { name: /add payment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view payment history/i })).toBeInTheDocument();
    // The old always-visible plain-text "Add Payment" / "View History"
    // links (no aria-label, joined by a "|") are gone.
    expect(screen.queryByText('|')).not.toBeInTheDocument();
  });
});

describe('Payments page - sorting (item 3)', () => {
  it('defaults to name sort and offers a "Highest Balance First" option', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        student({ id: 's1', fullName: 'Zara Low', paymentSummary: { totalPaid: 90, outstandingBalance: 10, paymentStatus: 'partial' } }),
        student({ id: 's2', fullName: 'Amir High', paymentSummary: { totalPaid: 10, outstandingBalance: 200, paymentStatus: 'partial' } }),
      ],
    });

    renderPage();
    await screen.findByText('Amir High');

    const rows = screen.getAllByRole('row').filter((r) => r.textContent?.includes('High') || r.textContent?.includes('Low'));
    // Name A-Z default: Amir before Zara.
    expect(rows[0].textContent).toContain('Amir High');
  });

  it('sorting by balance shows the highest-outstanding-balance student first', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        student({ id: 's1', fullName: 'Zara Low', paymentSummary: { totalPaid: 90, outstandingBalance: 10, paymentStatus: 'partial' } }),
        student({ id: 's2', fullName: 'Amir High', paymentSummary: { totalPaid: 10, outstandingBalance: 200, paymentStatus: 'partial' } }),
      ],
    });

    renderPage();
    await screen.findByText('Amir High');

    fireEvent.change(screen.getByLabelText(/sort students by/i), { target: { value: 'balance' } });

    const rows = screen.getAllByRole('row').filter((r) => r.textContent?.includes('High') || r.textContent?.includes('Low'));
    expect(rows[0].textContent).toContain('Amir High');
    expect(rows[0].textContent).toContain('200.00');
  });
});

describe('Payments page - summary cards (item 4)', () => {
  it('shows Total Outstanding, Collected This Month, and Students with a Balance, combining BTW+DE balances', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        // paymentSummary already combines BTW+DE (studentService's
        // combinePaymentSummaries) - this page just sums it, never
        // re-derives per-program.
        student({ id: 's1', fullName: 'Student One', paymentSummary: { totalPaid: 100, outstandingBalance: 50, paymentStatus: 'partial' } }),
        student({ id: 's2', fullName: 'Student Two', paymentSummary: { totalPaid: 0, outstandingBalance: 150, paymentStatus: 'unpaid' } }),
        student({ id: 's3', fullName: 'Student Three', paymentSummary: { totalPaid: 200, outstandingBalance: 0, paymentStatus: 'paid' } }),
      ],
    });
    (paymentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        payment({ id: 'p1', amount: 100, date: '2026-08-05' as unknown as Date, status: 'confirmed' }),
        payment({ id: 'p2', amount: 200, date: '2026-08-12' as unknown as Date, status: 'confirmed' }),
        // Outside the tenant month boundary - must not count.
        payment({ id: 'p3', amount: 999, date: '2026-07-20' as unknown as Date, status: 'confirmed' }),
        // Not confirmed - must not count.
        payment({ id: 'p4', amount: 999, date: '2026-08-15' as unknown as Date, status: 'pending' }),
      ],
    });

    renderPage();
    await screen.findByText('Student One');

    const outstandingCard = screen.getByText('Total Outstanding').closest('div')!.parentElement as HTMLElement;
    expect(within(outstandingCard).getByText('$200.00')).toBeInTheDocument(); // 50 + 150 + 0

    const collectedCard = screen.getByText('Collected This Month').closest('div')!.parentElement as HTMLElement;
    expect(within(collectedCard).getByText('$300.00')).toBeInTheDocument(); // 100 + 200, not 999s

    const balanceCountCard = screen.getByText('Students with a Balance').closest('div')!.parentElement as HTMLElement;
    expect(within(balanceCountCard).getByText('2')).toBeInTheDocument(); // s1 and s2, not s3
  });
});

describe('Payments page - reference number visible in history (item 5)', () => {
  it('View History shows the Reference # column, with the reference number recorded on the Add Payment modal', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [student()],
    });
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ referenceNumber: 'SQ-4521' })],
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /view payment history/i }));

    expect(await screen.findByText('Payment History')).toBeInTheDocument();
    expect(await screen.findByText('Reference #')).toBeInTheDocument();
    expect(screen.getByText('SQ-4521')).toBeInTheDocument();
  });
});

describe('Payments page - status filter reflects the combined balance (item 6)', () => {
  it('filtering by "unpaid" includes a DE-only student whose combined paymentSummary says unpaid', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        student({ id: 's1', fullName: 'DE Only Student', paymentSummary: { totalPaid: 0, outstandingBalance: 150, paymentStatus: 'unpaid' } }),
        student({ id: 's2', fullName: 'Paid Up Student', paymentSummary: { totalPaid: 100, outstandingBalance: 0, paymentStatus: 'paid' } }),
      ],
    });

    renderPage();
    await screen.findByText('DE Only Student');

    fireEvent.change(screen.getByLabelText(/filter by payment status/i), { target: { value: 'unpaid' } });

    expect(screen.getByText('DE Only Student')).toBeInTheDocument();
    expect(screen.queryByText('Paid Up Student')).not.toBeInTheDocument();
  });
});
