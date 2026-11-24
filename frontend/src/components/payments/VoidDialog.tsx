import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { paymentsApi } from '@/api';
import { ModalShell, Button } from '@/components/common';
import type { Payment, AdjustmentReasonCode } from '@/types';
import { formatMoney } from '@/utils/moneyFormat';
import { ADJUSTMENT_REASON_LABELS } from '@/utils/adjustmentReasons';
import { apiErrorMessage } from '@/utils/apiErrorMessage';

interface VoidDialogProps {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment | null;
  // The remaining amount a void will cancel - already computed by the
  // caller (payment.netPaid). The void always covers this exact figure;
  // there is no amount field to edit.
  remainingAmount: number;
  onOpenRefund: () => void;
}

// Void's own reason list is a subset of the full adjustment reason set -
// the task names these three plus Other explicitly, distinct from
// refund's full list (which includes reasons like "lesson_cancelled" or
// "student_withdrew" that describe why MONEY is going back, not why a
// RECORD was wrong).
const VOID_REASON_CODES: AdjustmentReasonCode[] = ['entered_in_error', 'duplicate_payment', 'wrong_student', 'other'];

/**
 * Void dialog (payments-adjustments) - explains that a void cancels the
 * FULL remaining amount (no amount field - there is nothing to edit) and
 * points to Refund if money is actually going back to the family. Reason
 * required; note required for "Other". Submits via
 * POST /payments/:id/adjustments (adjustmentType: 'void').
 */
export const VoidDialog: React.FC<VoidDialogProps> = ({ isOpen, onClose, payment, remainingAmount, onOpenRefund }) => {
  const queryClient = useQueryClient();
  const [reasonCode, setReasonCode] = useState<AdjustmentReasonCode>('entered_in_error');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReasonCode('entered_in_error');
      setNote('');
      setError(null);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () =>
      paymentsApi.createAdjustment(payment!.id, {
        adjustmentType: 'void',
        reasonCode,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(apiErrorMessage(err, 'Failed to void this payment. Please try again.'));
    },
  });

  if (!isOpen || !payment) return null;

  const noteRequired = reasonCode === 'other';
  const canSubmit = !noteRequired || note.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    setError(null);
    mutation.mutate();
  };

  return (
    <ModalShell maxWidth="max-w-md">
      <div className="flex items-center justify-between border-b border-edge-glass/40 px-6 py-4">
        <h2 className="text-lg font-semibold text-tx-primary">Void</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-tx-muted hover:bg-surface2 hover:text-tx-secondary transition-all"
          aria-label="Close void dialog"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <div className="rounded-lg bg-status-warning-bg p-3">
          <p className="text-sm text-status-warning-text">
            Voiding cancels the full remaining amount ({formatMoney(remainingAmount)}) on this payment - it's for
            correcting a record that shouldn't have been entered this way, not for money going back to the family.
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenRefund();
            }}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Money is going back to the family? Use Refund instead.
          </button>
        </div>

        <div>
          <label htmlFor="void-reason" className="block text-sm font-medium text-tx-secondary mb-1">
            Reason
          </label>
          <select
            id="void-reason"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as AdjustmentReasonCode)}
            className="block w-full rounded-lg border border-edge-strong py-2 px-3 bg-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {VOID_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {ADJUSTMENT_REASON_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="void-note" className="block text-sm font-medium text-tx-secondary mb-1">
            Note {noteRequired ? '(required)' : '(optional)'}
          </label>
          <textarea
            id="void-note"
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
          <Button type="submit" variant="destructive" loading={mutation.isPending} disabled={!canSubmit}>
            Void {formatMoney(remainingAmount)}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};
