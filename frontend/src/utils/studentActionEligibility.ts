import type { Student, Lesson } from '@/types';

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
// Two conditions, both required:
//   1. No remaining scheduled/upcoming lesson - a student with a lesson
//      still on the calendar isn't done, regardless of the completion
//      bar. This is a plain existence check on the caller's lessons list
//      (the same pattern StudentProgressCard already uses locally:
//      lessons.filter(l => l.status === 'scheduled')), NOT progress math
//      - it doesn't touch percentComplete/lessonsRequired, so it doesn't
//      violate Constraint A (progressCalculationOwnership.test.ts). This
//      check is needed here rather than sourced from student.progress
//      because the lessons track (adults) has no scheduled-lessons field
//      at all on StudentProgress - lessonsBooked conflates scheduled and
//      completed together, so it can't answer "any scheduled remaining?"
//      by itself.
//   2. The completion bar is met, gated differently per track
//      (progress.track is read as already computed by
//      computeStudentProgress; never re-derived here, per Constraint A -
//      progressCalculationOwnership.test.ts enforces this for every
//      display file in this codebase):
//        - HOURS track (minors, or an admin-pinned override):
//          percentComplete is measured against the real DMV-required
//          hours - an objective finish line, so the action auto-surfaces
//          once it hits 100%.
//        - LESSONS track (adults): lessonsRequired is defined as
//          lessonsBooked itself, so no percentage ever means "finished" -
//          an adult decides when they're done, not a computed milestone.
//          The action is available once they have at least one completed
//          lesson (and, per condition 1 above, none still scheduled).
export function isReadyToMarkComplete(student: Student, lessons: Lesson[]): boolean {
  if (student.activeEnrollment?.status !== 'active' || student.activeEnrollment.completed) {
    return false;
  }
  const hasScheduledLesson = lessons.some(
    (l) => l.studentId === student.id && l.status === 'scheduled'
  );
  if (hasScheduledLesson) {
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
