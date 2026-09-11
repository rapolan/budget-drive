/**
 * Student Status Computation Utilities
 *
 * Workflow-based status system for driving school management.
 * Statuses are designed around actionable workflow states:
 * - scheduled: Has upcoming lesson(s) - active learners
 * - ready_to_book: No upcoming lesson, not completed - needs scheduling
 * - needs_attention: Issues requiring admin action (permit expired, no-shows, long gaps)
 * - completed: Finished all required hours
 * - inactive: Dropped, suspended, or 60+ days no activity
 */

import type { Student, Lesson, ActiveEnrollmentSummary, DeEnrollmentSummary } from '@/types';
import { formatLocalDate, parseLocalDate } from './timeFormat';

export type ComputedStatus = 'scheduled' | 'ready_to_book' | 'needs_attention' | 'completed' | 'inactive';

// Normalizes a Lesson's `date` field to a plain YYYY-MM-DD string.
// `Lesson.date` is TYPED as `Date`, but at runtime (after JSON.parse from
// an API response) it's actually always a UTC-normalized ISO datetime
// STRING for what is really just a DATE column (e.g.
// "2026-08-25T00:00:00.000Z") - the established pattern elsewhere (e.g.
// Dashboard.tsx: `String(l.date).split('T')[0]`) relies on exactly that
// runtime shape. But a genuine `Date` INSTANCE (as any fixture faithfully
// typed to `Lesson` may legitimately construct, e.g. `new Date(...)` in a
// test) hits `Date.prototype.toString()` instead, which has NO 'T'
// separator at all - "Thu Aug 27 2026 ... GMT+0000" - so `.split('T')[0]`
// silently returns '' whenever the day-of-week name starts with a capital
// T (Tuesday/Thursday), and the comparison against nowDateStr fails
// regardless of the actual date. `toISOString()` for a Date instance
// sidesteps this entirely and always produces a real ISO string to split.
function toDateOnlyString(date: Date | string): string {
  const iso = date instanceof Date ? date.toISOString() : String(date);
  return iso.split('T')[0];
}

// A lesson is "upcoming" if it's still scheduled and its calendar date is
// today or later. Compares as YYYY-MM-DD STRINGS, not Date objects -
// lesson.date arrives from the API as a UTC-normalized ISO datetime (e.g.
// "2026-08-25T00:00:00.000Z") for what is really just a DATE column, so
// `new Date(lesson.date) >= now` compares a UTC midnight instant against a
// separately-constructed LOCAL midnight `now` - in any negative-UTC-offset
// timezone (every US timezone), a lesson dated TODAY resolves to ~5-8pm
// the day before once shifted to local time, landing before local
// midnight and failing the comparison. A lesson dated tomorrow or later
// happens to pass anyway, since the same shift still lands after today's
// local midnight - which is what made this bug invisible for every date
// except the one that matters most (a same-day booking). String-comparing
// the plain calendar dates sidesteps the whole instant-vs-instant problem.
function isUpcomingScheduledLesson(lesson: Lesson, nowDateStr: string): boolean {
  return lesson.status === 'scheduled' && toDateOnlyString(lesson.date) >= nowDateStr;
}

export interface StatusInfo {
  status: ComputedStatus;
  displayStatus: string; // Human-readable status for UI
  reason?: string; // Why the student has this status
  actionRequired?: boolean; // Does this status need admin action?
  upcomingLessonCount?: number; // For scheduled students
}

