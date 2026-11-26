import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentHistoryModal } from './PaymentHistoryModal';
import { paymentsApi } from '@/api';
import type { Student, Payment } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    paymentsApi: {
      ...actual.paymentsApi,
      getByStudent: vi.fn(),
      createAdjustment: vi.fn(),
    },
  };
});

// Mutable per-test role - PaymentHistoryModal only ever reads this to
// decide whether to SHOW the Refund/Void menu options at all (the real
// security boundary is the backend's own requireRole check, re-verified
// independently of this mock).
let mockRole = 'admin';
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));

beforeEach(() => {
  mockRole = 'admin';
});

afterEach(cleanup);

const STUDENT: Student = {
  id: 'student-1',
  tenantId: 'tenant-1',
  fullName: 'Test Student',
  email: 'test.student@example.com',
  phone: '555-0100',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  paymentSummary: {
    totalPaid: 100,
    outstandingBalance: 200,
    paymentStatus: 'partial',
    creditBalance: 0,
  },
} as Student;

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    amount: 100,
    paymentMethod: 'cash',
    paymentType: 'lesson_payment',
    date: '2026-08-10' as unknown as Date,
    status: 'confirmed',
    createdAt: new Date('2026-08-10'),
    updatedAt: new Date('2026-08-10'),
    adjustments: [],
    netPaid: 100,
    displayStatus: 'paid',
    ...overrides,
  } as Payment;
}

function renderModal(options: {
  isOpen?: boolean;
  student?: Student | null;
  onRecordPayment?: () => void;
  onViewStudentRecord?: (studentId: string) => void;
} = {}) {
  const { isOpen = true, student = STUDENT, onRecordPayment, onViewStudentRecord } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <PaymentHistoryModal
        isOpen={isOpen}
        onClose={onClose}
        student={student}
        onRecordPayment={onRecordPayment}
        onViewStudentRecord={onViewStudentRecord}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

describe('PaymentHistoryModal - "Applied To" column (payments-phase1, item 7)', () => {
  it('shows the enrollment\'s program type, never a specific lesson', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ programType: 'driver_training' })],
    });

    renderModal();

    expect(await screen.findByText('Applied To')).toBeInTheDocument();
    expect(await screen.findByText('driver training')).toBeInTheDocument();
    // Never a lesson-specific claim anywhere in the modal.
    expect(screen.queryByText(/lesson #/i)).not.toBeInTheDocument();
  });

  it('shows "-" when programType is absent', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ programType: undefined })],
    });

    renderModal();

    const rows = await screen.findAllByRole('row');
    const dataRow = rows[rows.length - 1];
    expect(dataRow.textContent).toContain('-');
  });
});

describe('PaymentHistoryModal - receipt via row menu (payments-adjustments)', () => {
  it('opens the print route in a new tab via the row menu\'s "Print receipt" item', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'payment-abc' })],
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderModal();
    const menuTrigger = await screen.findByRole('button', { name: /payment actions/i });
    fireEvent.click(menuTrigger);
    const receiptButton = await screen.findByRole('button', { name: /print receipt/i });
    fireEvent.click(receiptButton);

    expect(windowOpenSpy).toHaveBeenCalledWith('/payments/payment-abc/receipt', '_blank', 'noopener');
    windowOpenSpy.mockRestore();
  });

  it('renders one row menu per payment row', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1' }), payment({ id: 'p2' })],
    });

    renderModal();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /payment actions/i })).toHaveLength(2));
  });
});

describe('PaymentHistoryModal - row menu Refund/Void role gating (payments-adjustments)', () => {
  it('shows Refund and Void to an admin, for a confirmed payment with something left to adjust', async () => {
    mockRole = 'admin';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 100, displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /payment actions/i }));

    expect(await screen.findByRole('button', { name: /^refund$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^void$/i })).toBeInTheDocument();
  });

  it('hides Refund and Void from a staff user', async () => {
    mockRole = 'staff';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 100, displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /payment actions/i }));

    await screen.findByRole('button', { name: /print receipt/i });
    expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
  });

  it('hides Refund and Void for a fully-adjusted payment (nothing left to adjust)', async () => {
    mockRole = 'admin';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 0, displayStatus: 'refunded', adjustments: [] })],
    });

    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /payment actions/i }));

    await screen.findByRole('button', { name: /print receipt/i });
    expect(screen.queryByRole('button', { name: /^refund$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^void$/i })).not.toBeInTheDocument();
  });

  it('clicking Refund in the row menu opens the refund dialog', async () => {
    mockRole = 'admin';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 100, displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /payment actions/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^refund$/i }));

    expect(await screen.findByRole('heading', { name: 'Refund' })).toBeInTheDocument();
  });

  it('clicking Void in the row menu opens the void dialog', async () => {
    mockRole = 'admin';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 100, displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /payment actions/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^void$/i }));

    expect(await screen.findByRole('heading', { name: 'Void' })).toBeInTheDocument();
  });
});

