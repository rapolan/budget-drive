import React, { useState } from 'react';
import { Button } from '@/components/common';
import { tenantsApi } from '@/api';
import { useTenant } from '@/contexts/TenantContext';

interface StepOfferingsProps {
  onContinue: (enabledDriverEducation: boolean) => void;
}

/**
 * Step 3: not skippable (per the settled decision). Behind-the-wheel is
 * always on - no toggle needed, it's the base product. Driver Education
 * and certificate tracking are both off by default and can be turned on
 * here. Saving this step's enableDriverEducation=true is what makes
 * Classroom appear in the nav - Sidebar.tsx already reads this exact
 * flag from TenantContext, so no extra wiring is needed beyond calling
 * refreshSettings() after the save.
 */
export const StepOfferings: React.FC<StepOfferingsProps> = ({ onContinue }) => {
  const { settings, refreshSettings } = useTenant();

  const [enableDriverEducation, setEnableDriverEducation] = useState(settings?.enableDriverEducation ?? false);
  const [enableCertificates, setEnableCertificates] = useState(settings?.enableCertificates ?? false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleContinue = async () => {
    setSaveError(null);
    setIsSaving(true);

    try {
      await tenantsApi.updateSettings({ enableDriverEducation, enableCertificates });
      // refreshSettings() - not just a cache invalidation - is what
      // actually updates the value Sidebar.tsx's enableDriverEducation
      // check reads from useTenant(), making Classroom appear in the
      // nav without a full page reload.
      await refreshSettings();
      onContinue(enableDriverEducation);
    } catch (err: any) {
      setSaveError(err.response?.data?.error || 'Save may not have completed - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-tx-primary">What does your school offer?</h2>
        <p className="text-sm text-tx-secondary mt-1">You can change these any time in Settings.</p>
      </div>

      {saveError && (
        <div className="bg-status-danger-bg border border-status-danger-border rounded-xl p-3 text-sm text-status-danger-text">
          {saveError}
        </div>
      )}

      <div className="flex items-center justify-between p-4 bg-surface2/60 backdrop-blur-sm rounded-xl border border-edge-strong/80">
        <div>
          <p className="text-sm font-medium text-tx-primary">Behind-the-wheel lessons</p>
          <p className="text-xs text-tx-muted mt-0.5">Always included.</p>
        </div>
        <span className="text-xs bg-status-success-bg text-status-success-text px-2 py-1 rounded-full font-medium">Always on</span>
      </div>

      <div className="flex items-center justify-between p-4 bg-surface2/60 backdrop-blur-sm rounded-xl border border-edge-strong/80">
        <div>
          <p className="text-sm font-medium text-tx-primary">Driver Education classroom</p>
          <p className="text-xs text-tx-muted mt-0.5">Adds the Classroom page and DE enrollment tracking.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enableDriverEducation}
          onClick={() => setEnableDriverEducation(!enableDriverEducation)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enableDriverEducation ? 'bg-primary' : 'bg-surface3'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enableDriverEducation ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="flex items-center justify-between p-4 bg-surface2/60 backdrop-blur-sm rounded-xl border border-edge-strong/80">
        <div>
          <p className="text-sm font-medium text-tx-primary">Certificate tracking</p>
          <p className="text-xs text-tx-muted mt-0.5">Record DMV completion certificates as you issue them.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enableCertificates}
          onClick={() => setEnableCertificates(!enableCertificates)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enableCertificates ? 'bg-primary' : 'bg-surface3'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enableCertificates ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleContinue} loading={isSaving}>
          Save &amp; Continue
        </Button>
      </div>
    </div>
  );
};
