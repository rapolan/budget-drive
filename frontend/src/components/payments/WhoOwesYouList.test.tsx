import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhoOwesYouList } from './WhoOwesYouList';
import { paymentsApi } from '@/api';
import type { WhoOwesYouRow } from '@/types';

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    paymentsApi: { ...actual.paymentsApi, getWhoOwesYou: vi.fn() },
  };
});

afterEach(cleanup);

function row(overrides: Partial<WhoOwesYouRow> = {}): WhoOwesYouRow {
  return {
    studentId: 'student-1',
    studentName: 'Owing Student',
    enrollmentId: 'enrollment-1',
    amountOwed: 250,
    oldestUnpaidLessonDate: '2026-06-01',
    ageBucket: '61+',
    lastPaymentDate: null,
    lastPaymentAmount: null,
    paymentArrangement: null,
    ...overrides,
  };
}

function renderList(onSelectStudent = vi.fn(), onRecordPayment = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <WhoOwesYouList onSelectStudent={onSelectStudent} onRecordPayment={onRecordPayment} />
    </QueryClientProvider>
  );
  return { onSelectStudent, onRecordPayment };
}

describe('WhoOwesYouList - row-level "Record payment" button (payments-actions, item 3)', () => {
  it('renders a visible "Record payment" button on each row', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [row({ studentId: 's1', studentName: 'Student One' }), row({ studentId: 's2', studentName: 'Student Two' })],
    });

    renderList();

    expect(await screen.findAllByRole('button', { name: /record payment/i })).toHaveLength(2);
  });

  it('clicking "Record payment" calls onRecordPayment with that row, not onSelectStudent', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [row()] });
    const { onSelectStudent, onRecordPayment } = renderList();

    const button = await screen.findByRole('button', { name: /record payment/i });
    fireEvent.click(button);

    expect(onRecordPayment).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'student-1' }));
    expect(onSelectStudent).not.toHaveBeenCalled();
  });

  it('clicking "Record payment" does not also trigger the row click (stopPropagation)', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [row()] });
    const { onSelectStudent, onRecordPayment } = renderList();

    const button = await screen.findByRole('button', { name: /record payment/i });
    fireEvent.click(button);

    expect(onRecordPayment).toHaveBeenCalledTimes(1);
    expect(onSelectStudent).not.toHaveBeenCalled();
  });

  it('clicking elsewhere in the row (not the button) still calls onSelectStudent', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [row()] });
    const { onSelectStudent, onRecordPayment } = renderList();

    const studentName = await screen.findByText('Owing Student');
    fireEvent.click(studentName);

    expect(onSelectStudent).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'student-1' }));
    expect(onRecordPayment).not.toHaveBeenCalled();
  });

  it('the row is keyboard-accessible (Enter triggers onSelectStudent)', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [row()] });
    const { onSelectStudent } = renderList();

    const rowEl = await screen.findByRole('button', { name: /owing student/i });
    fireEvent.keyDown(rowEl, { key: 'Enter' });

    expect(onSelectStudent).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'student-1' }));
  });
});

describe('WhoOwesYouList - unchanged existing behavior', () => {
  it('shows the empty state when nobody owes anything', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    renderList();

    expect(await screen.findByText('No outstanding balances right now.')).toBeInTheDocument();
  });

  it('still shows the age bucket and amount owed on each row', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [row()] });

    renderList();

    const rowEl = await screen.findByRole('button', { name: /owing student/i });
    expect(within(rowEl).getByText('61+ days')).toBeInTheDocument();
    expect(within(rowEl).getByText('$250.00')).toBeInTheDocument();
  });
});

describe('WhoOwesYouList - payment arrangement badge (payments-adjustments)', () => {
  it('shows the amber "Payment arrangement" badge instead of the red age-bucket badge when set', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        row({
          paymentArrangement: {
            setAt: '2026-08-01T00:00:00.000Z',
            setByName: 'Jane Admin',
            note: 'Paying $50/month',
          },
        }),
      ],
    });

    renderList();

    const rowEl = await screen.findByRole('button', { name: /owing student/i });
    expect(within(rowEl).getByText('Payment arrangement')).toBeInTheDocument();
    expect(within(rowEl).queryByText('61+ days')).not.toBeInTheDocument();
    // The amount owed still shows - an arrangement changes which badge
    // renders, never whether the amount itself is shown.
    expect(within(rowEl).getByText('$250.00')).toBeInTheDocument();
  });

  it('shows the normal red age-bucket badge when no arrangement is set', async () => {
    (paymentsApi.getWhoOwesYou as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [row({ paymentArrangement: null })],
    });

    renderList();

    const rowEl = await screen.findByRole('button', { name: /owing student/i });
    expect(within(rowEl).getByText('61+ days')).toBeInTheDocument();
    expect(within(rowEl).queryByText('Payment arrangement')).not.toBeInTheDocument();
  });
});
