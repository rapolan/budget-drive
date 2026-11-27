import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, CheckCircle2, User } from 'lucide-react';
import { paymentsApi, studentsApi } from '@/api';
import type { CreatePaymentInput, Payment, PaymentMethod, Student } from '@/types';
import { ModalShell, Button } from '@/components/common';
import { useTenant } from '@/contexts/TenantContext';
import { formatMoney } from '@/utils/moneyFormat';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

// The visible chip row and its mapping onto the real payment_method CHECK
// constraint (backend/database/migrations/001_baseline.sql, widened
// additively by 030_widen_payment_method_check.sql to add venmo/zelle).
// This is manual/ledger tracking only (no Stripe/Square processing, an
// explicit FUTURE phase) - 'stripe_card' is deliberately NOT used for the
// generic "Card" chip, since that value means an actually-processed
// Stripe charge; 'credit' is the manual-entry-appropriate value for "an
// admin recorded that a card was used," matching how debit/credit exist
// specifically for hand-entered card tender.
const METHOD_CHIPS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'credit', label: 'Card' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'paypal', label: 'PayPal' },
];

// `today` must be the tenant's own school-local "today" (tenantNow.today -
// the same source Payments.tsx uses for its month boundaries), never a
// browser/UTC clock read - new Date() is tomorrow's date in the evening
// Pacific time, for example.
const EMPTY_FORM = (studentId: string, today: string): CreatePaymentInput => ({
  studentId,
  amount: 0,
  paymentMethod: undefined as unknown as PaymentMethod,
  paymentType: 'lesson_payment',
  date: today,
  status: 'confirmed',
  notes: '',
  referenceNumber: '',
});

type ModalStep = 'form' | 'confirmation';

/**
 * Record Payment form (payment-form-v2). Opened from 4 entry points - the
 * Payments page's own row action, the payment history modal, the "Who
 * owes you" list (all 3 funnel through Payments.tsx's one instance), and
 * SmartBookingForm's "Payment needed" banner (its own separate instance).
 * `onClose` keeps its EXACT prior contract: called once the modal is
 * dismissed, whether a payment was recorded or the user backed out -
 * PaymentNeededBanner's own onClose unconditionally re-runs its
 * booking-eligibility check on every call, and that must keep working
 * unchanged (confirmed by reading its current code before writing this).
 *
 * Two steps: the form itself, then (only after a successful save) a
 * confirmation step with Print receipt/Record another/Done - `onClose`
 * only actually fires once the user leaves the confirmation step (Done
 * or Record another's own next completion), never immediately on save,
 * so the user always sees the confirmation before the modal disappears.
 */
