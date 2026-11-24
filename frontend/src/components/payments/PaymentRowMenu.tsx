import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Receipt, Undo2, Ban } from 'lucide-react';

interface PaymentRowMenuProps {
  onPrintReceipt: () => void;
  // Omitted entirely (not just disabled) for a role without adjustment
  // permission (payments-adjustments, owner/admin only) or for a payment
  // that can no longer be adjusted (not confirmed, or already fully
  // refunded/voided) - same "don't render the option at all" pattern
  // PaymentHistoryModal's own "Record payment" button already uses for an
  // absent capability, rather than a disabled-but-visible button.
  onRefund?: () => void;
  onVoid?: () => void;
}

/**
 * Per-payment row menu (payments-adjustments) - Print receipt, Refund,
 * Void. Modeled directly on StatusMenu.tsx's own click-to-open mechanics
 * (no shared dropdown primitive exists in this codebase yet) - same
 * open/close/outside-click/stopPropagation shape.
 */
export const PaymentRowMenu: React.FC<PaymentRowMenuProps> = ({ onPrintReceipt, onRefund, onVoid }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runAndClose = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((o) => !o);
        }}
        className="p-1.5 text-tx-secondary hover:text-primary hover:bg-status-info-bg rounded-lg transition-colors"
        aria-label="Payment actions"
        title="Payment actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-surface rounded-lg shadow-2xl border border-edge overflow-hidden z-50">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              runAndClose(onPrintReceipt);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-tx-secondary hover:bg-surface2 transition-colors"
          >
            <Receipt className="h-4 w-4" />
            Print receipt
          </button>
          {onRefund && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                runAndClose(onRefund);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary hover:bg-status-info-bg transition-colors"
            >
              <Undo2 className="h-4 w-4" />
              Refund
            </button>
          )}
          {onVoid && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                runAndClose(onVoid);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-status-danger-text hover:bg-status-danger-bg transition-colors"
            >
              <Ban className="h-4 w-4" />
              Void
            </button>
          )}
        </div>
      )}
    </div>
  );
};
