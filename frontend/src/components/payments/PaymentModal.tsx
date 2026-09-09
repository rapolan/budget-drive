import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, User, Lock } from 'lucide-react';
import { paymentsApi, studentsApi } from '@/api';
import type { CreatePaymentInput, PaymentMethod, Student } from '@/types';
import { ModalShell, Button } from '@/components/common';
import { useTenant } from '@/contexts/TenantContext';

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
  { value: 'credit', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'check', label: 'Check' },
];

// BSV/MNEE render at the end of the row, locked unless
// tenant_settings.enableBlockchainPayments is on - same flag/pattern as
// the Treasury nav item (Sidebar.tsx) and enableCertificates/
// enableDriverEducation.
const BLOCKCHAIN_METHOD_CHIPS: { value: PaymentMethod; label: string }[] = [
  { value: 'bsv', label: 'BSV' },
  { value: 'mnee', label: 'MNEE' },
];

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  student,
}) => {
  const queryClient = useQueryClient();
  const { settings } = useTenant();
  const blockchainPaymentsEnabled = settings?.enableBlockchainPayments === true;

  const [formData, setFormData] = useState<CreatePaymentInput>({
    studentId: '',
    amount: 0,
    paymentMethod: 'credit',
    paymentType: 'lesson_payment',
    date: new Date().toISOString().split('T')[0],
    status: 'confirmed',
    notes: '',
    referenceNumber: '',
  });
  // Tracks whether the admin has touched the amount field themselves -
  // once they have, selecting a different student must never clobber
  // their edit. Resets to false on modal open and on every student
  // change, so pre-fill only ever happens automatically before a human
  // has typed into the field.
  const [amountTouched, setAmountTouched] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch all students for dropdown (when no student is pre-selected)
  const { data: studentsData } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.getAll(1, 1000),
    enabled: !student && isOpen,
  });

  const students = studentsData?.data || [];
  const selectedStudentData = student || students.find(s => s.id === formData.studentId);
  const outstandingBalance = selectedStudentData?.paymentSummary?.outstandingBalance ?? 0;

  // Smart pre-fill (item 1): default the amount to the selected student's
  // outstandingBalance the moment a student is selected, fully editable,
  // and re-applied whenever the student selection changes - but never
  // once the admin has started editing it themselves.
  useEffect(() => {
    if (!isOpen) return;
    if (selectedStudentData && !amountTouched) {
      setFormData((prev) => ({
        ...prev,
        studentId: selectedStudentData.id,
        amount: outstandingBalance,
      }));
    } else if (student) {
      setFormData((prev) => ({ ...prev, studentId: student.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentData?.id, isOpen]);

  // Create payment mutation
  const createMutation = useMutation({
    mutationFn: (data: CreatePaymentInput) => paymentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      console.error('Failed to create payment:', error);
      setErrors({
        submit: error.response?.data?.error || 'Failed to record payment. Please try again.',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      studentId: student?.id || '',
      amount: 0,
      paymentMethod: 'credit',
      paymentType: 'lesson_payment',
      date: new Date().toISOString().split('T')[0],
      status: 'confirmed',
      notes: '',
      referenceNumber: '',
    });
    setAmountTouched(false);
    setErrors({});
  };

  // Reset the touched-amount guard whenever the modal is (re)opened, so
  // the next open starts fresh with pre-fill active again.
  useEffect(() => {
    if (isOpen) {
      setAmountTouched(false);
    }
  }, [isOpen]);

  const handleAmountChange = (value: string) => {
    setAmountTouched(true);
    setFormData((prev) => ({ ...prev, amount: parseFloat(value) || 0 }));
    if (errors.amount) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.amount;
        return next;
      });
    }
  };

  const handleStudentSelect = (studentId: string) => {
    setAmountTouched(false);
    setFormData((prev) => ({ ...prev, studentId }));
    if (errors.studentId) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.studentId;
        return next;
      });
    }
  };

  const handleMethodSelect = (value: PaymentMethod, locked: boolean) => {
    if (locked) return;
    setFormData((prev) => ({ ...prev, paymentMethod: value }));
  };

  // Live running-balance preview (item 4): outstandingBalance minus the
  // amount currently entered. Allowed to go negative - an overpayment is
  // a real credit the student now holds toward a future charge, not an
  // error to floor away; flooring at $0.00 would silently hide the fact
  // that the admin just recorded more than was owed. Rendered with its
  // own "credit" framing below so a negative number reads as a credit,
  // not an implied debt.
  const newBalance = useMemo(() => outstandingBalance - (formData.amount || 0), [outstandingBalance, formData.amount]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.studentId) {
      newErrors.studentId = 'Please select a student';
    }
    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    if (!formData.paymentMethod) {
      newErrors.paymentMethod = 'Payment method is required';
    }
    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createMutation.isPending) return; // item 5: guard against a rapid double-submit racing validate()
    if (validate()) {
      createMutation.mutate(formData);
    }
  };

  if (!isOpen) return null;

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
        {/* Student selector - only shown when no student was pre-selected */}
        {!student && (
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
                value={formData.studentId}
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

        {/* Amount - the visual centerpiece (item 1: smart pre-fill) */}
        <div className="text-center py-2">
          <div className="relative inline-flex items-center justify-center">
            <span className="text-4xl font-bold text-tx-muted mr-1">$</span>
            <input
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
          {selectedStudentData && !amountTouched && outstandingBalance > 0 && (
            <p className="mt-1 text-xs text-tx-muted">Pre-filled from outstanding balance</p>
          )}
          {errors.amount && (
            <p className="mt-1 text-sm text-status-danger-text">{errors.amount}</p>
          )}
        </div>

        {/* Method + Date, side by side (item 2) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-xs font-medium text-tx-secondary mb-1.5">Method</span>
            <div role="group" aria-label="Payment method" className="flex flex-wrap gap-1.5">
              {METHOD_CHIPS.map((chip) => {
                const selected = formData.paymentMethod === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleMethodSelect(chip.value, false)}
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
              {BLOCKCHAIN_METHOD_CHIPS.map((chip) => {
                const selected = formData.paymentMethod === chip.value;
                const locked = !blockchainPaymentsEnabled;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={locked}
                    title={locked ? 'Enable blockchain payments in Settings to use this method' : undefined}
                    onClick={() => handleMethodSelect(chip.value, locked)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                      locked
                        ? 'border-dashed border-edge text-tx-muted opacity-60 cursor-not-allowed'
                        : selected
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-tx-secondary border-edge-strong hover:border-primary/60'
                    }`}
                  >
                    {locked && <Lock className="h-3 w-3" />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

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
        </div>

        {/* Reference number (item 3) */}
        <div>
          <label htmlFor="payment-reference" className="block text-xs font-medium text-tx-secondary mb-1.5">
            Reference # (optional)
          </label>
          <input
            id="payment-reference"
            type="text"
            name="referenceNumber"
            value={formData.referenceNumber ?? ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, referenceNumber: e.target.value }))}
            autoComplete="nope"
            placeholder="Square receipt #, last 4, etc."
            className="block w-full rounded-lg border border-edge-strong py-2 px-3 bg-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Live running-balance preview (item 4) */}
        {selectedStudentData && (
          <div className="rounded-lg bg-surface2 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-tx-secondary">New balance after this payment</span>
              <span className={`text-sm font-semibold ${newBalance < 0 ? 'text-status-success-text' : newBalance > 0 ? 'text-status-danger-text' : 'text-tx-primary'}`}>
                {newBalance < 0 ? `$${Math.abs(newBalance).toFixed(2)} credit` : `$${newBalance.toFixed(2)}`}
              </span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errors.submit && (
          <div className="rounded-md bg-status-danger-bg p-3">
            <p className="text-sm text-status-danger-text">{errors.submit}</p>
          </div>
        )}

        {/* Actions - one large, clearly primary button (item 5: disabled while pending) */}
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
          <p className="mt-2 text-center text-xs text-tx-muted">
            Everything's pre-filled - tap Confirm, or edit any field first
          </p>
        </div>
      </form>
    </ModalShell>
  );
};
