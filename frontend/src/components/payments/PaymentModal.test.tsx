import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentModal } from './PaymentModal';
import { paymentsApi, studentsApi } from '@/api';
import type { Student, PaymentQuickAmounts, DuplicatePaymentCheck } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    paymentsApi: {
      ...actual.paymentsApi,
      create: vi.fn(),
      getQuickAmounts: vi.fn(),
      checkDuplicate: vi.fn(),
    },
    studentsApi: {
      ...actual.studentsApi,
      getAll: vi.fn(),
    },
  };
});

let mockEnableBlockchainPayments = false;
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: null,
    tenantType: 'school',
    settings: { enableBlockchainPayments: mockEnableBlockchainPayments },
    loading: false,
    error: null,
    refreshSettings: vi.fn(),
    updateTheme: vi.fn(),
  }),
}));

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Owen Castillo',
    email: 'owen@example.com',
    paymentSummary: { totalPaid: 30, outstandingBalance: 70, paymentStatus: 'partial' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

const EMPTY_QUICK_AMOUNTS: PaymentQuickAmounts = {
  nextLesson: null,
  scheduledLessons: null,
  completedUnpaidLessons: null,
  remainingCourse: null,
};

const NO_DUPLICATE: DuplicatePaymentCheck = { isDuplicate: false, amount: null };

function renderModal(props: Partial<React.ComponentProps<typeof PaymentModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentModal isOpen={true} onClose={vi.fn()} student={student()} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnableBlockchainPayments = false;
  (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });
  (paymentsApi.getQuickAmounts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: EMPTY_QUICK_AMOUNTS });
  (paymentsApi.checkDuplicate as ReturnType<typeof vi.fn>).mockResolvedValue({ data: NO_DUPLICATE });
});

afterEach(cleanup);

async function fillAmountAndMethod(amount: string, method = 'Cash') {
  const amountInput = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement;
  fireEvent.change(amountInput, { target: { value: amount } });
  fireEvent.click(screen.getByRole('button', { name: method }));
  return amountInput;
}

describe('PaymentModal - payment method (no default)', () => {
  it('has no method selected by default', async () => {
    renderModal();

    for (const name of ['Cash', 'Check', 'Card', 'Zelle', 'Venmo', 'Other']) {
      expect(await screen.findByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('shows an inline error and does not submit when method is missing', async () => {
    renderModal();

    const amountInput = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    expect(await screen.findByText(/choose a payment method/i)).toBeInTheDocument();
    expect(paymentsApi.create).not.toHaveBeenCalled();
  });

  it('clicking a chip selects that method', async () => {
    renderModal();

    const venmoChip = await screen.findByRole('button', { name: 'Venmo' });
    fireEvent.click(venmoChip);

    expect(venmoChip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides BSV/MNEE chips entirely when blockchain payments are disabled', async () => {
    mockEnableBlockchainPayments = false;
    renderModal();

    await screen.findByRole('button', { name: 'Cash' });
    expect(screen.queryByRole('button', { name: /bsv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mnee/i })).not.toBeInTheDocument();
  });

  it('shows BSV/MNEE chips, selectable, when blockchain payments are enabled', async () => {
    mockEnableBlockchainPayments = true;
    renderModal();

    const bsvChip = await screen.findByRole('button', { name: /bsv/i });
    fireEvent.click(bsvChip);
    expect(bsvChip).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PaymentModal - quick-amount chips', () => {
  it('shows no chips for a student with $0 lessons', async () => {
    (paymentsApi.getQuickAmounts as ReturnType<typeof vi.fn>).mockResolvedValue({ data: EMPTY_QUICK_AMOUNTS });
    renderModal();

    await screen.findByRole('button', { name: 'Cash' });
    expect(screen.queryByText(/booked lesson/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/completed, unpaid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/remaining course/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/next lesson/i)).not.toBeInTheDocument();
  });

  it('renders each chip with its real amount and label, de-duplicating equal amounts', async () => {
    (paymentsApi.getQuickAmounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        nextLesson: { amount: 50, date: '2026-12-05' },
        scheduledLessons: { amount: 100, count: 2 },
        completedUnpaidLessons: { amount: 100, count: 2 }, // same as scheduledLessons -> deduped
        remainingCourse: 300,
      } satisfies PaymentQuickAmounts,
    });
    renderModal();

    expect(await screen.findByRole('button', { name: /next lesson.*\$50\.00/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2 booked lessons.*\$100\.00/i })).toBeInTheDocument();
    // completedUnpaidLessons has the same $100 amount as scheduledLessons - only one chip shown for it.
    expect(screen.queryByText(/completed, unpaid/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remaining course.*\$300\.00/i })).toBeInTheDocument();
  });

  it('shows a credit on account as no chips needed (everything covered)', async () => {
    (paymentsApi.getQuickAmounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        nextLesson: null,
        scheduledLessons: null,
        completedUnpaidLessons: null,
        remainingCourse: 0,
      } satisfies PaymentQuickAmounts,
    });
    renderModal({ student: student({ paymentSummary: { totalPaid: 150, outstandingBalance: 0, paymentStatus: 'paid', creditBalance: 0 } }) });

    await screen.findByRole('button', { name: 'Cash' });
    expect(screen.queryByText(/remaining course/i)).not.toBeInTheDocument();
  });

  it('excludes a no_show lesson from the chip math (server-computed, nothing to assert client-side beyond trusting the response)', async () => {
    (paymentsApi.getQuickAmounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        nextLesson: null,
        scheduledLessons: null,
        completedUnpaidLessons: { amount: 100, count: 1 },
        remainingCourse: 100,
      } satisfies PaymentQuickAmounts,
    });
    renderModal();

    expect(await screen.findByRole('button', { name: /1 completed, unpaid.*\$100\.00/i })).toBeInTheDocument();
    // The $500 no_show lesson's cost never appears anywhere in the form.
    expect(screen.queryByText(/\$500\.00/)).not.toBeInTheDocument();
  });

  it('clicking a chip sets the amount field', async () => {
    (paymentsApi.getQuickAmounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ...EMPTY_QUICK_AMOUNTS, remainingCourse: 70 },
    });
    renderModal();

    const chip = await screen.findByRole('button', { name: /remaining course/i });
    fireEvent.click(chip);

    const amountInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    expect(amountInput.value).toBe('70');
  });
});

