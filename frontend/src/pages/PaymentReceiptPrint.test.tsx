import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PaymentReceiptPrintPage } from './PaymentReceiptPrint';
import { paymentsApi } from '@/api';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    paymentsApi: { ...actual.paymentsApi, getReceipt: vi.fn() },
  };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ settings: { businessName: 'Test Driving School' } }),
}));

afterEach(cleanup);

function renderPrintPage(paymentId = 'payment-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/payments/${paymentId}/receipt`]}>
        <Routes>
          <Route path="/payments/:id/receipt" element={<PaymentReceiptPrintPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PaymentReceiptPrintPage', () => {
  it('renders the receipt number, student, amount, method, and "Applied To" program, with the tenant business name', async () => {
    (paymentsApi.getReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        paymentId: 'payment-1',
        receiptNumber: 'BDP-ABC1234567',
        date: '2026-08-10',
        studentId: 'student-1',
        studentName: 'Jane Doe',
        amount: 75,
        paymentMethod: 'cash',
        referenceNumber: null,
        appliedToProgramType: 'driver_training',
        enrollmentTotalPaid: 150,
        enrollmentOutstandingBalance: 25,
        enrollmentCreditBalance: null,
      },
    });

    renderPrintPage();

    expect(await screen.findByText('Test Driving School')).toBeInTheDocument();
    expect(screen.getByText('BDP-ABC1234567')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('driver training')).toBeInTheDocument();
    expect(screen.getByText('Remaining balance owed')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    // Never claims a specific lesson.
    expect(screen.queryByText(/lesson #/i)).not.toBeInTheDocument();
  });

  it('shows remaining credit instead of a balance when the enrollment is overpaid', async () => {
    (paymentsApi.getReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        paymentId: 'payment-1',
        receiptNumber: 'BDP-ABC1234567',
        date: '2026-08-10',
        studentId: 'student-1',
        studentName: 'Jane Doe',
        amount: 300,
        paymentMethod: 'cash',
        referenceNumber: null,
        appliedToProgramType: 'driver_training',
        enrollmentTotalPaid: 300,
        enrollmentOutstandingBalance: 0,
        enrollmentCreditBalance: 75,
      },
    });

    renderPrintPage();

    await waitFor(() => expect(screen.getByText('Remaining credit')).toBeInTheDocument());
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.queryByText('Remaining balance owed')).not.toBeInTheDocument();
  });

  it('calls getReceipt with the id from the route params', async () => {
    (paymentsApi.getReceipt as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        paymentId: 'payment-xyz',
        receiptNumber: 'BDP-XYZ',
        date: '2026-08-10',
        studentId: 'student-1',
        studentName: 'Jane Doe',
        amount: 50,
        paymentMethod: 'cash',
        referenceNumber: null,
        appliedToProgramType: 'driver_training',
        enrollmentTotalPaid: 50,
        enrollmentOutstandingBalance: null,
        enrollmentCreditBalance: null,
      },
    });

    renderPrintPage('payment-xyz');

    await waitFor(() => expect(paymentsApi.getReceipt).toHaveBeenCalledWith('payment-xyz'));
  });
});
