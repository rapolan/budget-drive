import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/common';
import { GettingStartedChecklist } from '@/components/dashboard/GettingStartedChecklist';

interface StepDoneProps {
  onGoToDashboard: () => void;
  isSaving?: boolean;
  saveError?: string | null;
}

/**
 * onGoToDashboard (Onboarding.tsx's handleFinishLater) is what actually
 * calls onboardingApi.complete() and refreshSettings() before navigating -
 * not this component. Marking complete here too, fire-and-forget on
 * mount, used to race that call: TenantContext's settings could still be
 * stale when "/" redirected based on them, bouncing the user straight
 * back into the wizard at whatever step the resume heuristic computed
 * from the old data. Single source of truth now, on the actual exit.
 * isSaving/saveError are passed straight through from that same call, so
 * a failure here stays visible rather than silently stranding the user.
 */
export const StepDone: React.FC<StepDoneProps> = ({ onGoToDashboard, isSaving = false, saveError = null }) => {
  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="inline-flex items-center justify-center w-16 h-16 bg-status-success-bg rounded-2xl mb-4">
          <CheckCircle2 className="h-8 w-8 text-status-success-text" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-tx-primary">You're all set</h2>
        <p className="text-sm text-tx-muted mt-1">Here's what's next for getting your school up and running.</p>
      </div>

      <div className="text-left">
        <GettingStartedChecklist />
      </div>

      {saveError && (
        <p className="text-sm text-status-danger-text">{saveError}</p>
      )}

      <Button onClick={onGoToDashboard} loading={isSaving}>Go to Dashboard</Button>
    </div>
  );
};
