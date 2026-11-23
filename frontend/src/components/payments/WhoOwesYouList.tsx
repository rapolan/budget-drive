import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, DollarSign } from 'lucide-react';
import { paymentsApi } from '@/api';
import type { WhoOwesYouRow } from '@/types';
import { formatMoney } from '@/utils/moneyFormat';

interface WhoOwesYouListProps {
  // Opens that student's existing PaymentHistoryModal (Payments.tsx
  // already owns one) - there is no standalone student-detail route in
  // this app to navigate to (/students is a list page only), so "link
  // each row to that student's payment history" means opening the
  // existing modal, not a page navigation.
  onSelectStudent: (row: WhoOwesYouRow) => void;
  // Opens PaymentModal pre-filled for this row's student, without going
  // through the history modal first (payments-actions, item 3) - a
  // visible, row-level action for the exact list whose entire purpose is
  // "here's who to collect from."
  onRecordPayment: (row: WhoOwesYouRow) => void;
}

const AGE_BUCKET_LABELS: Record<string, string> = {
  '0-30': '0-30 days',
  '31-60': '31-60 days',
  '61+': '61+ days',
};

const AGE_BUCKET_STYLES: Record<string, string> = {
  '0-30': 'bg-status-info-bg text-status-info-text border-status-info-border',
  '31-60': 'bg-status-warning-bg text-status-warning-text border-status-warning-border',
  '61+': 'bg-status-danger-bg text-status-danger-text border-status-danger-border',
};

/**
 * "Who owes you" - enrollments with a positive outstanding balance, aged
 * by the oldest COMPLETED (already-happened) lesson, not by when the
 * balance first appeared (there's no row recording that - see
 * paymentReportingService.getWhoOwesYou's own doc comment for the exact
 * derivation, restated here for anyone reading just this component).
 * Each row also shows the student's last payment date/amount, so an
 * installment payer doesn't read as identical to someone who hasn't paid
 * in months - both can show the same amount owed, but one has a recent
 * last-payment date and the other doesn't.
 */
export const WhoOwesYouList: React.FC<WhoOwesYouListProps> = ({ onSelectStudent, onRecordPayment }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['payments', 'who-owes-you'],
    queryFn: () => paymentsApi.getWhoOwesYou(),
  });

  const rows = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
        <p className="text-sm text-tx-muted">Loading...</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
        <h3 className="text-sm font-semibold text-tx-primary mb-2">Who Owes You</h3>
        <p className="text-sm text-tx-muted">No outstanding balances right now.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
      <h3 className="text-sm font-semibold text-tx-primary mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-status-warning-text" />
        Who Owes You
      </h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.enrollmentId}
            role="button"
            tabIndex={0}
            aria-label={`View payment history for ${row.studentName}`}
            onClick={() => onSelectStudent(row)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectStudent(row);
              }
            }}
            className="w-full flex items-center justify-between gap-3 rounded-lg border border-edge p-3 text-left hover:bg-surface2 transition-colors cursor-pointer"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-tx-primary truncate">{row.studentName}</p>
              <p className="text-xs text-tx-muted mt-0.5">
                {row.lastPaymentDate
                  ? `Last paid ${formatMoney(row.lastPaymentAmount ?? 0)} on ${row.lastPaymentDate}`
                  : 'No payments on file'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${AGE_BUCKET_STYLES[row.ageBucket]}`}
              >
                {AGE_BUCKET_LABELS[row.ageBucket]}
              </span>
              <span className="text-sm font-semibold text-status-danger-text">
                {formatMoney(row.amountOwed)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecordPayment(row);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:brightness-90 transition-all"
                title={`Record a payment from ${row.studentName}`}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Record payment
              </button>
              {/* Reserved for phase 2 refund/void actions (payments-actions,
                  item 6) - deliberately not built here, just a layout slot
                  so adding them later doesn't require re-flowing this row. */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
