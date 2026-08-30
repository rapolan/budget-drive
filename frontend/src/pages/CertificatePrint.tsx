import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { certificatesApi } from '@/api';
import { LoadingSpinner } from '@/components/common';
import { CertificateDocument } from '@/components/certificates/CertificateDocument';

/**
 * A bare page (no app shell, no modal chrome) rendering a single
 * certificate, opened in a new tab from CertificateView's Print button.
 * Printing this page directly - rather than the modal in place - avoids
 * fighting Chromium's print pagination inside a fixed-position, scroll-
 * clipped container. Renders the exact same CertificateDocument the modal
 * preview uses, so the two can never drift apart.
 */
export const CertificatePrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['certificates', 'detail', id],
    queryFn: () => certificatesApi.getDetail(id as string),
    enabled: !!id,
  });

  const certificate = data?.data;

  React.useEffect(() => {
    if (certificate) {
      window.print();
    }
  }, [certificate]);

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
            Couldn&apos;t load this certificate.
          </p>
        )}

        {certificate && <CertificateDocument certificate={certificate} />}
      </div>
    </div>
  );
};