/**
 * Compute the actual student status based on lessons and data
 *
 * Workflow priority - terminal enrollment states are resolved FIRST and
 * always win over any transient/time-based signal (a completed or
 * withdrawn student going quiet is normal, never a reason to override
 * their real status - a bug once let 60+ days of quiet silently flip a
 * completed enrollment to "Inactive"):
 * 1. Dropped (withdrawn) / Suspended / Inactive (enrollment.status) - archive
 * 2. No active enrollment at all
 * 3. Completed - explicit admin-verified completion
 * 4. 60+ days no activity (only reachable for an enrollment still active
 *    and not completed - every terminal state above already returned)
 * 5. Needs Attention - issues requiring action
 * 6. Scheduled - has upcoming lessons
 * 7. Ready to Book - no upcoming lessons, needs scheduling
 *
 * `now` is REQUIRED, never defaulted - callers must pass a tenant-resolved
 * instant (e.g. parseLocalDate(tenantNow.today) from TenantContext), never
 * let this fall back to the browser's own clock (see docs/ARCHITECTURE.md
 * §7). A missing `now` is a compile error, not a silent browser-time
 * fallback.
 *
 * `activeEnrollment` is REQUIRED (not read from student.activeEnrollment
 * internally) so a future caller can't silently pass a student whose
 * enrollment data wasn't loaded - status/completed/completionReason/
 * enrollmentDate all moved from students to enrollments in the
 * person/enrollment refactor. `null` means the student currently has no
 * active driver_training enrollment (their prior one completed and no new
 * one has started) - a real, distinct state, not missing data.
 */
