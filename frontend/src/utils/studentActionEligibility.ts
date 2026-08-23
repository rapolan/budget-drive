import type { Student } from '@/types';

// The gold-gradient treatment for the guided "Mark complete" action -
// reads as the positive milestone action, consistent with the gold star
// (StudentStatusBadge's "Ready to Complete" badge) and the gold
// certificate badge (EnrollmentSubPanel) elsewhere in the app. Token-
// driven (gold-gradient-from/to, defined in index.css/tailwind.config.js),
// never a hardcoded hex - shared by the Students list's row action and
// StudentModal's persistent actions bar.
export const MARK_COMPLETE_BUTTON_CLASSES =
  'bg-gradient-to-br from-gold-gradient-from to-gold-gradient-to text-white shadow-sm hover:brightness-110 hover:scale-110 transition-all';

// Single source of truth for "is this student eligible for the guided Mark
// Complete action" - shared by the Students list (row actions) and
// StudentModal (the persistent detail-page actions bar), so the two
// surfaces can never disagree about when the action is available.
//
// An ACTIVE, not-yet-completed driver_training enrollment, gated
// differently per track (progress.track is read as already computed by
// computeStudentProgress; never re-derived here, per Constraint A -
// progressCalculationOwnership.test.ts enforces this for every display
// file in this codebase):
//   - HOURS track (minors, or an admin-pinned override): percentComplete
//     is measured against the real DMV-required hours - an objective
//     finish line, so the action auto-surfaces once it hits 100%.
//   - LESSONS track (adults): lessonsRequired is defined as lessonsBooked
//     itself, so no percentage ever means "finished" - an adult decides
//     when they're done, not a computed milestone. The action is always
//     available once they have at least one completed lesson, regardless
//     of percentComplete.
export function isReadyToMarkComplete(student: Student): boolean {
  if (student.activeEnrollment?.status !== 'active' || student.activeEnrollment.completed) {
    return false;
  }
  if (student.progress?.track === 'hours') {
    return student.progress.percentComplete >= 100;
  }
  if (student.progress?.track === 'lessons') {
    return (student.progress.lessonsCompleted ?? 0) >= 1;
  }
  return false;
}
