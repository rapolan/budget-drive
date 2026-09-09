import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentModal } from './PaymentModal';
import { paymentsApi, studentsApi } from '@/api';
import type { Student } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    paymentsApi: {
      ...actual.paymentsApi,
      create: vi.fn(),
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
});

afterEach(cleanup);

describe('PaymentModal - smart amount pre-fill (item 1)', () => {
  it('defaults the amount to the selected student\'s outstandingBalance', async () => {
    renderModal();

    const amountInput = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement;
    expect(amountInput.value).toBe('70');
    expect(screen.getByText(/pre-filled from outstanding balance/i)).toBeInTheDocument();
  });

  it('remains fully editable and the pre-fill caption disappears once edited', async () => {
    renderModal();

    const amountInput = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '25' } });

    expect(amountInput.value).toBe('25');
    expect(screen.queryByText(/pre-filled from outstanding balance/i)).not.toBeInTheDocument();
  });
});

describe('PaymentModal - method chips (item 2)', () => {
  it('defaults to Card selected', async () => {
    renderModal();

    const cardChip = await screen.findByRole('button', { name: 'Card' });
    expect(cardChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows BSV/MNEE locked (disabled, lock icon) when enableBlockchainPayments is false', async () => {
    mockEnableBlockchainPayments = false;
    renderModal();

    const bsvChip = await screen.findByRole('button', { name: /bsv/i });
    expect(bsvChip).toBeDisabled();
  });

  it('shows BSV/MNEE unlocked and selectable when enableBlockchainPayments is true', async () => {
    mockEnableBlockchainPayments = true;
    renderModal();

    const bsvChip = await screen.findByRole('button', { name: /bsv/i });
    expect(bsvChip).not.toBeDisabled();

    fireEvent.click(bsvChip);
    expect(bsvChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a chip switches the selected method', async () => {
    renderModal();

    const venmoChip = await screen.findByRole('button', { name: 'Venmo' });
    fireEvent.click(venmoChip);

    expect(venmoChip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('PaymentModal - live running-balance preview (item 4)', () => {
  it('shows the new balance updating live as amount changes', async () => {
    renderModal();

    const amountInput = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement;
    expect(screen.getByText('$0.00')).toBeInTheDocument(); // 70 - 70 = 0

    fireEvent.change(amountInput, { target: { value: '20' } });
    expect(screen.getByText('$50.00')).toBeInTheDocument(); // 70 - 20 = 50
  });

  it('shows overpayment as a credit, not floored at $0.00', async () => {
    renderModal();

    const amountInput = (await screen.findByPlaceholderText('0.00')) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '90' } });

    expect(screen.getByText('$20.00 credit')).toBeInTheDocument();
  });
});

describe('PaymentModal - reference number field (item 3)', () => {
  it('submits the entered reference number to paymentsApi.create', async () => {
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    renderModal();

    fireEvent.change(await screen.findByPlaceholderText(/square receipt/i), {
      target: { value: 'VENMO-4521' },
    });
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() =>
      expect(paymentsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ referenceNumber: 'VENMO-4521' })
      )
    );
  });
});

describe('PaymentModal - double-submission guard (item 5)', () => {
  it('disables the confirm button while the mutation is pending', async () => {
    let resolveCreate: (v: any) => void = () => {};
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    renderModal();

    const confirmBtn = screen.getByRole('button', { name: /record payment/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(confirmBtn).toBeDisabled());
    expect(paymentsApi.create).toHaveBeenCalledTimes(1);

    // A second click while pending must not fire a second create call.
    fireEvent.click(confirmBtn);
    expect(paymentsApi.create).toHaveBeenCalledTimes(1);

    resolveCreate({ data: {} });
  });
});

describe('PaymentModal - success feedback (item 6)', () => {
  it('calls onClose once the payment is recorded successfully', async () => {
    const onClose = vi.fn();
    (paymentsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    renderModal({ onClose });

    fireEvent.click(screen.getByRole('button', { name: /record payment/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
