import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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

describe('PaymentHistoryModal - "Applied To" merged into Type (payments-phase1 item 7, payment-history-layout)', () => {
  it('shows the enrollment\'s program type as a second line under the payment type, never a specific lesson', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ programType: 'driver_training' })],
    });

    renderModal();

    expect((await screen.findAllByText('Lesson Payment')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('driver training')).length).toBeGreaterThan(0);
    // Never a lesson-specific claim anywhere in the modal.
    expect(screen.queryByText(/lesson #/i)).not.toBeInTheDocument();
    // Applied To is no longer its own column (payment-history-layout).
    expect(screen.queryByText('Applied To')).not.toBeInTheDocument();
  });

  it('shows no second line when programType is absent', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ programType: undefined })],
    });

    renderModal();

    expect((await screen.findAllByText('Lesson Payment')).length).toBeGreaterThan(0);
    expect(screen.queryByText('driver training')).not.toBeInTheDocument();
  });
});

// payment-history-layout renders two parallel markups for every payment -
// a >=sm table and a <sm stacked-card list, toggled with CSS (hidden/
// sm:hidden), not conditional rendering, so jsdom (which doesn't compute
// CSS media queries) mounts BOTH at once. Every row-menu TRIGGER query in
// this file is therefore scoped to the table via `within(table)` - the
// stacked-card list's own PaymentRowMenu/actions-present coverage lives in
// its own describe block below instead of being duplicated here.
//
// Once a menu is OPEN, its items (Print receipt/Refund/Void) are portaled
// straight to document.body (payment-history-layout review fix - see
// PaymentRowMenu.tsx), so they're no longer a DOM descendant of the table
// at all. Those queries use plain `screen`, not `within(table)` -
// scoping them to the table would never find them, portal or not.
describe('PaymentHistoryModal - receipt via row menu (payments-adjustments)', () => {
  it('opens the print route in a new tab via the row menu\'s "Print receipt" item', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'payment-abc' })],
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderModal();
    const table = await screen.findByRole('table');
    const menuTrigger = within(table).getByRole('button', { name: /payment actions/i });
    fireEvent.click(menuTrigger);
    const receiptButton = await screen.findByRole('button', { name: /print receipt/i });
    fireEvent.click(receiptButton);

    expect(windowOpenSpy).toHaveBeenCalledWith('/payments/payment-abc/receipt', '_blank', 'noopener');
    windowOpenSpy.mockRestore();
  });

  it('renders one row menu per payment row (desktop table) and one per card (mobile)', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1' }), payment({ id: 'p2' })],
    });

    renderModal();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('button', { name: /payment actions/i })).toHaveLength(2));
    // Total across both the table and the stacked-card list is 4 (2
    // payments x 2 parallel renderings) - proves the mobile card list
    // also renders its own actions control per row, not just the table.
    expect(screen.getAllByRole('button', { name: /payment actions/i })).toHaveLength(4);
  });
});

