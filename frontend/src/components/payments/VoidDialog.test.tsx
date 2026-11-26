import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoidDialog } from './VoidDialog';
import { paymentsApi } from '@/api';
import type { Payment } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    paymentsApi: { ...actual.paymentsApi, createAdjustment: vi.fn() },
  };
});

afterEach(cleanup);

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
    ...overrides,
  } as Payment;
}

function renderDialog(props: Partial<React.ComponentProps<typeof VoidDialog>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  const onOpenRefund = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <VoidDialog
        isOpen
        onClose={onClose}
        payment={payment()}
        remainingAmount={100}
        onOpenRefund={onOpenRefund}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onClose, onOpenRefund };
}

describe('VoidDialog', () => {
  it('has no amount field - the button states the full remaining amount', () => {
    renderDialog({ remainingAmount: 75 });
    expect(screen.queryByLabelText('Amount')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^void \$75\.00$/i })).toBeInTheDocument();
  });

  it('explains that a void cancels the full amount and points to Refund when money is going back', () => {
    renderDialog({ remainingAmount: 75 });
    expect(screen.getByText(/cancels the full remaining amount \(\$75\.00\)/i)).toBeInTheDocument();
    expect(screen.getByText(/use refund instead/i)).toBeInTheDocument();
  });

  it('clicking the "use Refund instead" link closes this dialog and opens the refund dialog', () => {
    const { onClose, onOpenRefund } = renderDialog();
    fireEvent.click(screen.getByText(/use refund instead/i));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenRefund).toHaveBeenCalled();
  });

  it('requires a note when the reason is "Other"', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'other' } });
    expect(screen.getByRole('button', { name: /^void \$/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'duplicate entry' } });
    expect(screen.getByRole('button', { name: /^void \$/i })).not.toBeDisabled();
  });

  it('submits a void adjustment ignoring any amount (there is none to send) and closes on success', async () => {
    (paymentsApi.createAdjustment as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    const { onClose } = renderDialog({ payment: payment({ id: 'payment-xyz' }), remainingAmount: 100 });

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'duplicate_payment' } });
    fireEvent.click(screen.getByRole('button', { name: /^void \$/i }));

    await waitFor(() =>
      expect(paymentsApi.createAdjustment).toHaveBeenCalledWith('payment-xyz', {
        adjustmentType: 'void',
        reasonCode: 'duplicate_payment',
        note: undefined,
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a server error message on failure and does not close', async () => {
    (paymentsApi.createAdjustment as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { error: 'This payment has already been fully refunded or voided' } },
    });
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /^void \$/i }));

    expect(await screen.findByText(/already been fully refunded or voided/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('heading', { name: 'Void' })).not.toBeInTheDocument();
  });
});
