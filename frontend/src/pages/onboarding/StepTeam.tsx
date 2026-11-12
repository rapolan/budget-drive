import React, { useState } from 'react';
import { Button } from '@/components/common';
import { instructorsApi } from '@/api';

interface StepTeamProps {
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * Step 5: skippable, optional. Reuses the existing POST /instructors
 * endpoint and its exact required fields (fullName/email/phone) as-is -
 * not a dedicated wizard-only endpoint, since it's genuinely the same
 * operation an admin would do from the Instructors page.
 */
export const StepTeam: React.FC<StepTeamProps> = ({ onContinue, onSkip }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleContinue = async () => {
    setSaveError(null);

    if (!fullName.trim() && !email.trim() && !phone.trim()) {
      // Nothing entered - treat as a skip rather than forcing the user
      // to click the separate Skip button for an empty form.
      onContinue();
      return;
    }
    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setSaveError('Full name, email, and phone are all required to add an instructor - or leave every field blank to skip this step.');
      return;
    }

    setIsSaving(true);
    try {
      await instructorsApi.create({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      onContinue();
    } catch (err: any) {
      setSaveError(err.response?.data?.error || 'Could not add this instructor - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-tx-primary">Add your first instructor</h2>
        <p className="text-sm text-tx-secondary mt-1">Optional - you can add instructors any time from the Instructors page.</p>
      </div>

      {saveError && (
        <div className="bg-status-danger-bg border border-status-danger-border rounded-lg p-3 text-sm text-status-danger-text">
          {saveError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Full name</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onSkip} disabled={isSaving}>
          Skip for now
        </Button>
        <Button onClick={handleContinue} loading={isSaving}>
          Save &amp; Continue
        </Button>
      </div>
    </div>
  );
};
