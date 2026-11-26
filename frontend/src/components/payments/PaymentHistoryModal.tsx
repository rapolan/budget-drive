import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, DollarSign, Calendar, CreditCard, FileText, Mail, Phone, UserCircle, Wallet, AlertTriangle, Undo2, Handshake } from 'lucide-react';
import { paymentsApi } from '@/api';
import type { Student, Payment } from '@/types';
import { formatMoney } from '@/utils/moneyFormat';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentRowMenu } from './PaymentRowMenu';
import { RefundDialog } from './RefundDialog';
import { VoidDialog } from './VoidDialog';
import { PaymentArrangementDialog } from './PaymentArrangementDialog';
import { ADJUSTMENT_REASON_LABELS } from '@/utils/adjustmentReasons';

interface PaymentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  // Opens the existing PaymentModal for this same student, pre-filled
  // from their current outstandingBalance (payments-actions, item 1) -
  // PaymentModal itself is unchanged, this just gives this read-only
  // modal a way to hand off to it. Omitted entirely in a context that has
  // no payment-recording ability of its own, rather than every caller
  // needing to pass a no-op.
  onRecordPayment?: () => void;
  // "A link to the student's record" (item 4) - Students.tsx owns the
  // actual record view (StudentModal); this modal only knows the
  // student's id, so the caller decides how "viewing the record" is
  // reached (Payments.tsx navigates to /students with a deep-link state).
  onViewStudentRecord?: (studentId: string) => void;
}

