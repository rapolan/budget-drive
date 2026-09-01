import React from 'react';
import type { CertificateDetail } from '@/api/certificates';

const FORM_TYPE_TITLES: Record<string, string> = {
  DL_400D: 'Certificate of Completion of Behind-The-Wheel Training',
  DL_400B: 'Certificate of Completion of Driver Education (Classroom)',
  DL_400C: 'Certificate of Completion of Driver Education (Online)',
};

interface CertificateDocumentProps {
  certificate: CertificateDetail;
}

/**
 * The certificate document body itself - shared by the modal preview
 * (CertificateView) and the standalone print page (CertificatePrintPage)
 * so the two never drift: one source of truth for what a certificate
 * looks like, rendered in two different surrounding shells. NOT a
 * compliance-grade reproduction of the physical DMV form (DL 400D), which
 * the school prints and hands to the student - a clean digital reference
 * copy of the record.
 */
export const CertificateDocument: React.FC<CertificateDocumentProps> = ({ certificate }) => {
  return (
    <div className="rounded-xl border border-edge-glass/60 bg-surface p-8">
      <div className="text-center border-b border-edge pb-6 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">
          {certificate.formType}
        </p>
        <h1 className="text-xl font-semibold text-tx-primary">
          {FORM_TYPE_TITLES[certificate.formType] ?? 'Certificate of Completion'}
        </h1>
      </div>

      <div className="text-center mb-8">
        <p className="text-lg font-semibold text-tx-primary">{certificate.school.businessName}</p>
        {certificate.school.licenseNumber && (
          <p className="text-sm text-tx-muted">DMV License No. {certificate.school.licenseNumber}</p>
        )}
        <p className="text-sm text-tx-secondary mt-1">
          {[certificate.school.addressLine1, certificate.school.addressLine2].filter(Boolean).join(', ')}
        </p>
        <p className="text-sm text-tx-secondary">
          {[certificate.school.city, certificate.school.state, certificate.school.zipCode]
            .filter(Boolean)
            .join(', ')}
        </p>
        {certificate.school.phone && <p className="text-sm text-tx-secondary">{certificate.school.phone}</p>}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Student</p>
          <p className="text-sm text-tx-primary">{certificate.student.fullName}</p>
          {certificate.student.dateOfBirthLocal && (
            <p className="text-sm text-tx-secondary">DOB: {certificate.student.dateOfBirthLocal}</p>
          )}
          {certificate.completionDateLocal && (
            <p className="text-sm text-tx-secondary">Completed: {certificate.completionDateLocal}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-tx-muted mb-1">Instructor</p>
          {certificate.instructor ? (
            <>
              <p className="text-sm text-tx-primary">{certificate.instructor.fullName}</p>
              {certificate.instructor.licenseNumber && (
                <p className="text-sm text-tx-secondary">License No. {certificate.instructor.licenseNumber}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-tx-muted italic">Not recorded</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-edge pt-4">
        <p className="text-sm text-tx-secondary font-mono">Serial No. {certificate.serialNumber}</p>
        <p className="text-sm text-tx-secondary">Issued {certificate.issueDateLocal}</p>
      </div>

      <p className="text-xs text-tx-muted text-center mt-8">
        This is an internal digital reference copy of the certificate record, not the official DMV document.
      </p>
    </div>
  );
};
