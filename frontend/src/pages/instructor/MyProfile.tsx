import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, Mail, MapPin, FileText, AlertCircle } from 'lucide-react';
import { instructorsApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { CalendarFeedSettings } from '@/components/instructors/CalendarFeedSettings';
import { computeLicenseStatus } from '@/utils/licenseExpiry';
import { formatPhoneNumber } from '@/utils/phoneFormat';

const LICENSE_STATUS_LABEL: Record<string, string> = {
  missing: 'Not on file',
  expired: 'Expired',
  expiring: 'Expiring soon',
  valid: 'Valid',
};

// The instructor's own record - license info, contact info, and the
// calendar feed subscription (CalendarFeedSettings, reused unchanged from
// the admin instructor edit modal, mounted here with this instructor's
// own id). Read-only: tenant-wide settings, employment type, hourly rate,
// and service areas stay admin-managed - this page shows what's reasonable
// for an instructor to see about their own record, not everything the
// admin's instructor edit form exposes.
export const InstructorMyProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { tenantNow } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-me'],
    queryFn: () => instructorsApi.getMe(),
    enabled: Boolean(user?.instructorId),
  });

  const instructor = data?.data;

  if (isLoading || !instructor) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const licenseExpiration = instructor.instructorLicenseExpiration
    ? String(instructor.instructorLicenseExpiration).split('T')[0]
    : null;
  const licenseStatus = tenantNow ? computeLicenseStatus(licenseExpiration, tenantNow.today) : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-tx-primary mb-1">My Profile</h1>
      <p className="text-sm text-tx-muted mb-4">{instructor.fullName}</p>

      <div className="bg-surface border border-edge rounded-lg p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-tx-primary mb-2">Contact Info</h2>
        <div className="flex items-center gap-2 text-sm text-tx-secondary">
          <Phone className="h-4 w-4 text-tx-muted" />
          {formatPhoneNumber(instructor.phone)}
        </div>
        <div className="flex items-center gap-2 text-sm text-tx-secondary">
          <Mail className="h-4 w-4 text-tx-muted" />
          {instructor.email}
        </div>
        {(instructor.addressLine1 || instructor.city) && (
          <div className="flex items-center gap-2 text-sm text-tx-secondary">
            <MapPin className="h-4 w-4 text-tx-muted" />
            {[instructor.addressLine1, instructor.city, instructor.state, instructor.zipCode]
              .filter(Boolean)
              .join(', ')}
          </div>
        )}
      </div>

      <div className="bg-surface border border-edge rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4 text-purple-600" />
          <h2 className="text-sm font-semibold text-tx-primary">Driving School Instructor License</h2>
          {licenseStatus && licenseStatus !== 'valid' && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
              licenseStatus === 'expired' || licenseStatus === 'missing'
                ? 'bg-status-danger-bg text-status-danger-text'
                : 'bg-status-warning-bg text-status-warning-text'
            }`}>
              <AlertCircle className="h-3 w-3" />
              {LICENSE_STATUS_LABEL[licenseStatus]}
            </span>
          )}
        </div>
        <div className="text-sm text-tx-secondary space-y-1">
          <p>License number: {instructor.instructorLicenseNumber || 'Not on file'}</p>
          <p>Expiration: {licenseExpiration || 'Not on file'}</p>
        </div>

        {instructor.isDeTeacher && (
          <div className="mt-3 pt-3 border-t border-edge text-sm text-tx-secondary space-y-1">
            <p className="font-medium text-tx-primary">Driver Education Teaching Credential</p>
            <p>Credential number: {instructor.deCredentialNumber || 'Not on file'}</p>
            <p>
              Expiration:{' '}
              {instructor.deCredentialExpiration
                ? String(instructor.deCredentialExpiration).split('T')[0]
                : 'Not on file'}
            </p>
          </div>
        )}
      </div>

      <CalendarFeedSettings instructorId={instructor.id} />
    </div>
  );
};
