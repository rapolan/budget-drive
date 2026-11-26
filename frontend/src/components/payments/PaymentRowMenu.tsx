import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

const MENU_WIDTH = 176; // w-44, matching the menu's own width class below

/**
 * Per-payment row menu (payments-adjustments) - Print receipt, Refund,
 * Void.
 *
 * Rendered via a portal into document.body, positioned with `fixed` from
 * the trigger button's own getBoundingClientRect() - NOT as an `absolute`
 * child of the trigger (payment-history-layout review fix). The table's
 * desktop layout needs `overflow-x-auto` for horizontal scroll plus a
 * `sticky right-0` Actions column, and the trigger itself sits inside
 * both - an `absolute` dropdown anchored to that trigger got clipped by
 * the scroll container to a thin sliver, and later rows' own backgrounds
 * painted over whatever did render, since everything stayed within the
 * table's own stacking/clipping context. Escaping that context via a
 * portal is the fix; matches the identical portal pattern already used by
 * TeamSettings.tsx's MoreActionsMenu for the same class of problem.
 *
 * z-[60], not z-50 - PaymentHistoryModal's own backdrop+panel are z-50, so
 * the menu needs to sit one layer above its own modal, not merely above
 * the table.
 */
export const PaymentRowMenu: React.FC<PaymentRowMenuProps> = ({ onPrintReceipt, onRefund, onVoid }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const computePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Right-aligned to the button, matching the old `right-0 top-full`
    // placement but computed from real viewport coordinates.
    const left = rect.right - MENU_WIDTH;

    // Flip above the button when there isn't room below it. A fixed
    // estimate (not a post-render measurement of the actual menu height)
    // is enough here - this menu has at most 3 short rows, so its real
    // height never varies enough to change the flip decision at any
    // viewport size that matters.
    const ESTIMATED_MENU_HEIGHT = 136;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < ESTIMATED_MENU_HEIGHT) {
      setMenuPosition({ bottom: window.innerHeight - rect.top + 4, left });
    } else {
      setMenuPosition({ top: rect.bottom + 4, left });
    }
  }, []);

  const openMenu = () => {
    computePosition();
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        // Return focus to the trigger - without this, focus is left on
        // nothing (the menu that just unmounted), which strands a
        // keyboard user with no visible focus indicator anywhere.
        triggerRef.current?.focus();
      }
    };
    // Closes (rather than repositions) on scroll of the modal/table - a
    // short-lived transient control, not something a user scrolls while
    // keeping open. The capture phase catches scrolling inside the
    // table's own overflow-x-auto container, not just window-level
    // scroll.
    const handleScroll = () => setIsOpen(false);

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  const runAndClose = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
          } else {
            openMenu();
          }
        }}
        className="p-1.5 text-tx-secondary hover:text-primary hover:bg-status-info-bg rounded-lg transition-colors"
        aria-label="Payment actions"
        title="Payment actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPosition.top,
            bottom: menuPosition.bottom,
            left: menuPosition.left,
          }}
          className="w-44 bg-surface rounded-lg shadow-2xl border border-edge overflow-hidden z-[60]"
        >
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
        </div>,
        document.body
      )}
    </>
  );
};
