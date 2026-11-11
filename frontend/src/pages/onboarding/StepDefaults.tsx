import React, { useState } from 'react';
import { Button } from '@/components/common';
import { tenantsApi, schedulingApi } from '@/api';
import { useTenant } from '@/contexts/TenantContext';

interface StepDefaultsProps {
  driverEducationEnabled: boolean;
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * Step 4: skippable. Lesson price and length live on tenant_settings
 * (PUT /tenant/settings); buffer between lessons lives on a DIFFERENT
 * table behind a DIFFERENT endpoint (scheduling_settings, PUT
 * /availability/settings) - two separate API calls for this one step.
 * Classroom course price only shown/saved if Driver Education was
 * enabled in step 3.
 */
export const StepDefaults: React.FC<StepDefaultsProps> = ({ driverEducationEnabled, onContinue, onSkip }) => {
  const { settings, refreshSettings } = useTenant();

  const [lessonCost, setLessonCost] = useState(
    settings?.defaultLessonCost !== undefined ? String(settings.defaultLessonCost) : ''
  );
  const [lessonLength, setLessonLength] = useState(
    settings?.standardLessonLengthMinutes !== undefined ? String(settings.standardLessonLengthMinutes) : '120'
  );
  const [bufferMinutes, setBufferMinutes] = useState('15');
  const [classroomCost, setClassroomCost] = useState(
    settings?.defaultDeClassroomCost !== undefined ? String(settings.defaultDeClassroomCost) : ''
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleContinue = async () => {
    setSaveError(null);
    setIsSaving(true);

    try {
      await tenantsApi.updateSettings({
        defaultLessonCost: lessonCost ? Number(lessonCost) : undefined,
        standardLessonLengthMinutes: lessonLength ? Number(lessonLength) : undefined,
        ...(driverEducationEnabled && classroomCost ? { defaultDeClassroomCost: Number(classroomCost) } : {}),
      });
      await schedulingApi.updateSchedulingSettings({
        bufferTimeBetweenLessons: bufferMinutes ? Number(bufferMinutes) : undefined,
      });
      // Verify by re-fetching, not just trusting the write.
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
        <h2 className="text-lg font-semibold text-tx-primary">Pricing &amp; scheduling defaults</h2>
        <p className="text-sm text-tx-secondary mt-1">A starting point - every lesson's price and length can still be changed individually.</p>
      </div>

      {saveError && (
        <div className="bg-status-danger-bg border border-status-danger-border rounded-lg p-3 text-sm text-status-danger-text">
          {saveError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Default lesson price ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={lessonCost}
          onChange={(e) => setLessonCost(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Default lesson length (minutes)</label>
        <input
          type="number"
          min="1"
          value={lessonLength}
          onChange={(e) => setLessonLength(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-tx-secondary mb-1">Buffer between lessons (minutes)</label>
        <input
          type="number"
          min="0"
          value={bufferMinutes}
          onChange={(e) => setBufferMinutes(e.target.value)}
          className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
        />
      </div>

      {driverEducationEnabled && (
        <div>
          <label className="block text-sm font-medium text-tx-secondary mb-1">Driver Education classroom course price ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={classroomCost}
            onChange={(e) => setClassroomCost(e.target.value)}
            className="block w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-tx-primary"
          />
        </div>
      )}

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