describe('PaymentHistoryModal - status chips and adjustment lines (payments-adjustments)', () => {
  it('shows "Paid" for an unadjusted confirmed payment', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ status: 'confirmed', displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    expect(await screen.findByText('Paid')).toBeInTheDocument();
  });

  it('shows "Partly refunded" and an indented red refund line with reason and who', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        payment({
          id: 'p1',
          amount: 100,
          status: 'confirmed',
          displayStatus: 'partly_refunded',
          netPaid: 60,
          adjustments: [
            {
              id: 'adj-1',
              tenantId: 'tenant-1',
              paymentId: 'p1',
              adjustmentType: 'refund',
              amount: 40,
              reasonCode: 'overpaid',
              note: null,
              createdBy: 'user-1',
              createdByName: 'Jane Admin',
              createdAt: new Date('2026-08-12'),
            },
          ],
        }),
      ],
    });

    renderModal();

    expect(await screen.findByText('Partly refunded')).toBeInTheDocument();
    expect(screen.getByText(/Refunded - Overpaid/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Admin/)).toBeInTheDocument();
    expect(screen.getByText('-$40.00')).toBeInTheDocument();
  });

  it('shows "Voided" with the amount struck through', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        payment({
          id: 'p1',
          amount: 100,
          status: 'confirmed',
          displayStatus: 'voided',
          netPaid: 0,
          adjustments: [
            {
              id: 'adj-2',
              tenantId: 'tenant-1',
              paymentId: 'p1',
              adjustmentType: 'void',
              amount: 100,
              reasonCode: 'entered_in_error',
              note: null,
              createdBy: 'user-1',
              createdByName: 'Jane Admin',
              createdAt: new Date('2026-08-12'),
            },
          ],
        }),
      ],
    });

    renderModal();

    expect(await screen.findByText('Voided')).toBeInTheDocument();
    expect(screen.getByText(/Voided - Entered by mistake/)).toBeInTheDocument();
    const amountEls = screen.getAllByText('$100.00');
    const struckThrough = amountEls.find((el) => el.className.includes('line-through'));
    expect(struckThrough).toBeDefined();
  });
});

describe('PaymentHistoryModal - "Record payment" (payments-actions, item 1)', () => {
  it('shows a "Record payment" button in the header when onRecordPayment is provided, and calls it on click', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    const onRecordPayment = vi.fn();

    renderModal({ onRecordPayment });
    const button = await screen.findByRole('button', { name: /record payment/i });
    fireEvent.click(button);

    expect(onRecordPayment).toHaveBeenCalledTimes(1);
  });

  it('does not render a "Record payment" button when onRecordPayment is omitted', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal();

    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument();
  });
});

describe('PaymentHistoryModal - summary strip (payments-actions, item 2)', () => {
  it('shows total due, total paid, and outstanding balance, derived from the same paymentSummary the page already shows', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal();

    expect(await screen.findByText('Total Due')).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument(); // 100 paid + 200 outstanding
    expect(screen.getByText('Total Paid')).toBeInTheDocument();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
  });

  it('shows "Paid, Not Yet Scheduled" only when creditBalance is above zero', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const studentWithCredit: Student = {
      ...STUDENT,
      paymentSummary: { totalPaid: 300, outstandingBalance: 0, paymentStatus: 'paid', creditBalance: 50 },
    };
    renderModal({ student: studentWithCredit });

    expect(await screen.findByText('Paid, Not Yet Scheduled')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('hides "Paid, Not Yet Scheduled" when creditBalance is zero', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal();

    await screen.findByText('Total Due');
    expect(screen.queryByText('Paid, Not Yet Scheduled')).not.toBeInTheDocument();
  });
});

describe('PaymentHistoryModal - contact info and student record link (payments-actions, item 4)', () => {
  it('shows tap-to-call and mailto links for the student\'s phone and email', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal();

    const emailLink = await screen.findByRole('link', { name: /test\.student@example\.com/i });
    expect(emailLink).toHaveAttribute('href', 'mailto:test.student@example.com');
    const phoneLink = screen.getByRole('link', { name: /555-0100/ });
    expect(phoneLink).toHaveAttribute('href', 'tel:555-0100');
  });

  it('shows "No contact on file" when the student has neither email nor phone', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const noContactStudent: Student = { ...STUDENT, email: undefined, phone: undefined };
    renderModal({ student: noContactStudent });

    expect(await screen.findByText('No contact on file')).toBeInTheDocument();
  });

  it('calls onViewStudentRecord with the student id when "View student record" is clicked', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    const onViewStudentRecord = vi.fn();

    renderModal({ onViewStudentRecord });
    const link = await screen.findByRole('button', { name: /view student record/i });
    fireEvent.click(link);

    expect(onViewStudentRecord).toHaveBeenCalledWith('student-1');
  });

  it('does not render "View student record" when onViewStudentRecord is omitted', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderModal();

    await screen.findByText('Total Due');
    expect(screen.queryByRole('button', { name: /view student record/i })).not.toBeInTheDocument();
  });
});