// "Applied To" (payments-phase1, item 7) shows the enrollment's PROGRAM
// only (driver_training/driver_education), via payment.programType - a
// plain additive JOIN column on the existing payments/enrollments query,
// cheap to derive. It deliberately never names a specific lesson: no
// reliable, cheap link from a payment to the lesson(s) it covered exists
// today (payments.related_lesson_ids/invoice_id are real columns but are
// never read or written anywhere in this codebase - see
// docs/ARCHITECTURE.md's payments-phase1 section). Guessing one via a
// heuristic (amount/date matching, FIFO against unpaid lessons) would read
// as fact on a record headed for the ledger - not done here.
export const PaymentHistoryModal: React.FC<PaymentHistoryModalProps> = ({
  isOpen,
  onClose,
  student,
  onRecordPayment,
  onViewStudentRecord,
}) => {
  const { user } = useAuth();
  // Refund/void are owner/admin only (payments-adjustments, explicit
  // design decision) - checked here only to decide whether to SHOW the
  // menu options at all; the backend re-checks independently on every
  // request (requireRole's own DB lookup), so this is a UX convenience,
  // never the actual security boundary.
  const canAdjust = user?.role === 'owner' || user?.role === 'admin';

  const [refundingPayment, setRefundingPayment] = useState<Payment | null>(null);
  const [voidingPayment, setVoidingPayment] = useState<Payment | null>(null);
  const [arrangementOpen, setArrangementOpen] = useState(false);

  // Fetch payment history for this student
  const { data: paymentsData, isLoading, error } = useQuery({
    queryKey: ['payments', 'student', student?.id],
    queryFn: () => paymentsApi.getByStudent(student!.id),
    enabled: !!student?.id && isOpen,
  });

  const payments = paymentsData?.data || [];

  if (!isOpen) return null;

  // Same paymentSummary the rest of the Payments page already reads -
  // one calculation (student.paymentSummary, combined BTW+DE server-side
  // by studentService's combinePaymentSummaries), not a second one
  // invented for this modal (payments-actions, item 2).
  const summary = student?.paymentSummary;
  const totalPaid = summary?.totalPaid ?? 0;
  const outstandingBalance = summary?.outstandingBalance ?? 0;
  const creditBalance = summary?.creditBalance ?? 0;
  const totalDue = totalPaid + outstandingBalance;

  // Matches the real payment_method CHECK constraint
  // (backend/database/migrations/001_baseline.sql, widened additively by
  // 030_widen_payment_method_check.sql) - the values the Add Payment
  // modal's method chips actually persist.
  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
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
    return labels[method] || method;
  };

  const getPaymentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      lesson_payment: 'Lesson Payment',
      package_payment: 'Package Payment',
      registration_fee: 'Registration Fee',
      exam_fee: 'Exam Fee',
      other: 'Other',
    };
    return labels[type] || type;
  };

  // Payments-adjustments: for a confirmed payment, the chip now shows the
  // DERIVED status (Paid/Partly refunded/Refunded/Voided) from
  // payment.displayStatus, not the raw payments.status column, which is
  // never flipped by a refund/void anymore. pending/failed payments have
  // no adjustments to derive from - they keep showing their own raw
  // status exactly as before.
  const getDisplayLabel = (payment: Payment): string => {
    if (payment.status === 'confirmed' && payment.displayStatus) {
      const labels: Record<string, string> = {
        paid: 'Paid',
        partly_refunded: 'Partly refunded',
        refunded: 'Refunded',
        voided: 'Voided',
      };
      return labels[payment.displayStatus] ?? payment.displayStatus;
    }
    return payment.status;
  };

  const getStatusBadge = (payment: Payment): string => {
    const label = payment.status === 'confirmed' ? payment.displayStatus ?? 'paid' : payment.status;
    switch (label) {
      case 'paid':
        return 'bg-status-success-bg text-status-success-text';
      case 'pending':
        return 'bg-status-warning-bg text-status-warning-text';
      case 'failed':
        return 'bg-status-danger-bg text-status-danger-text';
      case 'partly_refunded':
        return 'bg-status-warning-bg text-status-warning-text';
      case 'refunded':
        return 'bg-surface2 text-tx-primary';
      case 'voided':
        return 'bg-surface2 text-tx-muted line-through decoration-2';
      default:
        return 'bg-surface2 text-tx-primary';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal - widened from max-w-4xl (payment-history-layout) so the
            merged 7-column table (Date/Type+Applied To/Method/Amount/
            Status/Details/Actions) fits without horizontal scrolling at
            typical desktop widths; max-w-6xl is comfortably under 1280px's
            viewport once the p-4 page padding and the modal's own px-6 are
            subtracted, and leaves headroom at 1440px too. */}
        <div className="relative w-full max-w-4xl lg:max-w-6xl rounded-lg bg-surface shadow-xl">
          {/* Header - below sm, the Set arrangement/Record payment actions
              wrap onto their own row instead of sharing one line with the
              title and getting clipped past the right edge
              (payment-history-layout review fix, checked at 360-390px).
              Close (X) always stays in the title row, at every width - it's
              the one piece of chrome a user always needs reachable without
              hunting through whichever action buttons happen to be
              present. */}
          <div className="flex flex-col gap-3 border-b border-edge px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="h-6 w-6 flex-shrink-0 text-primary" />
                  <h2 className="text-xl font-semibold text-tx-primary">Payment History</h2>
                  {/* "On a payment arrangement" badge (payments-adjustments) -
                      informational only, no booking-rule behavior reads this.
                      Clickable (owner/admin only) to open the arrangement
                      dialog and edit/clear it. */}
                  {student?.activeEnrollment?.paymentArrangementSetAt && (
                    canAdjust ? (
                      <button
                        type="button"
                        onClick={() => setArrangementOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-status-warning-border bg-status-warning-bg px-2.5 py-0.5 text-xs font-medium text-status-warning-text hover:brightness-95 transition-all"
                      >
                        <Handshake className="h-3 w-3" />
                        Payment arrangement
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-status-warning-border bg-status-warning-bg px-2.5 py-0.5 text-xs font-medium text-status-warning-text">
                        <Handshake className="h-3 w-3" />
                        Payment arrangement
                      </span>
                    )
                  )}
                </div>
                {student && (
                  <p className="mt-1 text-sm text-tx-secondary">{student.fullName}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 rounded-lg p-1 text-tx-muted hover:bg-surface2 hover:text-tx-muted sm:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {student?.activeEnrollment && canAdjust && !student.activeEnrollment.paymentArrangementSetAt && (
                <button
                  type="button"
                  onClick={() => setArrangementOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-edge-strong px-3 py-1.5 text-sm font-medium text-tx-secondary hover:bg-surface2 transition-all sm:justify-start"
                >
                  <Handshake className="h-4 w-4" />
                  Set arrangement
                </button>
              )}
              {student && onRecordPayment && (
                <button
                  type="button"
                  onClick={onRecordPayment}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:brightness-90 transition-all sm:justify-start"
                >
                  <DollarSign className="h-4 w-4" />
                  Record payment
                </button>
              )}
              <button
                onClick={onClose}
                className="hidden flex-shrink-0 rounded-lg p-1 text-tx-muted hover:bg-surface2 hover:text-tx-muted sm:block"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {/* Contact + record link (item 4) - same direct student.email/
                student.phone fields the rest of this page already renders
                (Payments.tsx's own table/card contact column), not the
                guardian-fallback helper Students.tsx uses elsewhere, to
                stay consistent with how this page already shows contact
                info everywhere else on it. */}
            {student && (
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {student.email && (
                  <a href={`mailto:${student.email}`} className="flex items-center gap-1.5 text-tx-secondary hover:text-primary">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    {student.email}
                  </a>
                )}
                {student.phone && (
                  <a href={`tel:${student.phone}`} className="flex items-center gap-1.5 text-tx-secondary hover:text-primary">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    {student.phone}
                  </a>
                )}
                {!student.email && !student.phone && (
                  <span className="text-tx-muted">No contact on file</span>
                )}
                {onViewStudentRecord && (
                  <button
                    type="button"
                    onClick={() => onViewStudentRecord(student.id)}
                    className="flex items-center gap-1.5 text-tx-secondary hover:text-primary"
                  >
                    <UserCircle className="h-4 w-4 flex-shrink-0" />
                    View student record
                  </button>
                )}
              </div>
            )}

            {/* Summary strip (item 2) - total due, total paid, outstanding
                balance, and "paid, not yet scheduled" (only when above
                zero, matching the per-student table/card treatment on the
                page itself) - all from student.paymentSummary, the one
                calculation the whole Payments page already shares. */}
            {student && (
              <div className={`mb-6 grid gap-4 ${creditBalance > 0 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                <div className="rounded-lg bg-status-info-bg p-4">
                  <p className="text-sm font-medium text-tx-secondary">Total Due</p>
                  <p className="mt-1 text-2xl font-bold text-tx-primary">
                    {formatMoney(totalDue)}
                  </p>
                </div>
                <div className="rounded-lg bg-status-info-bg p-4">
                  <p className="text-sm font-medium text-tx-secondary">Total Paid</p>
                  <p className="mt-1 text-2xl font-bold text-status-success-text">
                    {formatMoney(totalPaid)}
                  </p>
                </div>
                <div className="rounded-lg bg-status-info-bg p-4">
                  <p className="text-sm font-medium text-tx-secondary">Outstanding</p>
                  <p className="mt-1 text-2xl font-bold text-status-danger-text">
                    {formatMoney(outstandingBalance)}
                  </p>
                </div>
                {creditBalance > 0 && (
                  <div className="rounded-lg bg-status-info-bg p-4">
                    <p className="text-sm font-medium text-tx-secondary flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5" />
                      Paid, Not Yet Scheduled
                    </p>
                    <p className="mt-1 text-2xl font-bold text-primary">
                      {formatMoney(creditBalance)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {student && (
              <p className="mb-6 text-sm text-tx-secondary">
                {payments.length} {payments.length === 1 ? 'payment' : 'payments'} on file
              </p>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="rounded-md bg-status-danger-bg p-4">
                <p className="text-sm text-status-danger-text">
                  Failed to load payment history. Please try again.
                </p>
              </div>
            )}

            {/* Payment List */}
            {!isLoading && !error && (
              <>
                {payments.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-edge-strong py-12 text-center">
                    <DollarSign className="mx-auto h-12 w-12 text-tx-muted" />
                    <p className="mt-2 text-sm text-tx-secondary">No payments recorded yet</p>
                  </div>
                ) : (
                  <>
                    {/* Table - sm and up (payment-history-layout). Below
                        sm, 7 tight columns don't fit any reasonable phone
                        viewport, so a stacked card list renders instead
                        (below). PaymentRowMenu's own dropdown is portaled
                        to document.body (payment-history-layout review
                        fix), so it's no longer clipped by this table's
                        overflow-x-auto wrapper at any width. */}
                    <div className="hidden sm:block overflow-hidden rounded-lg border border-edge">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-edge">
                          <thead className="bg-surface2">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                                Date
                              </th>
                              {/* Type + Applied To merged (payment-history-layout)
                                  - "Lesson Payment" with the program as a
                                  smaller second line, instead of two
                                  separate columns. Applied To stays
                                  program-level only, never a specific
                                  lesson - see this component's own doc
                                  comment above for why. */}
                              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                                Type
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                                Method
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-tx-muted">
                                Amount
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-tx-muted">
                                Status
                              </th>
                              {/* Reference # + Notes merged into one
                                  "Details" column (payment-history-layout) -
                                  single truncated line, full text on
                                  hover/keyboard focus via title. */}
                              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                                Details
                              </th>
                              {/* Sticky right (payment-history-layout) - the
                                  row menu (Print receipt/Refund/Void) used
                                  to scroll off the right edge of the modal
                                  with the rest of the table; pinning this
                                  column keeps it reachable without
                                  horizontal scrolling. bg-surface2 (matching
                                  thead's own background) keeps scrolled
                                  header content from showing through
                                  underneath it; the body cells below repeat
                                  that background against bg-surface/the
                                  hover and adjustment-row tints so the same
                                  thing holds for data rows. */}
                              <th className="sticky right-0 bg-surface2 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-tx-muted">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-edge bg-surface">
                            {payments.map((payment) => {
                              // Refund/void are only ever offered for a
                              // confirmed payment with something left to
                              // adjust (payments-adjustments: "only confirmed
                              // payments can be adjusted", enforced again
                              // server-side regardless of what's shown here).
                              const remaining = payment.netPaid ?? Number(payment.amount);
                              const canOfferAdjustment = canAdjust && payment.status === 'confirmed' && remaining > 0;
                              const isVoided = payment.displayStatus === 'voided';
                              const details = [payment.referenceNumber, payment.notes].filter(Boolean).join(' - ');

                              return (
                                <React.Fragment key={payment.id}>
                                  <tr className="group hover:bg-surface2">
                                    <td className="whitespace-nowrap px-4 py-3">
                                      <div className="flex items-center gap-2 text-sm text-tx-primary">
                                        <Calendar className="h-4 w-4 text-tx-muted" />
                                        {new Date(payment.date).toLocaleDateString()}
                                      </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3">
                                      <div className="text-sm text-tx-primary">
                                        {getPaymentTypeLabel(payment.paymentType)}
                                      </div>
                                      {payment.programType && (
                                        <div className="text-xs text-tx-muted capitalize">
                                          {payment.programType.replace(/_/g, ' ')}
                                        </div>
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3">
                                      <div className="flex items-center gap-2 text-sm text-tx-primary">
                                        <CreditCard className="h-4 w-4 text-tx-muted" />
                                        {getPaymentMethodLabel(payment.paymentMethod)}
                                      </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-right">
                                      <div
                                        className={`text-sm font-semibold ${
                                          isVoided ? 'text-tx-muted line-through' : 'text-status-success-text'
                                        }`}
                                      >
                                        {formatMoney(Number(payment.amount))}
                                      </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3 text-center">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(payment)}`}
                                      >
                                        {getDisplayLabel(payment)}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-[12rem]">
                                      {details ? (
                                        <div
                                          className="truncate text-sm text-tx-muted"
                                          title={details}
                                          tabIndex={0}
                                        >
                                          {details}
                                        </div>
                                      ) : (
                                        <div className="text-sm text-tx-muted">-</div>
                                      )}
                                    </td>
                                    <td className="sticky right-0 whitespace-nowrap bg-surface px-4 py-3 text-center group-hover:bg-surface2">
                                      <PaymentRowMenu
                                        onPrintReceipt={() =>
                                          window.open(`/payments/${payment.id}/receipt`, '_blank', 'noopener')
                                        }
                                        onRefund={canOfferAdjustment ? () => setRefundingPayment(payment) : undefined}
                                        onVoid={canOfferAdjustment ? () => setVoidingPayment(payment) : undefined}
                                      />
                                    </td>
                                  </tr>
                                  {/* Adjustment lines (payments-adjustments) -
                                      indented under their payment, refunds in
                                      red with reason and who, voided amounts
                                      struck through. The sticky Actions column
                                      has no action here, but still needs its
                                      own sticky+bg cell so the column's
                                      background stays continuous down the
                                      table instead of showing a gap. */}
                                  {(payment.adjustments ?? []).map((adjustment) => (
                                    // The tint used to live on the <tr> itself
                                    // (bg-surface2/50) with the sticky cell
                                    // repeating the same translucent class on
                                    // top of it (payment-history-layout review
                                    // fix) - position: sticky needs its own
                                    // opaque-enough backdrop to stay readable
                                    // over scrolled content, so that cell was
                                    // PAINTING ITS OWN COPY of the tint
                                    // on top of the row's copy, stacking two
                                    // semi-transparent layers into a visibly
                                    // darker patch than the rest of the row's
                                    // single layer. Moving bg-surface2/50 onto
                                    // every <td> individually (sticky or not)
                                    // means each cell paints the exact same
                                    // one layer, so the sticky cell can no
                                    // longer visibly differ from its row.
                                    <tr key={adjustment.id}>
                                      <td colSpan={3} className="bg-surface2/50 px-4 py-2 pl-10">
                                        <div className="flex items-center gap-2 text-xs text-tx-muted">
                                          {adjustment.adjustmentType === 'void' ? (
                                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-status-danger-text" />
                                          ) : (
                                            <Undo2 className="h-3.5 w-3.5 flex-shrink-0 text-status-danger-text" />
                                          )}
                                          <span>
                                            {adjustment.adjustmentType === 'void' ? 'Voided' : 'Refunded'} -{' '}
                                            {ADJUSTMENT_REASON_LABELS[adjustment.reasonCode]}
                                            {adjustment.createdByName ? ` by ${adjustment.createdByName}` : ''} on{' '}
                                            {new Date(adjustment.createdAt).toLocaleDateString()}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="whitespace-nowrap bg-surface2/50 px-4 py-2 text-right">
                                        <span className="text-xs font-semibold text-status-danger-text">
                                          -{formatMoney(adjustment.amount)}
                                        </span>
                                      </td>
                                      <td colSpan={2} className="bg-surface2/50" />
                                      <td className="sticky right-0 bg-surface2/50" />
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Stacked cards - below sm (payment-history-layout).
                        Status chip, amount, and the row menu are always
                        visible (no sticky-column mechanics needed at this
                        width since there's no horizontal scroll at all).
                        Adjustment lines stay indented under their card,
                        matching the table's own treatment. */}
                    <div className="sm:hidden space-y-3">
                      {payments.map((payment) => {
                        const remaining = payment.netPaid ?? Number(payment.amount);
                        const canOfferAdjustment = canAdjust && payment.status === 'confirmed' && remaining > 0;
                        const isVoided = payment.displayStatus === 'voided';
                        const details = [payment.referenceNumber, payment.notes].filter(Boolean).join(' - ');

                        return (
                          <div key={payment.id} className="rounded-lg border border-edge bg-surface p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 text-sm text-tx-primary">
                                <Calendar className="h-4 w-4 flex-shrink-0 text-tx-muted" />
                                {new Date(payment.date).toLocaleDateString()}
                              </div>
                              <PaymentRowMenu
                                onPrintReceipt={() =>
                                  window.open(`/payments/${payment.id}/receipt`, '_blank', 'noopener')
                                }
                                onRefund={canOfferAdjustment ? () => setRefundingPayment(payment) : undefined}
                                onVoid={canOfferAdjustment ? () => setVoidingPayment(payment) : undefined}
                              />
                            </div>

                            <div className="mt-2 flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm text-tx-primary">
                                  {getPaymentTypeLabel(payment.paymentType)}
                                </div>
                                {payment.programType && (
                                  <div className="text-xs text-tx-muted capitalize">
                                    {payment.programType.replace(/_/g, ' ')}
                                  </div>
                                )}
                              </div>
                              <div
                                className={`text-sm font-semibold ${
                                  isVoided ? 'text-tx-muted line-through' : 'text-status-success-text'
                                }`}
                              >
                                {formatMoney(Number(payment.amount))}
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-sm text-tx-primary">
                                <CreditCard className="h-4 w-4 flex-shrink-0 text-tx-muted" />
                                {getPaymentMethodLabel(payment.paymentMethod)}
                              </div>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(payment)}`}
                              >
                                {getDisplayLabel(payment)}
                              </span>
                            </div>

                            {details && (
                              <div className="mt-2 truncate text-sm text-tx-muted" title={details} tabIndex={0}>
                                {details}
                              </div>
                            )}

                            {(payment.adjustments ?? []).length > 0 && (
                              <div className="mt-3 space-y-2 border-t border-edge pt-2 pl-4">
                                {(payment.adjustments ?? []).map((adjustment) => (
                                  <div key={adjustment.id} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs text-tx-muted">
                                      {adjustment.adjustmentType === 'void' ? (
                                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-status-danger-text" />
                                      ) : (
                                        <Undo2 className="h-3.5 w-3.5 flex-shrink-0 text-status-danger-text" />
                                      )}
                                      <span>
                                        {adjustment.adjustmentType === 'void' ? 'Voided' : 'Refunded'} -{' '}
                                        {ADJUSTMENT_REASON_LABELS[adjustment.reasonCode]}
                                        {adjustment.createdByName ? ` by ${adjustment.createdByName}` : ''} on{' '}
                                        {new Date(adjustment.createdAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <span className="whitespace-nowrap text-xs font-semibold text-status-danger-text">
                                      -{formatMoney(adjustment.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-edge px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-md border border-edge-strong px-4 py-2 text-tx-secondary hover:bg-surface2"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <RefundDialog
        isOpen={!!refundingPayment}
        onClose={() => setRefundingPayment(null)}
        payment={refundingPayment}
        remainingAmount={refundingPayment ? refundingPayment.netPaid ?? Number(refundingPayment.amount) : 0}
        studentName={student?.fullName ?? 'this student'}
      />
      <VoidDialog
        isOpen={!!voidingPayment}
        onClose={() => setVoidingPayment(null)}
        payment={voidingPayment}
        remainingAmount={voidingPayment ? voidingPayment.netPaid ?? Number(voidingPayment.amount) : 0}
        onOpenRefund={() => {
          if (voidingPayment) setRefundingPayment(voidingPayment);
        }}
      />
      <PaymentArrangementDialog
        isOpen={arrangementOpen}
        onClose={() => setArrangementOpen(false)}
        enrollmentId={student?.activeEnrollment?.id ?? null}
        current={
          student?.activeEnrollment?.paymentArrangementSetAt
            ? {
                enrollmentId: student.activeEnrollment.id,
                setAt: student.activeEnrollment.paymentArrangementSetAt,
                setBy: student.activeEnrollment.paymentArrangementSetBy ?? null,
                setByName: student.activeEnrollment.paymentArrangementSetByName ?? null,
                note: student.activeEnrollment.paymentArrangementNote ?? null,
              }
            : null
        }
      />
    </div>
  );
};