export function computeStudentStatus(
  student: Student,
  lessons: Lesson[],
  now: Date,
  activeEnrollment: ActiveEnrollmentSummary | null
): StatusInfo {
  const studentLessons = lessons.filter(l => l.studentId === student.id);
  const nowDateStr = formatLocalDate(now);

  // Get upcoming scheduled lessons
  const upcomingLessons = studentLessons.filter(lesson => isUpcomingScheduledLesson(lesson, nowDateStr));

  // 1. INACTIVE: withdrawn, suspended, inactive, or 60+ days no activity.
  // `withdrawn` owns the "student left" meaning - it's a distinct status
  // (with its own withdrawn_at/withdrawn_by/withdrawn_reason audit trail,
  // set only via the guarded POST /enrollments/:id/withdraw) from
  // `inactive`, which carries no defined meaning of its own beyond "not
  // active, not any of the other statuses" - nothing in this codebase
  // currently writes `inactive`, so it deliberately gets a neutral label
  // rather than a specific story like "withdrew" (that language belongs
  // to `withdrawn` alone).
  if (activeEnrollment?.status === 'withdrawn') {
    return {
      status: 'inactive',
      displayStatus: 'Dropped',
      reason: activeEnrollment.withdrawnReason || 'Student withdrew',
    };
  }

  if (activeEnrollment?.status === 'suspended') {
    return {
      status: 'inactive',
      displayStatus: 'Suspended',
      reason: 'Admin suspended',
    };
  }

  if (activeEnrollment?.status === 'inactive') {
    return {
      status: 'inactive',
      displayStatus: 'Inactive',
      reason: 'Enrollment inactive',
    };
  }

  // No driver_training enrollment to show at all - the backend now
  // resolves the active one if it exists, else the most recently
  // completed one, else the most recently updated one regardless of
  // status (see enrollmentService.getDisplayDriverTrainingEnrollmentsBatch),
  // so `null` here specifically means the student has never had a
  // driver_training enrollment reach ANY state. A completed, withdrawn,
  // suspended, or inactive program no longer falls through to this branch -
  // each is caught by its own check instead, since `activeEnrollment`
  // carries it now.
  if (!activeEnrollment) {
    return {
      status: 'inactive',
      displayStatus: 'No Active Enrollment',
      reason: 'No active driver_training enrollment',
    };
  }

  // 2. COMPLETED: Explicit admin-verified program completion (see item 6) -
  // this is the sole source of truth, not an hours-threshold auto-derivation.
  // Resolved here, BEFORE the 60+-day-inactivity check below - a terminal
  // state (completed, and withdrawn/suspended/inactive above) must always
  // win over a transient time-based signal. A completed student going
  // quiet for 60+ days after finishing is normal, not a reason to silently
  // flip their status to "Inactive" and make "Completed" unreachable once
  // enough time passes (the exact bug this ordering fixes - found live
  // against seed student Naomi Frasier, completed Aug 3 with her last
  // lesson Jun 14, previously showing "Inactive").
  if (activeEnrollment.completed) {
    return {
      status: 'completed',
      displayStatus: 'Completed',
      reason: activeEnrollment.completionReason || 'Program marked complete',
    };
  }

  // Check for 60+ days of inactivity (no lessons at all, or last lesson was
  // 60+ days ago) - only reachable here, for an enrollment that is still
  // active (every terminal status - withdrawn/suspended/inactive/completed -
  // was already resolved and returned above).
  if (studentLessons.length > 0 && upcomingLessons.length === 0) {
    const lastLesson = studentLessons
      .filter(l => l.status === 'completed' || l.status === 'cancelled' || l.status === 'no_show')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (lastLesson) {
      const daysSinceLastLesson = (now.getTime() - new Date(lastLesson.date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastLesson > 60) {
        return {
          status: 'inactive',
          displayStatus: 'Inactive',
          reason: `No activity for ${Math.floor(daysSinceLastLesson)} days`,
        };
      }
    }
  }

  // 3. NEEDS ATTENTION: Issues requiring admin action
  if (studentNeedsFollowup(student, studentLessons, now, activeEnrollment)) {
    return {
      status: 'needs_attention',
      displayStatus: 'Needs Attention',
      reason: getFollowupReason(student, lessons, now, activeEnrollment),
      actionRequired: true,
    };
  }

  // 4. SCHEDULED: Has upcoming lesson(s). Count is non-cancelled upcoming
  // lessons for the active enrollment - upcomingLessons above already
  // filters to status === 'scheduled' (excludes cancelled/no_show), so its
  // length is exactly that count.
  if (upcomingLessons.length > 0) {
    const nextLesson = upcomingLessons.sort((a, b) =>
      toDateOnlyString(a.date).localeCompare(toDateOnlyString(b.date))
    )[0];
    // Same UTC-vs-local mismatch as isUpcomingScheduledLesson above -
    // compare calendar-date strings, not a UTC-shifted Date's toDateString().
    const nextLessonDateStr = toDateOnlyString(nextLesson.date);
    const isToday = nextLessonDateStr === nowDateStr;
    const nextLessonDate = parseLocalDate(nextLessonDateStr);

    return {
      status: 'scheduled',
      displayStatus: `Scheduled (${upcomingLessons.length})`,
      reason: isToday
        ? `Lesson today at ${nextLesson.startTime}`
        : `Next lesson: ${nextLessonDate.toLocaleDateString()}`,
      upcomingLessonCount: upcomingLessons.length,
    };
  }

  // 5. READY TO BOOK: No upcoming lessons, needs scheduling. This is the
  // calm between-lessons state, not an alert - "no upcoming lessons" is
  // not itself a flag (the time-based follow-up check above already
  // caught the cases that actually need urgency), so this never carries
  // actionRequired/amber styling.
  return {
    status: 'ready_to_book',
    displayStatus: 'Ready to Book',
    reason: studentLessons.length === 0
      ? 'New student - no lessons yet'
      : 'No upcoming lessons scheduled',
  };
}

/**
 * Check if student needs follow-up (attention required)
 * This is for URGENT issues that need admin action:
 * - Permit expired
 * - Recent cancelled/no-show lessons
 * - No lessons booked for 7+ days after enrollment
 *
 * Note: Students with no upcoming lessons but otherwise OK go to "Ready to Book"
 */
export function studentNeedsFollowup(
  student: Student,
  studentLessons: Lesson[],
  now: Date,
  activeEnrollment: ActiveEnrollmentSummary | null
): boolean {
  // Don't flag completed, withdrawn, inactive, or suspended students
  if (!activeEnrollment || activeEnrollment.completed || ['withdrawn', 'inactive', 'suspended'].includes(activeEnrollment.status)) {
    return false;
  }

  // 1. URGENT: Permit expired
  const permitExpired = student.learnerPermitExpiration &&
    new Date(student.learnerPermitExpiration) < now;

  if (permitExpired) {
    return true;
  }

  // Check if contacted recently (within last 7 days) - grace period
  if (student.lastContactedAt) {
    const daysSinceContact = (now.getTime() - new Date(student.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact < 7) {
      return false;
    }
  }

  // 2. New student with no lessons for 7+ days
  if (studentLessons.length === 0) {
    const daysSinceEnrollment = (now.getTime() - new Date(activeEnrollment.enrollmentDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceEnrollment > 7;
  }

  // Upcoming lessons - computed once, used both to resolve a recent
  // cancellation/no-show (clause 3) and to gate the long-gap check (clause 4).
  const upcomingLessons = studentLessons.filter(l => isUpcomingScheduledLesson(l, formatLocalDate(now)));

  // 3. Recent cancelled or no-show lessons (within 14 days), UNLESS a
  // future lesson has since been booked - a replacement lesson resolves
  // the flag rather than leaving it stuck until the 14-day window lapses.
  const recentCancelledOrNoShow = studentLessons.filter(lesson => {
    const lessonDate = new Date(lesson.date);
    const daysSinceLesson = (now.getTime() - lessonDate.getTime()) / (1000 * 60 * 60 * 24);
    return (lesson.status === 'cancelled' || lesson.status === 'no_show') && daysSinceLesson <= 14;
  });

  if (recentCancelledOrNoShow.length > 0 && upcomingLessons.length === 0) {
    return true;
  }

  // 4. Gap of 14-60 days since last completed lesson (and no upcoming)
  if (upcomingLessons.length === 0) {
    const lastCompletedLesson = studentLessons
      .filter(l => l.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (lastCompletedLesson) {
      const daysSinceLastLesson = (now.getTime() - new Date(lastCompletedLesson.date).getTime()) / (1000 * 60 * 60 * 24);
      // 14-60 day gap needs attention (60+ goes to inactive)
      if (daysSinceLastLesson >= 14 && daysSinceLastLesson <= 60) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get reason why student needs follow-up
 */
export function getFollowupReason(
  student: Student,
  lessons: Lesson[],
  now: Date,
  activeEnrollment: ActiveEnrollmentSummary | null
): string {
  const studentLessons = lessons.filter(l => l.studentId === student.id);

  // 1. Permit expired
  const permitExpired = student.learnerPermitExpiration &&
    new Date(student.learnerPermitExpiration) < now;

  if (permitExpired) {
    return 'Permit expired - urgent';
  }

  // 2. New student with no lessons
  if (studentLessons.length === 0 && activeEnrollment) {
    const daysSinceEnrollment = Math.floor(
      (now.getTime() - new Date(activeEnrollment.enrollmentDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return `Enrolled ${daysSinceEnrollment} days ago, no lessons booked`;
  }

  // 3. Recent cancelled or no-show, UNLESS a future lesson has since been
  // booked (mirrors studentNeedsFollowup's clause 3 - see there for why).
  const upcomingLessons = studentLessons.filter(l => isUpcomingScheduledLesson(l, formatLocalDate(now)));

  const recentCancelledOrNoShow = studentLessons
    .filter(lesson => {
      const lessonDate = new Date(lesson.date);
      const daysSinceLesson = (now.getTime() - lessonDate.getTime()) / (1000 * 60 * 60 * 24);
      return (lesson.status === 'cancelled' || lesson.status === 'no_show') && daysSinceLesson <= 14;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (recentCancelledOrNoShow.length > 0 && upcomingLessons.length === 0) {
    const latest = recentCancelledOrNoShow[0];
    const daysAgo = Math.floor((now.getTime() - new Date(latest.date).getTime()) / (1000 * 60 * 60 * 24));
    if (latest.status === 'cancelled') {
      return `Cancelled lesson ${daysAgo} days ago`;
    } else {
      return `No-show ${daysAgo} days ago`;
    }
  }

  // 4. Gap since last completed lesson
  const lastCompletedLesson = studentLessons
    .filter(l => l.status === 'completed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (lastCompletedLesson) {
    const daysSince = Math.floor(
      (now.getTime() - new Date(lastCompletedLesson.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return `${daysSince} days since last lesson`;
  }

  return 'Needs scheduling';
}

/**
 * Composite "needs attention" reasons - the single source of truth for
 * WHY a student is flagged, shared by the Students list row badge (whose
 * `title` tooltip is otherwise the only place these reasons surface) and
 * StudentModal's detail-view summary, so the two surfaces can never
 * disagree. Deliberately NOT folded into computeStudentStatus itself,
 * which stays a pure function shared with Dashboard.tsx - Dashboard
 * already renders needsGuardian/hasOutstandingFee/no-show as their own
 * separate alert cards, and widening the shared status computation would
 * silently duplicate those into its "Needs Attention" count too. Each
 * reason gets a short, admin-facing label (+ a longer tooltip/detail
 * string) - a student can carry more than one; all applicable reasons are
 * returned, not just the first.
 */
export interface AttentionReason {
  label: string;
  title: string;
}

export function getNeedsAttentionReasons(
  student: Student,
  lessons: Lesson[],
  now: Date,
  noShowStudentIds: Set<string>
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const statusInfo = computeStudentStatus(student, lessons, now, student.activeEnrollment ?? null);
  if (statusInfo.status === 'needs_attention') {
    reasons.push({
      label: 'Follow up',
      title: getFollowupReason(student, lessons, now, student.activeEnrollment ?? null),
    });
  }
  if (student.needsGuardian) {
    reasons.push({ label: 'Needs guardian', title: 'This minor has no linked guardian record' });
  }
  if (student.hasOutstandingFee) {
    reasons.push({ label: 'Fee due', title: `Outstanding fee: $${(student.outstandingFeeAmount ?? 0).toFixed(2)}` });
  }
  if (noShowStudentIds.has(student.id)) {
    reasons.push({ label: 'No-show follow-up', title: 'Missed a lesson - follow-up not yet dismissed' });
  }
  return reasons;
}

/**
 * Driver Education (DE) status - a PARALLEL, deliberately separate track
 * from ComputedStatus/StatusInfo above, not a case folded into that union.
 * A DE program is linear (unassigned -> enrolled -> attending -> complete),
 * not a booking workflow, so BTW's lesson/permit/60-day-gap concepts have
 * no meaning here. Forcing DE into ComputedStatus would grow every switch
 * over it with dead branches - see docs/ARCHITECTURE.md's Students-page
 * section for the full rationale.
 *
 * Text is a direct port of what EnrollmentSubPanel.tsx already renders for
 * a DE enrollment's progress line - reused wording, not a new calculation,
 * and reads the SAME classroomAttendance data the Classroom roster and
 * EnrollmentSubPanel already read.
 */
export type DeComputedStatus = 'no_enrollment' | 'unassigned' | 'enrolled' | 'completed';

export interface DeStatusInfo {
  status: DeComputedStatus;
  displayStatus: string;
  reason?: string;
}

export function computeDeStatus(deEnrollment: DeEnrollmentSummary | null | undefined): DeStatusInfo {
  if (!deEnrollment) {
    return {
      status: 'no_enrollment',
      displayStatus: 'No DE Enrollment',
      reason: 'No driver_education enrollment',
    };
  }

  if (deEnrollment.deDeliveryMode === 'classroom' && deEnrollment.classroomAttendance) {
    const attended = deEnrollment.classroomAttendance.attendedCurriculumDays.length;
    if (deEnrollment.completed) {
      return {
        status: 'completed',
        displayStatus: 'DE Completed',
        reason: `Completed - ${attended}/4 days attended`,
      };
    }
    return {
      status: attended > 0 ? 'enrolled' : 'unassigned',
      displayStatus: `${attended}/4 days attended`,
      reason: deEnrollment.cohortName ? `Enrolled in ${deEnrollment.cohortName}` : 'Not yet assigned to a cohort',
    };
  }

  // Online delivery (or classroom with no attendance data yet, e.g. not
  // assigned to a cohort) - manual-hours driven, same wording as
  // EnrollmentSubPanel's online branch.
  const hours = deEnrollment.manualCompletedHours ?? 0;
  if (deEnrollment.completed) {
    return {
      status: 'completed',
      displayStatus: 'DE Completed',
      reason: `Completed - ${deEnrollment.manualCompletedHours ?? '?'} hours`,
    };
  }
  return {
    status: hours > 0 ? 'enrolled' : 'unassigned',
    displayStatus: `${hours} hours logged`,
    reason: 'Manually entered - DE hours logged so far',
  };
}

// Renamed from ProgramFilter - the Students page reframed program as a
// Notion-style tab (a view), not a filter chip layered on top of an
// always-BTW-shaped page. Same three values, same semantics (which
// program's presentation is active) - only the name changed to match
// what it actually drives.
export type ProgramTab = 'all' | 'btw' | 'de';

export type DisplayStatus =
  | { kind: 'btw'; info: StatusInfo }
  | { kind: 'de'; info: DeStatusInfo };

/**
 * Single dispatcher between the two status tracks - the one call site
 * Students.tsx uses in place of the old assume-BTW getStudentStatus call.
 * 'all' resolves to the FURTHEST-ALONG program's status: a BTW enrollment
 * implies DE is already behind the student (programs are sequential,
 * DE -> BTW), so BTW status is the meaningful one to show; otherwise DE
 * status (or "No DE Enrollment" for a student in neither program).
 */
export function getDisplayStatus(
  student: Pick<Student, 'activeEnrollment'>,
  programTab: ProgramTab,
  btwStatus: StatusInfo,
  deStatus: DeStatusInfo
): DisplayStatus {
  if (programTab === 'de') return { kind: 'de', info: deStatus };
  if (programTab === 'btw') return { kind: 'btw', info: btwStatus };
  return student.activeEnrollment !== null && student.activeEnrollment !== undefined
    ? { kind: 'btw', info: btwStatus }
    : { kind: 'de', info: deStatus };
}

// A SEPARATE, independent classification of the same DeEnrollmentSummary
// input computeDeStatus reads - this answers "which card/status-filter
// bucket does this enrollment belong to" (for the Students page's Driver
// Education tab), not "what text should the status badge show"
// (computeDeStatus's job). Both read the same data, so they can never
// disagree about the underlying facts, only about which of these two
// independent questions is being answered.
//
// 'online_in_progress' exists so an online DE student mid-program isn't
// silently dropped from every DE-tab count - it just has no dedicated
// stat card (the page fixes exactly 4: In a Class / Unassigned /
// Completed / Awaiting Cert, since neither "in a class" nor "unassigned"
// describes an online student), reachable only via the DE tab's "All"
// status-filter chip.
export type DeCardFilter = 'in_class' | 'unassigned' | 'completed' | 'awaiting_cert' | 'online_in_progress' | 'no_enrollment';

/**
 * awaitingCertificate takes priority over the plain `completed` bucket -
 * a completed-but-uncertified DE minor is actionable admin work (a DL
 * 400B/C still needs recording), so it gets its own bucket/card rather
 * than being folded into "Completed" where the missing certificate would
 * be invisible until someone opens the record.
 */
export function classifyDeCard(deEnrollment: DeEnrollmentSummary | null | undefined): DeCardFilter {
  if (!deEnrollment) return 'no_enrollment';
  if (deEnrollment.completed) {
    return deEnrollment.awaitingCertificate ? 'awaiting_cert' : 'completed';
  }
  if (deEnrollment.deDeliveryMode === 'classroom') {
    return deEnrollment.cohortName !== null ? 'in_class' : 'unassigned';
  }
  // Online, or classroom with no delivery mode resolved yet (a pre-Phase-3
  // row) - neither has a cohort concept, so both fall back here.
  return 'online_in_progress';
}
