import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentHistoryModal } from './PaymentHistoryModal';
import { paymentsApi } from '@/api';
import type { Student, Payment } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    paymentsApi: { ...actual.paymentsApi, getByStudent: vi.fn() },
  };
});

afterEach(cleanup);

const STUDENT: Student = {
  id: 'student-1',
  tenantId: 'tenant-1',
  fullName: 'Test Student',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
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
    ...overrides,
  } as Payment;
}

function renderModal(isOpen = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <PaymentHistoryModal isOpen={isOpen} onClose={onClose} student={STUDENT} />
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

describe('PaymentHistoryModal - receipt icon (payments-phase1, item 5)', () => {
  it('renders a receipt button per payment that opens the print route in a new tab', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'payment-abc' })],
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderModal();
    const receiptButton = await screen.findByRole('button', { name: /print receipt/i });
    fireEvent.click(receiptButton);

    expect(windowOpenSpy).toHaveBeenCalledWith('/payments/payment-abc/receipt', '_blank', 'noopener');
    windowOpenSpy.mockRestore();
  });

  it('renders one receipt button per payment row', async () => {
    (paymentsApi.getByStudent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [payment({ id: 'p1' }), payment({ id: 'p2' })],
    });

    renderModal();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /print receipt/i })).toHaveLength(2));
  });
});
