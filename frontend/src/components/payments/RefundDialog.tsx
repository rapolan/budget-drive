import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { paymentsApi } from '@/api';
import { ModalShell, Button } from '@/components/common';
import type { Payment, AdjustmentReasonCode } from '@/types';
import { formatMoney } from '@/utils/moneyFormat';
import { apiErrorMessage } from '@/utils/apiErrorMessage';
import { ADJUSTMENT_REASON_LABELS, ADJUSTMENT_REASON_CODES } from '@/utils/adjustmentReasons';

interface RefundDialogProps {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment | null;
  // The remaining amount this payment can still be refunded for - already
  // computed by the caller (payment.netPaid), not recomputed here.
  remainingAmount: number;
  studentName: string;
}

/**
 * Refund dialog (payments-adjustments) - amount defaults to and is capped
 * at the full remaining amount, shows what's already been refunded,
 * requires a reason (note required for "Other"), and explains plainly
 * that the original payment stays on record - this is a NEW row, never an
 * edit to the original. Submits via POST /payments/:id/adjustments
 * (adjustmentType: 'refund').
 */
export const RefundDialog: React.FC<RefundDialogProps> = ({ isOpen, onClose, payment, remainingAmount, studentName }) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(remainingAmount);
  const [reasonCode, setReasonCode] = useState<AdjustmentReasonCode>('overpaid');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset to the full remaining amount every time the dialog opens for a
  // (possibly different) payment - never carries a stale amount over from
  // a previous refund on a different payment.
  useEffect(() => {
    if (isOpen) {
      setAmount(remainingAmount);
      setReasonCode('overpaid');
      setNote('');
      setError(null);
    }
  }, [isOpen, remainingAmount]);

  const mutation = useMutation({
    mutationFn: () =>
      paymentsApi.createAdjustment(payment!.id, {
        adjustmentType: 'refund',
        amount,
        reasonCode,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(apiErrorMessage(err, 'Failed to record the refund. Please try again.'));
    },
  });

  if (!isOpen || !payment) return null;

  const alreadyRefunded = payment.amount - remainingAmount;
  const noteRequired = reasonCode === 'other';
  const canSubmit = amount > 0 && amount <= remainingAmount && (!noteRequired || note.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    setError(null);
    mutation.mutate();
  };

  return (
    <ModalShell maxWidth="max-w-md">
      <div className="flex items-center justify-between border-b border-edge-glass/40 px-6 py-4">
        <h2 className="text-lg font-semibold text-tx-primary">Refund</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-tx-muted hover:bg-surface2 hover:text-tx-secondary transition-all"
          aria-label="Close refund dialog"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <p className="text-sm text-tx-secondary">
          The original payment stays on record exactly as it is - this is recorded as a separate entry showing how
          the school returned the money to {studentName}.
        </p>

        {alreadyRefunded > 0 && (
          <p className="text-xs text-tx-muted">
            {formatMoney(alreadyRefunded)} already refunded on this payment.
          </p>
        )}

        <div>
          <label htmlFor="refund-amount" className="block text-sm font-medium text-tx-secondary mb-1">
            Amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-tx-muted">$</span>
            <input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remainingAmount}
              value={amount === 0 ? '' : amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              autoComplete="nope"
              className="block w-full rounded-lg border border-edge-strong py-2 pl-7 pr-3 bg-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <p className="mt-1 text-xs text-tx-muted">Up to {formatMoney(remainingAmount)} remaining</p>
          {amount > remainingAmount && (
            <p className="mt-1 text-xs text-status-danger-text">Cannot exceed the remaining amount.</p>
          )}
        </div>

        <div>
          <label htmlFor="refund-reason" className="block text-sm font-medium text-tx-secondary mb-1">
            Reason
          </label>
          <select
            id="refund-reason"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as AdjustmentReasonCode)}
            className="block w-full rounded-lg border border-edge-strong py-2 px-3 bg-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {ADJUSTMENT_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {ADJUSTMENT_REASON_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="refund-note" className="block text-sm font-medium text-tx-secondary mb-1">
            Note {noteRequired ? '(required)' : '(optional)'}
          </label>
          <textarea
            id="refund-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="block w-full rounded-lg border border-edge-strong py-2 px-3 bg-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={noteRequired ? 'Required when the reason is "Other"' : 'Optional details'}
          />
        </div>

        {error && (
          <div className="rounded-md bg-status-danger-bg p-3">
            <p className="text-sm text-status-danger-text">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={!canSubmit}>
            Refund {formatMoney(amount)}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};
