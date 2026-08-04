import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
  onClose: (id: string) => void;
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-status-success-bg',
    borderColor: 'border-status-success-border',
    iconColor: 'text-status-success-text',
    textColor: 'text-status-success-text',
    descColor: 'text-status-success-text',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-status-danger-bg',
    borderColor: 'border-status-danger-border',
    iconColor: 'text-status-danger-text',
    textColor: 'text-status-danger-text',
    descColor: 'text-status-danger-text',
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-status-warning-bg',
    borderColor: 'border-status-warning-border',
    iconColor: 'text-status-warning-text',
    textColor: 'text-status-warning-text',
    descColor: 'text-status-warning-text',
  },
  info: {
    icon: Info,
    bgColor: 'bg-status-info-bg',
    borderColor: 'border-status-info-border',
    iconColor: 'text-status-info-text',
    textColor: 'text-status-info-text',
    descColor: 'text-status-info-text',
  },
};

export const Toast: React.FC<ToastProps> = ({
  id,
  type,
  message,
  description,
  duration = 5000,
  onClose,
}) => {
  const config = toastConfig[type];
  const Icon = config.icon;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <div
      className={`
        ${config.bgColor} ${config.borderColor}
        border rounded-lg shadow-lg p-4 mb-3 max-w-md w-full
        transform transition-all duration-300 ease-in-out
        animate-in slide-in-from-right-full fade-in
      `}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${config.textColor}`}>{message}</p>
          {description && (
            <p className={`text-sm mt-1 ${config.descColor}`}>{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onClose(id)}
          className={`${config.iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
