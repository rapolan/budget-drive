import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { paymentsApi } from '@/api';
import { LoadingSpinner } from '@/components/common';
import { PaymentReceiptDocument } from '@/components/payments/PaymentReceiptDocument';
import { useTenant } from '@/contexts/TenantContext';

/**
 * A bare page (no app shell, no modal chrome) rendering a single payment
 * receipt, opened in a new tab from PaymentHistoryModal's receipt icon -
 * same pattern as CertificatePrintPage, for the same reason (printing a
 * fixed-position, scroll-clipped modal directly fights Chromium's print
 * pagination).
 */
export const PaymentReceiptPrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { settings } = useTenant();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payments', 'receipt', id],
    queryFn: () => paymentsApi.getReceipt(id as string),
    enabled: !!id,
  });

  const receipt = data?.data;

  React.useEffect(() => {
    if (receipt) {
      window.print();
    }
  }, [receipt]);

  return (
    <div className="min-h-screen bg-appbg flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {isError && (
          <p className="text-sm text-status-danger-text text-center py-12">
            Couldn&apos;t load this receipt.
          </p>
        )}

        {receipt && (
          <PaymentReceiptDocument receipt={receipt} businessName={settings?.businessName || 'Driving School'} />
        )}
      </div>
    </div>
  );
};
