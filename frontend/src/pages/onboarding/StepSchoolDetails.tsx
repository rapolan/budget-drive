import React, { useState } from 'react';
import { Button, GlassInput, GlassSelect } from '@/components/common';
import { tenantsApi } from '@/api';
import { useTenant } from '@/contexts/TenantContext';
import { formatPhoneNumber } from '@/utils/phoneFormat';
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

  const [phone, setPhone] = useState(formatPhoneNumber(settings?.supportPhone || ''));
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
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-tx-primary">School details</h2>
        <p className="text-sm text-tx-muted mt-1">How students and the DMV can reach your school.</p>
      </div>

      {saveError && (
        <div className="bg-status-danger-bg border border-status-danger-border rounded-xl p-3 text-sm text-status-danger-text">
          {saveError}
        </div>
      )}

      <GlassInput
        label="Phone"
        type="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
        // Defensive re-format on blur: autofill (browser-suggested phone
        // numbers) and some paste paths can set the input's DOM value
        // directly in a way that still fires onChange, but with this
        // field's own stale-closure risk around rapid programmatic
        // value-setting - reformatting from the input's own current value
        // on blur guarantees the display is never left unformatted, cheap
        // insurance beyond the onChange path alone.
        onBlur={(e) => setPhone(formatPhoneNumber(e.target.value))}
      />

      <GlassInput
        label="Address line 1"
        type="text"
        value={addressLine1}
        onChange={(e) => setAddressLine1(e.target.value)}
      />

      <GlassInput
        label="Address line 2 (optional)"
        type="text"
        value={addressLine2}
        onChange={(e) => setAddressLine2(e.target.value)}
      />

      <div className="grid grid-cols-3 gap-3">
        <GlassInput
          label="City"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <GlassInput
          label="State"
          type="text"
          value={state}
          onChange={(e) => setState(e.target.value)}
        />
        <GlassInput
          label="ZIP"
          type="text"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
        />
      </div>

      <GlassInput
        label="DMV driving school license number"
        hint="Optional - add it later if you don't have it yet"
        type="text"
        value={licenseNumber}
        onChange={(e) => setLicenseNumber(e.target.value)}
      />

      <GlassSelect
        label="Timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
      >
        <option value="">Select a timezone</option>
        {US_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>{tz}</option>
        ))}
      </GlassSelect>

      <div className="flex justify-end pt-2">
        <Button onClick={handleContinue} loading={isSaving}>
          Save &amp; Continue
        </Button>
      </div>
    </div>
  );
};
