import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentNeededBanner } from '../PaymentNeededBanner';
import type { Student } from '@/types';

afterEach(cleanup);

const getBookingEligibility = vi.fn();

vi.mock('@/api', () => ({
  enrollmentsApi: {
    getBookingEligibility: (...args: unknown[]) => getBookingEligibility(...args),
  },
}));

// PaymentModal itself is fully exercised by its own test file - here it's
// stubbed to a simple marker so this file can assert ONLY the banner's own
// show/hide/re-check logic without depending on PaymentModal's internals.
vi.mock('@/components/payments/PaymentModal', () => ({
  PaymentModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="payment-modal-stub">
        <button type="button" onClick={onClose}>Close payment modal</button>
      </div>
    ) : null,
}));

const STUDENT_WITH_ENROLLMENT: Student = {
  id: 'student-1',
  tenantId: 'tenant-1',
  fullName: 'Aisha Williams',
  email: 'aisha@example.com',
  activeEnrollment: { id: 'enrollment-1' },
} as unknown as Student;

function renderBanner(props: Partial<React.ComponentProps<typeof PaymentNeededBanner>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentNeededBanner student={STUDENT_WITH_ENROLLMENT} lessonCost={75} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  getBookingEligibility.mockReset();
});

describe('PaymentNeededBanner (payment-before-booking)', () => {
  it('shows the "Payment needed" banner with no dollar amounts when the check is not allowed', async () => {
    getBookingEligibility.mockResolvedValue({ data: { allowed: false, hasPaymentArrangement: false } });

    renderBanner();

    expect(await screen.findByText('Payment needed')).toBeInTheDocument();
    expect(screen.getByText('Record a payment to book this lesson.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /record payment/i })).toBeInTheDocument();
    // No dollar amounts anywhere in the banner.
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('shows nothing when the check is allowed (no arrangement)', async () => {
    getBookingEligibility.mockResolvedValue({ data: { allowed: true, hasPaymentArrangement: false } });

    renderBanner();

    await waitFor(() => expect(getBookingEligibility).toHaveBeenCalled());
    expect(screen.queryByText('Payment needed')).not.toBeInTheDocument();
    expect(screen.queryByText(/payment arrangement on file/i)).not.toBeInTheDocument();
  });

  it('shows the blue payment-arrangement note instead of the warning banner, and booking is implied to work (no blocking UI)', async () => {
    getBookingEligibility.mockResolvedValue({ data: { allowed: true, hasPaymentArrangement: true } });

    renderBanner();

    expect(await screen.findByText(/payment arrangement on file\. no payment is needed to book\./i)).toBeInTheDocument();
    expect(screen.queryByText('Payment needed')).not.toBeInTheDocument();
  });

  it('shows the arrangement note even when the underlying numbers would otherwise block (arrangement always wins)', async () => {
    // hasPaymentArrangement: true together with allowed: true is the only
    // shape the server ever sends for an arrangement (see
    // evaluateBookingEligibility - the arrangement branch returns before
    // credit is ever computed) - this test locks in that the banner reads
    // hasPaymentArrangement FIRST, matching that server-side precedence.
    getBookingEligibility.mockResolvedValue({ data: { allowed: true, hasPaymentArrangement: true } });

    renderBanner({ lessonCost: 999999 });

    expect(await screen.findByText(/payment arrangement on file/i)).toBeInTheDocument();
    expect(screen.queryByText('Payment needed')).not.toBeInTheDocument();
  });

  it('clicking "Record payment" opens PaymentModal, and closing it re-runs the eligibility check', async () => {
    getBookingEligibility
      .mockResolvedValueOnce({ data: { allowed: false, hasPaymentArrangement: false } })
      .mockResolvedValueOnce({ data: { allowed: true, hasPaymentArrangement: false } });

    renderBanner();

    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }));
    expect(screen.getByTestId('payment-modal-stub')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close payment modal/i }));

    await waitFor(() => expect(getBookingEligibility).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Payment needed')).not.toBeInTheDocument());
  });

  it('renders nothing (no query at all) when the student has no active enrollment', () => {
    const studentWithoutEnrollment = { ...STUDENT_WITH_ENROLLMENT, activeEnrollment: undefined } as Student;

    renderBanner({ student: studentWithoutEnrollment });

    expect(getBookingEligibility).not.toHaveBeenCalled();
    expect(screen.queryByText('Payment needed')).not.toBeInTheDocument();
  });
});
