import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, DollarSign, Calendar, CreditCard, FileText, Receipt, Mail, Phone, UserCircle, Wallet } from 'lucide-react';
import { paymentsApi } from '@/api';
import type { Student } from '@/types';
import { formatMoney } from '@/utils/moneyFormat';

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-status-success-bg text-status-success-text';
      case 'pending':
        return 'bg-status-warning-bg text-status-warning-text';
      case 'failed':
        return 'bg-status-danger-bg text-status-danger-text';
      case 'refunded':
        return 'bg-surface2 text-tx-primary';
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

        {/* Modal */}
        <div className="relative w-full max-w-4xl rounded-lg bg-surface shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-edge px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold text-tx-primary">Payment History</h2>
              </div>
              {student && (
                <p className="mt-1 text-sm text-tx-secondary">{student.fullName}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {student && onRecordPayment && (
                <button
                  type="button"
                  onClick={onRecordPayment}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:brightness-90 transition-all"
                >
                  <DollarSign className="h-4 w-4" />
                  Record payment
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-tx-muted hover:bg-surface2 hover:text-tx-muted"
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
                  <div className="overflow-hidden rounded-lg border border-edge">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-edge">
                        <thead className="bg-surface2">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Method
                            </th>
                            {/* Program-level only, never a specific lesson
                                - see this payment's own doc comment above
                                the component. */}
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Applied To
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Reference #
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Notes
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-tx-muted">
                              Receipt
                            </th>
                            {/* Reserved for phase 2 refund/void actions
                                (payments-actions, item 6) - deliberately
                                not built here, just a layout slot per row
                                so adding them later doesn't require
                                re-flowing this table. */}
                            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-tx-muted" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-edge bg-surface">
                          {payments.map((payment) => (
                            <tr key={payment.id} className="hover:bg-surface2">
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
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-tx-primary">
                                  <CreditCard className="h-4 w-4 text-tx-muted" />
                                  {getPaymentMethodLabel(payment.paymentMethod)}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="text-sm text-tx-muted capitalize">
                                  {payment.programType ? payment.programType.replace(/_/g, ' ') : '-'}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="text-sm font-semibold text-status-success-text">
                                  {formatMoney(Number(payment.amount))}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-center">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusBadge(
                                    payment.status
                                  )}`}
                                >
                                  {payment.status}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="text-sm text-tx-muted">
                                  {payment.referenceNumber || '-'}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="max-w-xs truncate text-sm text-tx-muted">
                                  {payment.notes || '-'}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => window.open(`/payments/${payment.id}/receipt`, '_blank', 'noopener')}
                                  className="p-1.5 text-tx-secondary hover:text-primary hover:bg-status-info-bg rounded-lg transition-colors"
                                  aria-label="Print receipt"
                                  title="Print receipt"
                                >
                                  <Receipt className="h-4 w-4" />
                                </button>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3" />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
    </div>
  );
};
