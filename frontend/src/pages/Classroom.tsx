import React from 'react';
import { GraduationCap } from 'lucide-react';
import { EmptyState } from '@/components/common';

/**
 * Driver education classroom tracking (Phase 3 of the compliance-records
 * arc). This is a placeholder - cohort scheduling and attendance land in
 * a later commit of this same phase. The nav entry, enableDriverEducation
 * feature flag, and /classroom route are wired now so the flag has
 * somewhere real to point at.
 */
export const ClassroomPage: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-tx-primary">Classroom</h1>
        <p className="mt-1 text-sm text-tx-muted">Schedule driver education classes and track attendance.</p>
      </div>

      <EmptyState
        icon={<GraduationCap className="h-10 w-10" />}
        title="Coming soon"
        description="Class scheduling and attendance tracking for driver education are being built."
      />
    </div>
  );
};
