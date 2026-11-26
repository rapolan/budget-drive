import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { enrollmentsApi } from '@/api';
import { ModalShell, Button } from '@/components/common';
import type { PaymentArrangement } from '@/types';
import { apiErrorMessage } from '@/utils/apiErrorMessage';

interface PaymentArrangementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: string | null;
  // The current marker, if one is already set - drives the toggle's
  // initial state and the "who set it and when" display. Null/undefined
  // when nothing is set yet.
  current: PaymentArrangement | null | undefined;
}

/**
 * Payment arrangement dialog (payments-adjustments) - a toggle plus a
 * note, showing who set it and when. No booking-rule behavior is wired to
 * this anywhere; it is purely informational (an amber badge in the
 * who-owes-you list and the payment history header).
 */
export const PaymentArrangementDialog: React.FC<PaymentArrangementDialogProps> = ({
  isOpen,
  onClose,
  enrollmentId,
  current,
}) => {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(!!current);
  const [note, setNote] = useState(current?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEnabled(!!current);
      setNote(current?.note ?? '');
      setError(null);
    }
  }, [isOpen, current]);

  const setMutation = useMutation({
    mutationFn: () => enrollmentsApi.setPaymentArrangement(enrollmentId!, note.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(apiErrorMessage(err, 'Failed to update the payment arrangement. Please try again.'));
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => enrollmentsApi.clearPaymentArrangement(enrollmentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(apiErrorMessage(err, 'Failed to clear the payment arrangement. Please try again.'));
    },
  });

  if (!isOpen || !enrollmentId) return null;

  const isPending = setMutation.isPending || clearMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);
    if (enabled) {
      setMutation.mutate();
    } else {
      clearMutation.mutate();
    }
  };

  return (
    <ModalShell maxWidth="max-w-md">
      <div className="flex items-center justify-between border-b border-edge-glass/40 px-6 py-4">
        <h2 className="text-lg font-semibold text-tx-primary">Payment Arrangement</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-tx-muted hover:bg-surface2 hover:text-tx-secondary transition-all"
          aria-label="Close payment arrangement dialog"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <p className="text-sm text-tx-secondary">
          Marks this family as on an agreed, non-standard payment plan - they won't show the usual "who owes you"
          age warning. This is informational only and doesn't change any booking rules.
        </p>

        <label className="flex items-center justify-between rounded-lg border border-edge-strong px-4 py-3 cursor-pointer">
          <span className="text-sm font-medium text-tx-primary">On a payment arrangement</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-edge-strong text-primary focus:ring-primary"
          />
        </label>

        {enabled && (
          <div>
            <label htmlFor="arrangement-note" className="block text-sm font-medium text-tx-secondary mb-1">
              Note (optional)
            </label>
            <textarea
              id="arrangement-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-edge-strong py-2 px-3 bg-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Paying $50/month until balance clears"
            />
          </div>
        )}

        {current && (
          <p className="text-xs text-tx-muted">
            Last set {new Date(current.setAt).toLocaleDateString()}
            {current.setByName ? ` by ${current.setByName}` : ''}
          </p>
        )}

        {error && (
          <div className="rounded-md bg-status-danger-bg p-3">
            <p className="text-sm text-status-danger-text">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isPending}>
            Save
          </Button>
        </div>
      </form>
    </ModalShell>
  );
};
