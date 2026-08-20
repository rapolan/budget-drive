/**
 * Student Progress Service
 *
 * Single source of truth for student progress. Every read path that
 * reports progress must go through computeStudentProgress - no display
 * surface may recompute this independently. Operates on an enrollment's
 * program fields (hoursRequired, completed, completedAt, completionReason,
 * trackOverride, all from enrollments) plus the person's dateOfBirth (from
 * students) - Constraint B/C: the calculation itself is unchanged, only its
 * source moved from student columns to an enrollment.
 *
 * Track selection: minors (under 18, derived live from date_of_birth,
 * never stored) progress against a configurable hours_required total.
 * Adults (18+) have no mandated hours and progress against lessons
 * actually booked. A completed enrollment short-circuits both.
 */

import { Student, Enrollment, Lesson, StudentProgress } from '../types';
import { DEFAULT_TENANT_TIMEZONE, tenantToday, parseTenantDateOnly } from '../utils/tenantTime';

export type { ProgressTrack, StudentProgress } from '../types';

// dateOfBirth is person-level (Constraint C/B) - passed alongside an
// enrollment's program fields, not read from the enrollment itself.
type ProgressStudentInput = Pick<Student, 'dateOfBirth'> &
  Pick<Enrollment, 'hoursRequired' | 'completed' | 'completedAt' | 'completionReason' | 'trackOverride'>;

type ProgressLessonInput = Pick<Lesson, 'status' | 'duration'>;

/**
 * Calculate age in whole years from a date of birth, live against "today"
 * in the tenant's timezone (never server-local - a birthday at 11pm
 * Eastern on the 14th is still the 14th there even when the server's UTC
 * clock has already rolled to the 15th). `timezone` defaults to the
 * documented fallback so any not-yet-updated caller keeps compiling and
 * behaving as before; every real call site passes the tenant's actual zone.
 * Mirrors frontend/src/utils/age.ts's calculateAge - same algorithm,
 * written once per side since there's no shared module across the
 * language boundary (the frontend's version remains server-local, per the
 * documented frontend-follow-up).
 */
export function calculateAge(
  dob: Date | string | null,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = parseTenantDateOnly(tenantToday(timezone));
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age;
}

export function computeStudentProgress(
  student: ProgressStudentInput,
  lessons: ProgressLessonInput[],
  standardLessonLengthMinutes: number = 120,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): StudentProgress {
  const needsDateOfBirth = !student.dateOfBirth;

  // 1. Completed program is the sole source of truth - overrides all track math.
  if (student.completed) {
    return {
      track: 'completed',
      completedAt: student.completedAt ? new Date(student.completedAt).toISOString() : null,
      completionReason: student.completionReason ?? null,
      displayLabel: 'Completed',
      percentComplete: 100,
      needsDateOfBirth: false,
    };
  }

  // 2. A persisted track override pins the track regardless of age.
  // 3. Otherwise derive live from age; missing DOB defaults to HOURS track.
  const age = calculateAge(student.dateOfBirth, timezone);
  const isMinor = age === null || age < 18;
  const track: 'hours' | 'lessons' =
    student.trackOverride === 'hours' || student.trackOverride === 'lessons'
      ? student.trackOverride
      : isMinor
      ? 'hours'
      : 'lessons';

  if (track === 'hours') {
    // Postgres numeric columns (lessons.duration, enrollments.hours_required)
    // arrive as strings over the API/DB driver boundary - coerce before any
    // arithmetic, or `+` silently string-concatenates instead of adding.
    const hoursCompleted = round2(
      lessons.filter(l => l.status === 'completed').reduce((sum, l) => sum + Number(l.duration), 0) / 60
    );
    const hoursScheduled = round2(
      lessons.filter(l => l.status === 'scheduled').reduce((sum, l) => sum + Number(l.duration), 0) / 60
    );
    const hoursRequired = Number(student.hoursRequired);

    // Lesson-equivalent view: how many standard-length lessons it takes to
    // reach hoursRequired, so the Students list can speak "lessons" for
    // every student while the hours figures (still computed above, unchanged)
    // remain the legally meaningful numbers surfaced on the student record.
    const lessonsCompleted = lessons.filter(l => l.status === 'completed').length;
    const lessonsRequired = Math.ceil((hoursRequired * 60) / standardLessonLengthMinutes);
    const percentComplete =
      lessonsRequired > 0 ? Math.min(100, Math.round((lessonsCompleted / lessonsRequired) * 100)) : 0;

    return {
      track: 'hours',
      hoursCompleted,
      hoursRequired,
      hoursScheduled,
      lessonsCompleted,
      lessonsRequired,
      displayLabel: `${hoursCompleted} / ${hoursRequired} hrs`,
      percentComplete,
      needsDateOfBirth,
    };
  }

  // LESSONS track
  const lessonsCompleted = lessons.filter(l => l.status === 'completed').length;
  const lessonsBooked = lessons.filter(l => l.status !== 'cancelled').length;

  if (lessonsBooked === 0) {
    return {
      track: 'lessons',
      lessonsCompleted: 0,
      lessonsBooked: 0,
      lessonsRequired: 0,
      displayLabel: 'No lessons booked',
      percentComplete: 0,
      needsDateOfBirth,
    };
  }

  const lessonsPercent = Math.round((lessonsCompleted / lessonsBooked) * 100);

  return {
    track: 'lessons',
    lessonsCompleted,
    lessonsBooked,
    lessonsRequired: lessonsBooked,
    lessonsPercent,
    displayLabel: `${lessonsCompleted} of ${lessonsBooked} lessons (${lessonsPercent}%)`,
    percentComplete: lessonsPercent,
    needsDateOfBirth,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
