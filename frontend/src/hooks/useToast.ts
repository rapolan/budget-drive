import { useState, useCallback } from 'react';
import { ToastType } from '@/components/common/Toast';

interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback(
    (type: ToastType, message: string, description?: string, duration?: number) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const newToast: ToastData = {
        id,
        type,
        message,
        description,
        duration: duration ?? 5000,
      };

      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback(
    (message: string, description?: string, duration?: number) => {
      return addToast('success', message, description, duration);
    },
    [addToast]
  );

  const error = useCallback(
    (message: string, description?: string, duration?: number) => {
      return addToast('error', message, description, duration);
    },
    [addToast]
  );

  const warning = useCallback(
    (message: string, description?: string, duration?: number) => {
      return addToast('warning', message, description, duration);
    },
    [addToast]
  );

  const info = useCallback(
    (message: string, description?: string, duration?: number) => {
      return addToast('info', message, description, duration);
    },
    [addToast]
  );

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };
};