export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  student: preselectedStudent,
}) => {
  const queryClient = useQueryClient();
  const { settings, tenantNow } = useTenant();
  const blockchainPaymentsEnabled = settings?.enableBlockchainPayments === true;
  // Falls back to an empty string (not a browser-clock date) on the rare
  // first render before tenantNow has loaded - the date field is still
  // editable, and the effect below re-seeds it the instant tenantNow
  // arrives for whichever step/student is current at that moment.
  const today = tenantNow?.today ?? '';

  const [step, setStep] = useState<ModalStep>('form');
  const [savedPayment, setSavedPayment] = useState<Payment | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [formData, setFormData] = useState<CreatePaymentInput>(() => EMPTY_FORM(preselectedStudent?.id || '', today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Student selector - only shown/needed when the caller didn't already
  // pass a specific student (the Payments page's own header-level
  // "Record Payment" button, the one entry point with no student in
  // hand - every other entry point always preselects one).
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
    enabled: !preselectedStudent && isOpen,
  });
  const students = studentsData?.data || [];
  const student = preselectedStudent || students.find((s) => s.id === selectedStudentId) || null;

  const outstandingBalance = student?.paymentSummary?.outstandingBalance ?? 0;

  // Quick-amount chips (item 2) - server-derived, never a second
  // definition of paid/owed, never a fixed lesson count.
  const quickAmountsQuery = useQuery({
    queryKey: ['payment-quick-amounts', student?.id],
    queryFn: () => paymentsApi.getQuickAmounts(student!.id),
    enabled: Boolean(student?.id) && isOpen,
  });
  const quickAmounts = quickAmountsQuery.data?.data;

  // Duplicate-payment check (item 4) - re-runs whenever amount or method
  // changes, server-side (see paymentsApi.checkDuplicate's own doc
  // comment for why this isn't a client-side Date comparison).
  const duplicateCheckQuery = useQuery({
    queryKey: ['payment-duplicate-check', student?.id, formData.amount, formData.paymentMethod],
    queryFn: () => paymentsApi.checkDuplicate(student!.id, formData.amount, formData.paymentMethod!),
    enabled: Boolean(student?.id) && isOpen && formData.amount > 0 && Boolean(formData.paymentMethod),
  });
  const duplicateMatch = duplicateCheckQuery.data?.data;

  // Reset everything on open - every piece of per-open state (step, saved
  // payment, touched flags, dismissed warnings, the student picker) must
  // start fresh, or a stale confirmation screen or dismissed-warning flag
  // from a PRIOR open could leak into this one. Deliberately keyed only
  // on `isOpen`, not the resolved student - selecting a student from the
  // dropdown (when none was preselected) must NOT wipe whatever the admin
  // already typed, same as the prior component's own behavior.
  useEffect(() => {
    if (!isOpen) return;
    setStep('form');
    setSavedPayment(null);
    setSelectedStudentId(preselectedStudent?.id || '');
    setFormData(EMPTY_FORM(preselectedStudent?.id || '', today));
    setDuplicateDismissed(false);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    setFormData((prev) => ({ ...prev, studentId }));
    if (errors.studentId) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.studentId;
        return next;
      });
    }
  };

  // First field focused on open (item 7: keyboard) - the amount input,
  // since method/date/notes all have sensible defaults or are secondary.
  useEffect(() => {
    if (isOpen && step === 'form') {
      amountInputRef.current?.focus();
    }
  }, [isOpen, step]);

  const createMutation = useMutation({
    mutationFn: (data: CreatePaymentInput) => paymentsApi.create(data),
    onSuccess: (response) => {
      const payment = response.data as Payment;
      setSavedPayment(payment);
      setStep('confirmation');

      // Item 6: refresh every surface that shows a balance/eligibility
      // figure derived from payments - the Payments page's own lists,
      // the history modal, who-owes-you, and any open booking-eligibility
      // banner (keyed by enrollment, so this invalidates every instance,
      // not just the one that happened to open this modal).
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['who-owes-you'] });
      queryClient.invalidateQueries({ queryKey: ['booking-eligibility'] });
      queryClient.invalidateQueries({ queryKey: ['booking-eligibility-preview'] });
      queryClient.invalidateQueries({ queryKey: ['payment-quick-amounts'] });
      queryClient.invalidateQueries({ queryKey: ['payment-duplicate-check'] });
    },
    onError: (error: any) => {
      setErrors({
        submit: error.response?.data?.error || 'Failed to record payment. Please try again.',
      });
    },
  });

  const resetFormForSameStudent = () => {
    setFormData(EMPTY_FORM(student?.id || '', today));
    setDuplicateDismissed(false);
    setErrors({});
    setSavedPayment(null);
    setStep('form');
  };

  const handleAmountChange = (value: string) => {
    setDuplicateDismissed(false);
    setFormData((prev) => ({ ...prev, amount: parseFloat(value) || 0 }));
    if (errors.amount) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.amount;
        return next;
      });
    }
  };

  const handleMethodSelect = (value: PaymentMethod) => {
    setDuplicateDismissed(false);
    setFormData((prev) => ({ ...prev, paymentMethod: value }));
    if (errors.paymentMethod) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.paymentMethod;
        return next;
      });
    }
  };

  const handleQuickAmount = (amount: number) => {
    setDuplicateDismissed(false);
    setFormData((prev) => ({ ...prev, amount }));
    if (errors.amount) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.amount;
        return next;
      });
    }
  };

  // Live running-balance preview, and the overpay note (item 5) -
  // allowed, never blocked: an overpayment is a real credit the student
  // now holds, not an error to floor away.
  const newBalance = useMemo(() => outstandingBalance - (formData.amount || 0), [outstandingBalance, formData.amount]);
  const isOverpay = newBalance < 0;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!student) {
      newErrors.studentId = 'Please select a student';
    }
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    if (!formData.paymentMethod) {
      newErrors.paymentMethod = 'Please choose a payment method';
    }
    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createMutation.isPending) return; // guard against a rapid double-submit racing validate()
    if (validate() && student) {
      createMutation.mutate({ ...formData, studentId: student.id });
    }
  };

  const handlePrintReceipt = () => {
    if (savedPayment) {
      window.open(`/payments/${savedPayment.id}/receipt`, '_blank', 'noopener');
    }
  };

  const handleDone = () => {
    onClose();
  };

  if (!isOpen) return null;

  // Quick-amount chips (item 2): only shown when positive and distinct
  // from an amount already shown by another chip - never a fixed lesson
  // count, always derived from this student's real data.
  const chipCandidates: { key: string; label: string; amount: number }[] = [];
  if (quickAmounts?.nextLesson && quickAmounts.nextLesson.amount > 0) {
    const formattedDate = new Date(quickAmounts.nextLesson.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    chipCandidates.push({
      key: 'next-lesson',
      label: `Next lesson (${formattedDate})`,
      amount: quickAmounts.nextLesson.amount,
    });
  }
  if (quickAmounts?.scheduledLessons && quickAmounts.scheduledLessons.amount > 0) {
    chipCandidates.push({
      key: 'scheduled-lessons',
      label: `${quickAmounts.scheduledLessons.count} booked lesson${quickAmounts.scheduledLessons.count === 1 ? '' : 's'}`,
      amount: quickAmounts.scheduledLessons.amount,
    });
  }
  if (quickAmounts?.completedUnpaidLessons && quickAmounts.completedUnpaidLessons.amount > 0) {
    chipCandidates.push({
      key: 'completed-unpaid',
      label: `${quickAmounts.completedUnpaidLessons.count} completed, unpaid`,
      amount: quickAmounts.completedUnpaidLessons.amount,
    });
  }
  if (quickAmounts?.remainingCourse !== null && quickAmounts?.remainingCourse !== undefined && quickAmounts.remainingCourse > 0) {
    chipCandidates.push({
      key: 'remaining-course',
      label: 'Remaining course',
      amount: quickAmounts.remainingCourse,
    });
  }
  // De-duplicate by amount - a chip showing the same amount as an earlier
  // one adds no new information (e.g. one booked lesson left = the same
  // figure as "next lesson" would show).
  const seenAmounts = new Set<number>();
  const chips = chipCandidates.filter((chip) => {
    if (seenAmounts.has(chip.amount)) return false;
    seenAmounts.add(chip.amount);
    return true;
  });

  const showDuplicateWarning = Boolean(duplicateMatch?.isDuplicate) && !duplicateDismissed;

  if (step === 'confirmation' && savedPayment) {
    const methodLabel = METHOD_CHIPS.find((c) => c.value === savedPayment.paymentMethod)?.label
      ?? (savedPayment.paymentMethod === 'bsv' ? 'BSV' : savedPayment.paymentMethod === 'mnee' ? 'MNEE' : savedPayment.paymentMethod);
    return (
      <ModalShell maxWidth="max-w-md">
        <div className="px-6 py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-success-bg">
            <CheckCircle2 className="h-8 w-8 text-status-success-text" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-tx-primary">Payment recorded</h2>
          <p className="mt-2 text-2xl font-bold text-tx-primary">{formatMoney(Number(savedPayment.amount))}</p>
          <p className="mt-1 text-sm text-tx-secondary capitalize">{methodLabel}</p>

          <div className="mt-6 flex flex-col gap-2">
            <Button type="button" variant="secondary" onClick={handlePrintReceipt} className="w-full justify-center">
              Print receipt
            </Button>
            <Button type="button" variant="secondary" onClick={resetFormForSameStudent} className="w-full justify-center">
              Record another
            </Button>
            <Button type="button" variant="primary" onClick={handleDone} className="w-full justify-center">
              Done
            </Button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell maxWidth="max-w-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge-glass/40 px-6 py-4">
        <h2 className="text-lg font-semibold text-tx-primary">Record Payment</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-tx-muted hover:bg-surface2 hover:text-tx-secondary transition-all"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
        {/* Student selector - only shown when the caller didn't already
            preselect a student (the Payments page's header-level "Record
            Payment" button is the one entry point this applies to). */}
        {!preselectedStudent && (
          <div>
            <label className="block text-sm font-medium text-tx-secondary mb-1">
              Student <span className="text-status-danger-text">*</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User className="h-5 w-5 text-tx-muted" />
              </div>
              <select
                name="studentId"
                value={selectedStudentId}
                onChange={(e) => handleStudentSelect(e.target.value)}
                className="block w-full rounded-lg border border-edge-strong py-2.5 pl-10 pr-3 bg-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Choose a student --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.email})
                  </option>
                ))}
              </select>
            </div>
            {errors.studentId && (
              <p className="mt-1 text-sm text-status-danger-text">{errors.studentId}</p>
            )}
          </div>
        )}

        {student && (
          <p className="text-sm text-tx-secondary text-center">
            {student.fullName}
            {student.email || student.phone ? ` · ${student.email || student.phone}` : ''}
          </p>
        )}

        {/* Amount - the visual centerpiece */}
        <div className="text-center py-2">
          <div className="relative inline-flex items-center justify-center">
            <span className="text-4xl font-bold text-tx-muted mr-1">$</span>
            <input
              ref={amountInputRef}
              type="number"
              name="amount"
              value={formData.amount === 0 ? '' : formData.amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              step="0.01"
              min="0"
              autoComplete="nope"
              placeholder="0.00"
              className="w-48 text-center text-5xl font-bold text-tx-primary bg-transparent border-none outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          {errors.amount && (
            <p className="mt-1 text-sm text-status-danger-text">{errors.amount}</p>
          )}
        </div>

        {/* Quick-amount chips (item 2) */}
        {chips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {chips.map((chip) => {
              const selected = formData.amount === chip.amount;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleQuickAmount(chip.amount)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    selected
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface text-tx-secondary border-edge-strong hover:border-primary/60'
                  }`}
                >
                  {chip.label} · {formatMoney(chip.amount)}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={chips.every((c) => c.amount !== formData.amount)}
              onClick={() => amountInputRef.current?.focus()}
              className="px-3 py-1.5 text-xs font-medium rounded-full border border-dashed border-edge-strong text-tx-muted hover:border-primary/60 hover:text-tx-secondary transition-colors"
            >
              Custom amount
            </button>
          </div>
        )}

        {/* Method (item 1: no default) */}
        <div>
          <span className="block text-xs font-medium text-tx-secondary mb-1.5">
            Method <span className="text-status-danger-text">*</span>
          </span>
          <div role="group" aria-label="Payment method" className="flex flex-wrap gap-1.5">
            {METHOD_CHIPS.map((chip) => {
              const selected = formData.paymentMethod === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleMethodSelect(chip.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    selected
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface text-tx-secondary border-edge-strong hover:border-primary/60'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
            {/* BSV/MNEE are hidden entirely (never shown disabled) when
                blockchain payments are off - item 1's explicit
                requirement, a change from the prior locked-chip
                treatment. */}
            {blockchainPaymentsEnabled && (
              <button
                type="button"
                aria-pressed={formData.paymentMethod === 'bsv'}
                onClick={() => handleMethodSelect('bsv')}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  formData.paymentMethod === 'bsv'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-tx-secondary border-edge-strong hover:border-primary/60'
                }`}
              >
                BSV
              </button>
            )}
            {blockchainPaymentsEnabled && (
              <button
                type="button"
                aria-pressed={formData.paymentMethod === 'mnee'}
                onClick={() => handleMethodSelect('mnee')}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  formData.paymentMethod === 'mnee'
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-tx-secondary border-edge-strong hover:border-primary/60'
                }`}
              >
                MNEE
              </button>
            )}
          </div>
          {errors.paymentMethod && (
            <p className="mt-1 text-xs text-status-danger-text">{errors.paymentMethod}</p>
          )}
        </div>

        {/* Date */}
        <div>
          <label htmlFor="payment-date" className="block text-xs font-medium text-tx-secondary mb-1.5">
            Date
          </label>
          <input
            id="payment-date"
            type="date"
            name="date"
            value={formData.date}
            onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
            autoComplete="nope"
            className="block w-full rounded-lg border border-edge-strong py-2 px-3 bg-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {errors.date && <p className="mt-1 text-xs text-status-danger-text">{errors.date}</p>}
        </div>

        {/* Notes (item 3) */}
        <div>
          <label htmlFor="payment-notes" className="block text-xs font-medium text-tx-secondary mb-1.5">
            Notes (optional)
          </label>
          <input
            id="payment-notes"
            type="text"
            name="notes"
            value={formData.notes ?? ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            autoComplete="nope"
            placeholder="Anything worth remembering"
            className="block w-full rounded-lg border border-edge-strong py-2 px-3 bg-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Duplicate warning (item 4) - gentle, dismissible, never blocking */}
        {showDuplicateWarning && duplicateMatch && (
          <div className="rounded-lg bg-status-warning-bg border border-status-warning-border px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-status-warning-text">
                A {formatMoney(duplicateMatch.amount ?? 0)} payment was already recorded today. Record it again?
              </p>
              <button
                type="button"
                onClick={() => setDuplicateDismissed(true)}
                className="flex-shrink-0 text-xs font-medium text-status-warning-text underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Overpay note (item 5) - allowed, not blocked */}
        {isOverpay && (
          <div className="rounded-lg bg-status-info-bg px-4 py-3">
            <p className="text-sm text-primary">
              This will leave {formatMoney(Math.abs(newBalance))} credit on account.
            </p>
          </div>
        )}

        {/* Live running-balance preview */}
        <div className="rounded-lg bg-surface2 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-tx-secondary">New balance after this payment</span>
            <span className={`text-sm font-semibold ${newBalance < 0 ? 'text-status-success-text' : newBalance > 0 ? 'text-status-danger-text' : 'text-tx-primary'}`}>
              {newBalance < 0 ? `${formatMoney(Math.abs(newBalance))} credit` : formatMoney(newBalance)}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {errors.submit && (
          <div className="rounded-md bg-status-danger-bg p-3">
            <p className="text-sm text-status-danger-text">{errors.submit}</p>
          </div>
        )}

        {/* Actions */}
        <div className="pt-1">
          <Button
            type="submit"
            variant="primary"
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
            className="w-full justify-center py-3 text-base"
          >
            {createMutation.isPending ? 'Recording...' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};
