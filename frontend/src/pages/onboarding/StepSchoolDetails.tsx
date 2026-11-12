import React, { useState } from 'react';
import { Button } from '@/components/common';
import { tenantsApi } from '@/api';
import { useTenant } from '@/contexts/TenantContext';
import type { TenantSettings } from '@/types';

interface StepSchoolDetailsProps {
  onContinue: () => void;
}

const US_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

/**
 * Step 2: not skippable (per the settled decision) - phone, address,
 * DMV license (optional - a school that hasn't received theirs yet
 * shouldn't be blocked), and timezone, all via the existing
 * PUT /tenant/settings endpoint.
 */
export const StepSchoolDetails: React.FC<StepSchoolDetailsProps> = ({ onContinue }) => {
  const { settings, refreshSettings } = useTenant();

  const [phone, setPhone] = useState(settings?.supportPhone || '');
  const [addressLine1, setAddressLine1] = useState(settings?.addressLine1 || '');
  const [addressLine2, setAddressLine2] = useState(settings?.addressLine2 || '');
  const [city, setCity] = useState(settings?.city || '');
  const [state, setState] = useState(settings?.state || '');
  const [zipCode, setZipCode] = useState(settings?.zipCode || '');
  const [licenseNumber, setLicenseNumber] = useState(settings?.licenseNumber || '');
  const [timezone, setTimezone] = useState(settings?.timezone || '');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleContinue = async () => {
    setSaveError(null);
    setIsSaving(true);

    const payload: Partial<TenantSettings> = {
      supportPhone: phone,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      licenseNumber,
    };
    if (timezone) {
      payload.timezone = timezone;
    }

    try {
      await tenantsApi.updateSettings(payload);
      // Verify by re-fetching, not just trusting the write - confirms
      // the save actually persisted before advancing.
      await refreshSettings();
      onContinue();
    } catch (err: any) {
      setSaveError(err.response?.data?.error || 'Save may not have completed - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-tx-primary">School details</h2>
        <p className="text-sm text-tx-secondary mt-1">How students and the DMV can reach your school.</p>
      </div>

      {saveError && (
        <div className="bg-status-danger-bg border border-status-danger-border rounded-lg p-3 text-sm text-status-danger-text">
          {saveError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Address line 1</label>
        <input
          type="text"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Address line 2 (optional)</label>
        <input
          type="text"
          value={addressLine2}
          onChange={(e) => setAddressLine2(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">ZIP</label>
          <input
            type="text"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">
          DMV driving school license number <span className="text-tx-muted">(optional - add it later if you don't have it yet)</span>
        </label>
        <input
          type="text"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        >
          <option value="">Select a timezone</option>
          {US_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleContinue} loading={isSaving}>
          Save &amp; Continue
        </Button>
      </div>
    </div>
  );
};
