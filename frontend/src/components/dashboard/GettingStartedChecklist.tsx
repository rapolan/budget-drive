import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { dashboardApi } from '@/api';

const DISMISS_KEY = 'dashboard_getting_started_dismissed';

/**
 * Getting-started checklist, reused on both the Dashboard and the
 * onboarding wizard's final "Done" step. Every item's done-ness is
 * derived LIVE from real counts (instructors/vehicles/students/lessons)
 * on every render - nothing about done-ness is ever persisted, so it
 * can never drift from what's actually true. Dismiss is localStorage-
 * only (not a DB column, a deliberate judgment call - see
 * docs/ARCHITECTURE.md): per-device reappearance is an accepted
 * trade-off, and it composes for free with "hide when all done" since
 * the only scenario where storage location matters at all is
 * "everything still incomplete and the user wants it gone anyway."
 */
export const GettingStartedChecklist: React.FC = () => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const { data: countsData, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'getting-started-counts'],
    queryFn: () => dashboardApi.getGettingStartedCounts(),
    retry: false,
  });
  const counts = countsData?.data;

  const items = [
    { label: 'Add your first instructor', done: (counts?.instructorCount ?? 0) > 0, href: '/instructors' },
    { label: 'Add a vehicle', done: (counts?.vehicleCount ?? 0) > 0, href: '/vehicles' },
    { label: 'Add your first student', done: (counts?.studentCount ?? 0) > 0, href: '/students' },
    { label: 'Schedule your first lesson', done: (counts?.lessonCount ?? 0) > 0, href: '/lessons' },
  ];
  const allDone = items.every((item) => item.done);

  // isError covers a 403 for a role this endpoint doesn't allow (e.g.
  // viewer) - the card simply doesn't render rather than showing a
  // confusing all-incomplete checklist for a role that can't act on any
  // of its items anyway.
  if (isLoading || isError || allDone || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // localStorage unavailable (private browsing, blocked storage) -
      // dismissal just won't persist across reloads, not a crash.
    }
    setDismissed(true);
  };

  return (
    <div className="bg-surface rounded-xl border border-edge overflow-hidden" data-testid="getting-started-checklist">
      <div className="px-5 py-4 border-b border-edge bg-surface2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-tx-primary">Getting Started</h2>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss getting started checklist"
          className="text-tx-muted hover:text-tx-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 space-y-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => navigate(item.href)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface2 text-left transition-colors"
          >
            {item.done ? (
              <CheckCircle2 className="h-5 w-5 text-status-success-text flex-shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-tx-muted flex-shrink-0" />
            )}
            <span className={`text-sm ${item.done ? 'text-tx-muted line-through' : 'text-tx-primary'}`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default GettingStartedChecklist;
