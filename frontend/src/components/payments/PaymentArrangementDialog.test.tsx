import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentArrangementDialog } from './PaymentArrangementDialog';
import { enrollmentsApi } from '@/api';
import type { PaymentArrangement } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    enrollmentsApi: {
      ...actual.enrollmentsApi,
      setPaymentArrangement: vi.fn(),
      clearPaymentArrangement: vi.fn(),
    },
  };
});

afterEach(cleanup);

function renderDialog(props: Partial<React.ComponentProps<typeof PaymentArrangementDialog>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <PaymentArrangementDialog
        isOpen
        onClose={onClose}
        enrollmentId="enrollment-1"
        current={null}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

describe('PaymentArrangementDialog', () => {
  it('toggle starts unchecked when nothing is currently set', () => {
    renderDialog({ current: null });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument();
  });

  it('toggle starts checked, and the note pre-fills, when an arrangement already exists', () => {
    const current: PaymentArrangement = {
      enrollmentId: 'enrollment-1',
      setAt: '2026-08-01T00:00:00.000Z',
      setBy: 'user-1',
      setByName: 'Jane Admin',
      note: 'Paying $50/month',
    };
    renderDialog({ current });
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByLabelText(/note/i)).toHaveValue('Paying $50/month');
    expect(screen.getByText(/Jane Admin/)).toBeInTheDocument();
  });

  it('turning the toggle on reveals the note field', () => {
    renderDialog({ current: null });
    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
  });

  it('saving with the toggle on calls setPaymentArrangement with the note', async () => {
    (enrollmentsApi.setPaymentArrangement as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    const { onClose } = renderDialog({ enrollmentId: 'enrollment-xyz', current: null });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'Paying biweekly' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(enrollmentsApi.setPaymentArrangement).toHaveBeenCalledWith('enrollment-xyz', 'Paying biweekly')
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('saving with the toggle off (clearing an existing arrangement) calls clearPaymentArrangement', async () => {
    (enrollmentsApi.clearPaymentArrangement as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });
    const current: PaymentArrangement = {
      enrollmentId: 'enrollment-xyz',
      setAt: '2026-08-01T00:00:00.000Z',
      setBy: 'user-1',
      setByName: 'Jane Admin',
      note: null,
    };
    const { onClose } = renderDialog({ enrollmentId: 'enrollment-xyz', current });

    fireEvent.click(screen.getByRole('checkbox')); // turn off
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(enrollmentsApi.clearPaymentArrangement).toHaveBeenCalledWith('enrollment-xyz'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a server error message on failure and does not close', async () => {
    (enrollmentsApi.setPaymentArrangement as ReturnType<typeof vi.fn>).mockRejectedValue({
      response: { data: { error: 'Only an owner or admin can set a payment arrangement.' } },
    });
    const { onClose } = renderDialog({ current: null });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/only an owner or admin/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('heading', { name: 'Payment Arrangement' })).not.toBeInTheDocument();
  });

  it('renders nothing when no enrollmentId is given', () => {
    renderDialog({ enrollmentId: null });
    expect(screen.queryByRole('heading', { name: 'Payment Arrangement' })).not.toBeInTheDocument();
  });
});
