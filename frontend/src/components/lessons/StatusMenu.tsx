import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

interface StatusMenuProps {
  trigger: React.ReactNode;
  disabled?: boolean;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}

/**
 * Click-to-open menu wrapping an existing status badge, offering the same
 * three status-transition actions already available as row/card icon
 * buttons (Completed/No-show/Cancelled). Modeled on AccountSwitcher.tsx's
 * open/close/outside-click mechanics - no shared dropdown primitive exists
 * in this codebase yet.
 */
export const StatusMenu: React.FC<StatusMenuProps> = ({ trigger, disabled, onComplete, onNoShow, onCancel }) => {
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
          if (!disabled) setIsOpen(o => !o);
        }}
        disabled={disabled}
        className="disabled:cursor-not-allowed"
      >
        {trigger}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-surface rounded-lg shadow-2xl border border-edge overflow-hidden z-50">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              runAndClose(onComplete);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-status-success-text hover:bg-status-success-bg transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            Completed
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              runAndClose(onNoShow);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-status-warning-text hover:bg-status-warning-bg transition-colors"
          >
            <AlertCircle className="h-4 w-4" />
            No-show
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              runAndClose(onCancel);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-status-danger-text hover:bg-status-danger-bg transition-colors"
          >
            <X className="h-4 w-4" />
            Cancelled
          </button>
        </div>
      )}
    </div>
  );
};
