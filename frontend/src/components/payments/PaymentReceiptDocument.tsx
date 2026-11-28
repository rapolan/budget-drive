import React from 'react';
import type { PaymentReceiptData } from '@/types';
import { formatMoney } from '@/utils/moneyFormat';
import { ADJUSTMENT_REASON_LABELS } from '@/utils/adjustmentReasons';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  credit: 'Card',
  debit: 'Card (debit)',
  stripe_card: 'Card (Stripe)',
  check: 'Check',
  paypal: 'PayPal',
  venmo: 'Venmo',
  zelle: 'Zelle',
  bsv: 'BSV',
  mnee: 'MNEE',
};

interface PaymentReceiptDocumentProps {
  receipt: PaymentReceiptData;
  businessName: string;
}

/**
 * The receipt document body itself - shared by the print page and (if a
 * future preview is added) any modal surface, same one-source-of-truth
 * pattern as CertificateDocument.tsx. receiptNumber is DERIVED (never
 * stored - see backend/src/services/receiptService.ts's own doc comment)
 * from the payment's own id, tenant-scoped; "Applied to" names the
 * enrollment/program only, never a specific lesson (no reliable, cheap
 * link exists today - see docs/ARCHITECTURE.md's payments-phase1 section).
 */
export const PaymentReceiptDocument: React.FC<PaymentReceiptDocumentProps> = ({ receipt, businessName }) => {
  return (
    <div className="rounded-xl border border-edge-glass/60 bg-surface p-8">
      <div className="text-center border-b border-edge pb-6 mb-6">
        <p className="text-lg font-semibold text-tx-primary">{businessName}</p>
        <h1 className="text-xl font-semibold text-tx-primary mt-2">Payment Receipt</h1>
        <p className="text-sm font-mono text-tx-muted mt-1">{receipt.receiptNumber}</p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Student</p>
          <p className="text-sm text-tx-primary">{receipt.studentName}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Date</p>
          <p className="text-sm text-tx-primary">{receipt.date}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Amount Received</p>
          <p className="text-sm text-tx-primary font-semibold">{formatMoney(receipt.amount)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Method</p>
          <p className="text-sm text-tx-primary">{METHOD_LABELS[receipt.paymentMethod] || receipt.paymentMethod}</p>
        </div>
        {receipt.referenceNumber && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Reference Number</p>
            <p className="text-sm text-tx-primary">{receipt.referenceNumber}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Applied To</p>
          <p className="text-sm text-tx-primary capitalize">{receipt.appliedToProgramType.replace(/_/g, ' ')}</p>
        </div>
      </div>

      {/* Refund/void lines (payments-adjustments) - red, with reason and
          a "Net paid" line, shown only on an adjusted payment. An
          unadjusted payment (the common case) renders exactly as it did
          before this phase - no empty section, no "Net paid" line equal
          to the amount already shown above. The receipt number itself
          never changes. */}
      {receipt.adjustments.length > 0 && (
        <div className="border-t border-edge pt-4 mb-4 space-y-1">
          {receipt.adjustments.map((adjustment, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-status-danger-text">
                {adjustment.adjustmentType === 'void' ? 'Voided' : 'Refunded'} -{' '}
                {ADJUSTMENT_REASON_LABELS[adjustment.reasonCode as keyof typeof ADJUSTMENT_REASON_LABELS] ?? adjustment.reasonCode}
                {' '}({adjustment.createdAt})
              </span>
              <span className="text-status-danger-text font-medium">-{formatMoney(adjustment.amount)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-1 border-t border-edge mt-2">
            <span className="text-tx-primary font-semibold">Net paid</span>
            <span className="text-tx-primary font-semibold">{formatMoney(receipt.netPaid)}</span>
          </div>
        </div>
      )}

      <div className="border-t border-edge pt-4 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-tx-secondary">Total paid on this enrollment</span>
          <span className="text-tx-primary font-medium">{formatMoney(receipt.enrollmentTotalPaid)}</span>
        </div>
        {receipt.enrollmentOutstandingBalance !== null && receipt.enrollmentOutstandingBalance > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-tx-secondary">Remaining balance owed</span>
            <span className="text-status-danger-text font-medium">
              {formatMoney(receipt.enrollmentOutstandingBalance)}
            </span>
          </div>
        )}
        {receipt.enrollmentCreditBalance !== null && receipt.enrollmentCreditBalance > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-tx-secondary">Remaining credit</span>
            <span className="text-primary font-medium">{formatMoney(receipt.enrollmentCreditBalance)}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-tx-muted text-center mt-8">
        Receipt {receipt.receiptNumber} - an internal digital record of this payment.
      </p>
    </div>
  );
};
