import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Printer, X } from 'lucide-react';
import { certificatesApi } from '@/api';
import { ModalShell, Button, LoadingSpinner } from '@/components/common';
import { CertificateDocument } from './CertificateDocument';

interface CertificateViewProps {
  certificateId: string;
  onClose: () => void;
}

/**
 * A self-contained digital reference copy of a certificate's record - NOT
 * a compliance-grade reproduction of the physical DMV form (DL 400D),
 * which the school prints and hands to the student. Fetches its own data
 * from a certificate id, so it can be dropped into any surface (today: the
 * Certificates page log; a student-record entry point is a planned
 * follow-up) with no rebuild - just a new call site passing certificateId.
 *
 * Print opens the dedicated /certificates/:id/print route in a new tab
 * rather than printing this modal in place: a fixed-position, scroll-
 * clipped modal fights Chromium's print pagination (content gets
 * truncated or mis-paginated depending on how the CSS is coerced around
 * it). The print route renders the exact same CertificateDocument on a
 * bare page with no modal chrome to fight, so print() there just works.
 */
export const CertificateView: React.FC<CertificateViewProps> = ({ certificateId, onClose }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['certificates', 'detail', certificateId],
    queryFn: () => certificatesApi.getDetail(certificateId),
  });

  const certificate = data?.data;

  return (
    <ModalShell maxWidth="max-w-2xl">
      <div className="sticky top-0 bg-surface/40 backdrop-blur-xl border-b border-edge-glass/40 px-6 py-4 z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
              <Award className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-tx-primary truncate">Certificate</h2>
              <p className="text-sm text-tx-muted">Digital reference copy</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {certificate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(`/certificates/${certificateId}/print`, '_blank', 'noopener')}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-tx-muted hover:text-tx-secondary hover:bg-surface2 rounded-lg transition-all"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
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
    </ModalShell>
  );
};
