import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefundDialog } from './RefundDialog';
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

function renderDialog(props: Partial<React.ComponentProps<typeof RefundDialog>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <RefundDialog
        isOpen
        onClose={onClose}
        payment={payment()}
        remainingAmount={100}
        studentName="Jane Doe"
        {...props}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

describe('RefundDialog', () => {
  it('defaults the amount to the full remaining amount', async () => {
    renderDialog({ remainingAmount: 60 });
    const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amountInput.value).toBe('60');
  });

  it('shows what is already refunded when the remaining amount is less than the payment amount', () => {
    renderDialog({ payment: payment({ amount: 100 }), remainingAmount: 60 });
    expect(screen.getByText(/40\.00 already refunded/)).toBeInTheDocument();
  });

  it('caps the amount at the remaining amount and shows an error when exceeded', () => {
    renderDialog({ remainingAmount: 50 });
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.change(amountInput, { target: { value: '51' } });
    expect(screen.getByText(/cannot exceed the remaining amount/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refund \$51\.00/i })).toBeDisabled();
  });

  it('requires a note when the reason is "Other"', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'other' } });
    expect(screen.getByRole('button', { name: /^refund \$/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'customer called' } });
    expect(screen.getByRole('button', { name: /^refund \$/i })).not.toBeDisabled();
  });

  it('submits with the entered amount and reason, and closes on success', async () => {
    (paymentsApi.createAdjustment as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    const { onClose } = renderDialog({ payment: payment({ id: 'payment-xyz' }), remainingAmount: 100 });

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'duplicate_payment' } });
    fireEvent.click(screen.getByRole('button', { name: /refund \$40\.00/i }));

    await waitFor(() =>
      expect(paymentsApi.createAdjustment).toHaveBeenCalledWith('payment-xyz', {
        adjustmentType: 'refund',
        amount: 40,
        reasonCode: 'duplicate_payment',
        note: undefined,
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a server error message on failure and does not close', async () => {
    (paymentsApi.createAdjustment as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { error: 'Refund amount exceeds the remaining unadjusted amount' } },
    });
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /^refund \$/i }));

    expect(await screen.findByText(/exceeds the remaining unadjusted amount/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explains that the original payment stays on record', () => {
    renderDialog({ studentName: 'Pat Taylor' });
    expect(screen.getByText(/stays on record exactly as it is/i)).toBeInTheDocument();
    expect(screen.getByText(/Pat Taylor/)).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('heading', { name: 'Refund' })).not.toBeInTheDocument();
  });
});