describe('PaymentModal - duplicate warning', () => {
  it('shows a gentle inline warning when a same amount/method payment was recorded in the last 24h', async () => {
    (paymentsApi.checkDuplicate as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { isDuplicate: true, amount: 50 } satisfies DuplicatePaymentCheck,
    });
    renderModal();

    await fillAmountAndMethod('50', 'Cash');

    expect(await screen.findByText(/already recorded today/i)).toBeInTheDocument();
    // The user can still proceed - submit is not blocked by the warning.
    expect(screen.getByRole('button', { name: /record payment/i })).not.toBeDisabled();
  });

  it('dismisses the warning without blocking submission', async () => {
    (paymentsApi.checkDuplicate as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { isDuplicate: true, amount: 50 } satisfies DuplicatePaymentCheck,
    });
    renderModal();

    await fillAmountAndMethod('50', 'Cash');
    await screen.findByText(/already recorded today/i);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/already recorded today/i)).not.toBeInTheDocument();
  });

  it('does not warn when no duplicate exists', async () => {
    (paymentsApi.checkDuplicate as ReturnType<typeof vi.fn>).mockResolvedValue({ data: NO_DUPLICATE });
    renderModal();

    await fillAmountAndMethod('50', 'Cash');

    await waitFor(() => expect(paymentsApi.checkDuplicate).toHaveBeenCalled());
    expect(screen.queryByText(/already recorded today/i)).not.toBeInTheDocument();
  });
});

describe('PaymentModal - overpay note', () => {
  it('shows a credit note when the amount exceeds the outstanding balance', async () => {
    renderModal();

    await fillAmountAndMethod('90', 'Cash');

    expect(await screen.findByText(/leave \$20\.00 credit on account/i)).toBeInTheDocument();
  });

  it('does not show the overpay note when the amount is within the balance', async () => {
    renderModal();

    await fillAmountAndMethod('50', 'Cash');

    expect(screen.queryByText(/credit on account/i)).not.toBeInTheDocument();
  });
});

describe('PaymentModal - confirmation step', () => {
  it('shows "Payment recorded" with amount/method and does not close immediately', async () => {
    const onClose = vi.fn();
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'payment-1', amount: '50.00', paymentMethod: 'cash' },
    });
    renderModal({ onClose });

    await fillAmountAndMethod('50', 'Cash');
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    expect(await screen.findByText(/payment recorded/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /print receipt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record another/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^done$/i })).toBeInTheDocument();
  });

  it('"Done" calls onClose', async () => {
    const onClose = vi.fn();
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'payment-1', amount: '50.00', paymentMethod: 'cash' },
    });
    renderModal({ onClose });

    await fillAmountAndMethod('50', 'Cash');
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));
    await screen.findByText(/payment recorded/i);

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"Record another" resets the form for the same student without closing', async () => {
    const onClose = vi.fn();
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'payment-1', amount: '50.00', paymentMethod: 'cash' },
    });
    renderModal({ onClose });

    await fillAmountAndMethod('50', 'Cash');
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));
    await screen.findByText(/payment recorded/i);

    fireEvent.click(screen.getByRole('button', { name: /record another/i }));

    expect(onClose).not.toHaveBeenCalled();
    const amountInput = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement;
    expect(amountInput.value).toBe('');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('"Print receipt" opens the receipt URL in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'payment-1', amount: '50.00', paymentMethod: 'cash' },
    });
    renderModal();

    await fillAmountAndMethod('50', 'Cash');
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));
    await screen.findByText(/payment recorded/i);

    fireEvent.click(screen.getByRole('button', { name: /print receipt/i }));
    expect(openSpy).toHaveBeenCalledWith('/payments/payment-1/receipt', '_blank', 'noopener');

    openSpy.mockRestore();
  });
});

describe('PaymentModal - double-submission guard', () => {
  it('disables the confirm button while the mutation is pending', async () => {
    let resolveCreate: (v: any) => void = () => {};
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    renderModal();

    await fillAmountAndMethod('50', 'Cash');
    const confirmBtn = screen.getByRole('button', { name: /record payment/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(confirmBtn).toBeDisabled());
    expect(paymentsApi.create).toHaveBeenCalledTimes(1);

    fireEvent.click(confirmBtn);
    expect(paymentsApi.create).toHaveBeenCalledTimes(1);

    resolveCreate({ data: { id: 'p1', amount: '50.00', paymentMethod: 'cash' } });
  });
});

describe('PaymentModal - student selector (no preselected student)', () => {
  it('shows a student dropdown when no student is preselected, and requires a selection', async () => {
    (studentsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [student()] });
    renderModal({ student: null });

    expect(await screen.findByText(/choose a student/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));
    expect(await screen.findByText(/please select a student/i)).toBeInTheDocument();
    expect(paymentsApi.create).not.toHaveBeenCalled();
  });

  it('does not show a student dropdown when a student is preselected', async () => {
    renderModal();

    await screen.findByRole('button', { name: 'Cash' });
    expect(screen.queryByText(/choose a student/i)).not.toBeInTheDocument();
  });
});