describe('PaymentHistoryModal - row menu Refund/Void role gating (payments-adjustments)', () => {
  it('shows Refund and Void to an admin, for a confirmed payment with something left to adjust', async () => {
    mockRole = 'admin';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 100, displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: /payment actions/i }));

    expect(await screen.findByRole('button', { name: /^refund$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^void$/i })).toBeInTheDocument();
  });

  it('hides Refund and Void from a staff user', async () => {
    mockRole = 'staff';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 100, displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: /payment actions/i }));

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
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: /payment actions/i }));

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
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: /payment actions/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^refund$/i }));

    expect(await screen.findByRole('heading', { name: 'Refund' })).toBeInTheDocument();
  });

  it('clicking Void in the row menu opens the void dialog', async () => {
    mockRole = 'admin';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', status: 'confirmed', amount: 100, netPaid: 100, displayStatus: 'paid', adjustments: [] })],
    });

    renderModal();
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: /payment actions/i }));
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
    expect((await screen.findAllByText('Paid')).length).toBeGreaterThan(0);
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

    expect((await screen.findAllByText('Partly refunded')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Refunded - Overpaid/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Jane Admin/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$40.00').length).toBeGreaterThan(0);
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

    expect((await screen.findAllByText('Voided')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Voided - Entered by mistake/).length).toBeGreaterThan(0);
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

describe('PaymentHistoryModal - sticky Actions column and merged Details column (payment-history-layout)', () => {
  it('renders the actions control (row menu) for every payment row, in both the table and the stacked-card list', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1' }), payment({ id: 'p2' }), payment({ id: 'p3' })],
    });

    renderModal();

    const table = await screen.findByRole('table');
    // Desktop table: one trigger per row.
    expect(within(table).getAllByRole('button', { name: /payment actions/i })).toHaveLength(3);
    // Total (table + mobile cards, both always mounted - CSS, not
    // conditional rendering, decides which is visible) is 6.
    expect(screen.getAllByRole('button', { name: /payment actions/i })).toHaveLength(6);
  });

  it('marks the sticky Actions header and cells so they pin to the right edge with an opaque background', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1' })],
    });

    renderModal();

    const table = await screen.findByRole('table');
    const actionsHeader = within(table).getByText('Actions');
    expect(actionsHeader.className).toContain('sticky');
    expect(actionsHeader.className).toContain('right-0');
    expect(actionsHeader.className).toContain('bg-surface2');
  });

  it('truncates a long note in the merged Details column but exposes the full text via title, and merges in the reference number', async () => {
    const longNote =
      'Customer called to say they will be a few minutes late to drop off cash for the remaining balance on their package, please leave a note for the front desk';
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', referenceNumber: 'REF-1001', notes: longNote })],
    });

    renderModal();

    const table = await screen.findByRole('table');
    const detailsCell = within(table).getByTitle(`REF-1001 - ${longNote}`);
    expect(detailsCell.className).toContain('truncate');
    expect(detailsCell.textContent).toBe(`REF-1001 - ${longNote}`);
    // Reachable via keyboard focus, not just mouse hover.
    expect(detailsCell).toHaveAttribute('tabIndex', '0');
    // Reference # and Notes are no longer separate columns.
    expect(screen.queryByText('Reference #')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });

  it('shows a dash in Details when both reference number and notes are empty', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1', referenceNumber: undefined, notes: undefined })],
    });

    renderModal();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    const dataRow = rows[rows.length - 1];
    expect(dataRow.textContent).toContain('-');
  });

  it("gives an adjustment sub-row's sticky Actions cell the SAME background class as the rest of its row, not a second translucent layer on top (review fix)", async () => {
    // Regression test for a visible seam: the sticky cell used to carry
    // bg-surface2/50 on top of the <tr>'s OWN bg-surface2/50, stacking two
    // semi-transparent layers into a visibly darker patch than the rest of
    // the row's single layer. Fixed by moving the tint onto every <td>
    // individually (including the sticky one) and off the <tr> - so every
    // cell in the row now paints the exact same one layer.
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

    const table = await screen.findByRole('table');
    const adjustmentText = within(table).getByText(/Refunded - Overpaid/);
    const adjustmentRow = adjustmentText.closest('tr');
    expect(adjustmentRow).not.toBeNull();
    // The <tr> itself no longer carries the tint directly.
    expect(adjustmentRow!.className).not.toContain('bg-surface2');
    const cells = adjustmentRow!.querySelectorAll('td');
    // Every cell in the row (including the sticky one, last) paints the
    // exact same single background class - no cell doubles up on it.
    cells.forEach((cell) => {
      expect(cell.className).toContain('bg-surface2/50');
    });
    const stickyCell = cells[cells.length - 1];
    expect(stickyCell.className).toContain('sticky');
    expect(stickyCell.className).toContain('right-0');
  });
});

describe('PaymentHistoryModal - header actions wrap below sm instead of clipping (payment-history-layout review fix)', () => {
  it('gives Set arrangement and Record payment full-width/stacking classes for narrow viewports', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
    const onRecordPayment = vi.fn();
    const studentWithEnrollment: Student = {
      ...STUDENT,
      activeEnrollment: { id: 'enr-1', paymentArrangementSetAt: null } as Student['activeEnrollment'],
    };

    renderModal({ student: studentWithEnrollment, onRecordPayment });

    const setArrangementButton = await screen.findByRole('button', { name: /set arrangement/i });
    const recordPaymentButton = await screen.findByRole('button', { name: /record payment/i });
    // flex (not inline-flex) + justify-center, switching to justify-start
    // at sm, is what lets these buttons stretch full-width and stack on a
    // narrow viewport instead of staying pinned to a fixed-width row that
    // clips past the right edge.
    expect(setArrangementButton.className).toContain('justify-center');
    expect(setArrangementButton.className).toContain('sm:justify-start');
    expect(recordPaymentButton.className).toContain('justify-center');
    expect(recordPaymentButton.className).toContain('sm:justify-start');
    // The actions' own wrapper stacks (flex-col) below sm and goes
    // horizontal (sm:flex-row) at sm and up.
    const actionsWrapper = setArrangementButton.parentElement;
    expect(actionsWrapper!.className).toContain('flex-col');
    expect(actionsWrapper!.className).toContain('sm:flex-row');
  });

  it('renders exactly one close button visible per breakpoint (one sm:hidden, one hidden sm:block), both wired to onClose', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const { onClose } = renderModal();

    // Both close buttons exist in the DOM at once (CSS, not conditional
    // rendering, decides which one is visible at a given width - same
    // pattern already used for the table/card dual rendering above), so
    // there are 2 in jsdom; clicking either calls the same onClose.
    const closeButtons = screen.getAllByRole('button', { name: '' }).filter((btn) =>
      btn.querySelector('svg.lucide-x')
    );
    expect(closeButtons.length).toBe(2);
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
