import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car } from 'lucide-react';
import { AuthPageShell } from '@/components/common';
import { useTenant } from '@/contexts/TenantContext';
import { onboardingApi } from '@/api';
import { StepSchoolDetails } from './StepSchoolDetails';
import { StepOfferings } from './StepOfferings';
import { StepDefaults } from './StepDefaults';
import { StepTeam } from './StepTeam';
import { StepDone } from './StepDone';
import type { TenantSettings } from '@/types';

const STEPS = ['School', 'Offerings', 'Defaults', 'Team'];

/**
 * Best-effort resume heuristic, derived from already-fetched real
 * settings data - not a stored step number. A user who explicitly
 * skipped a step but filled in an earlier one is re-shown that step on
 * resume, since nothing marks "skipped" as distinct from "never filled
 * in" at the per-step level. This is the correct, intended behavior:
 * nothing is lost, they're just asked again rather than the wizard
 * silently assuming "skipped" meant "never ask again."
 */
function resolveStartStep(settings: TenantSettings | null): number {
  if (!settings) return 1;
  if (settings.onboardingCompletedAt) return 5;
  if (!settings.supportPhone && !settings.addressLine1) return 1;
  if (settings.enableDriverEducation === undefined) return 2;
  if (!settings.defaultLessonCost || !settings.standardLessonLengthMinutes) return 3;
  return 4;
}

/**
 * Slim top progress bar with step names - replaces ProgressStepper's
 * circle/connector-line look for just this wizard (ProgressStepper
 * itself is shared with SmartBookingForm and stays untouched). Step 5
 * ("Done") has no entry here since the bar's purpose is "how far through
 * setup am I," which stops mattering once setup is finished - StepDone
 * has its own "you're all set" treatment instead.
 */
function WizardProgressBar({ currentStep }: { currentStep: number }) {
  const activeIndex = Math.min(currentStep, STEPS.length) - 1;
  const pct = currentStep > STEPS.length ? 100 : (activeIndex / (STEPS.length - 1)) * 100;

  return (
    <div className="mb-7">
      <div className="h-1 w-full rounded-full bg-surface3/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`text-xs font-medium transition-colors duration-300 ${
              i <= activeIndex ? 'text-primary' : 'text-tx-muted'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export const OnboardingWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, loading, refreshSettings } = useTenant();

  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [driverEducationEnabled, setDriverEducationEnabled] = useState(settings?.enableDriverEducation ?? false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Resolve the resume step once settings have loaded.
  React.useEffect(() => {
    if (!loading && currentStep === null) {
      setCurrentStep(resolveStartStep(settings));
    }
  }, [loading, settings, currentStep]);

  const handleFinishLater = async () => {
    setFinishError(null);
    setIsFinishing(true);
    try {
      await onboardingApi.complete();
    } catch {
      // Blocking, unlike refreshSettings() below - if this call didn't
      // reach the server, onboardingCompletedAt is still null there too,
      // so navigating now would bounce the user straight back into the
      // wizard with no explanation (the bug a live end-to-end run caught
      // in the previous version of this function). Surface it and stay
      // put instead, so the user can retry.
      setFinishError("Couldn't save. Try again.");
      setIsFinishing(false);
      return;
    }
    // Refresh BEFORE navigating - TenantContext's in-memory settings still
    // has onboardingCompletedAt: null until this resolves. Without it,
    // landing on "/" immediately bounces back into "/onboarding"
    // (RoleLandingRedirect reads the same stale settings) and the resume
    // heuristic then re-shows whatever step was last skipped, rather than
    // Done - a real race, not just a cosmetic flash, caught by a live
    // end-to-end run.
    try {
      await refreshSettings();
    } catch {
      // Non-blocking, unlike the complete() call above - complete()
      // already succeeded server-side by this point, so the worst case
      // is just that this client's in-memory settings stay stale until
      // the next real fetch catches up, not a bounce-back loop.
    }
    navigate('/', { replace: true });
  };

  if (loading || currentStep === null) {
    return (
      <div className="min-h-screen bg-appbg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  // prefers-reduced-motion check follows the same pattern already used
  // elsewhere in this app (StudentModal.tsx, SmartBookingForm/index.tsx):
  // read window.matchMedia directly rather than a CSS-only rule, since
  // the step-change animation is keyed by React remount, not a toggled
  // class.
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <AuthPageShell
      maxWidth="max-w-xl"
      footer={
        currentStep < 5 ? (
          <div className="text-center mt-4 space-y-2">
            {finishError && (
              <p className="text-sm text-status-danger-text">{finishError}</p>
            )}
            <button
              type="button"
              onClick={handleFinishLater}
              disabled={isFinishing}
              className="text-sm text-tx-muted hover:text-tx-secondary underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Finish later
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl shadow-lg mb-3">
          <Car className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-tx-primary">Set up your school</h1>
      </div>

      {currentStep <= STEPS.length && <WizardProgressBar currentStep={currentStep} />}

      <div
        key={currentStep}
        className={prefersReducedMotion ? '' : 'animate-[step-fade-rise_280ms_ease-out]'}
      >
        {currentStep === 1 && <StepSchoolDetails onContinue={() => setCurrentStep(2)} />}
        {currentStep === 2 && (
          <StepOfferings
            onContinue={(enabledDe) => {
              setDriverEducationEnabled(enabledDe);
              setCurrentStep(3);
            }}
          />
        )}
        {currentStep === 3 && (
          <StepDefaults
            driverEducationEnabled={driverEducationEnabled}
            onContinue={() => setCurrentStep(4)}
            onSkip={() => setCurrentStep(4)}
          />
        )}
        {currentStep === 4 && (
          <StepTeam onContinue={() => setCurrentStep(5)} onSkip={() => setCurrentStep(5)} />
        )}
        {currentStep === 5 && (
          <StepDone onGoToDashboard={handleFinishLater} isSaving={isFinishing} saveError={finishError} />
        )}
      </div>

      {/* Scoped keyframes for the step-change transition - not added to
          index.css (out of scope per the explicit constraint): a plain
          component-local <style> tag, same effect as a Tailwind arbitrary
          animate-[...] value needs a keyframes name to resolve against. */}
      <style>{`
        @keyframes step-fade-rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AuthPageShell>
  );
};

export default OnboardingWizardPage;
