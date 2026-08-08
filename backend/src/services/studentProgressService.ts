/**
 * Student Progress Service
 *
 * Single source of truth for student progress. Every read path that
 * reports progress must go through computeStudentProgress - no display
 * surface may recompute this independently, and nothing may read
 * students.total_hours_completed for display (that column is a legacy
 * cache at most).
 *
 * Track selection: minors (under 18, derived live from date_of_birth,
 * never stored) progress against a configurable hours_required total.
 * Adults (18+) have no mandated hours and progress against lessons
 * actually booked. A completed program (item 6) short-circuits both.
 */

import { Student, Lesson, StudentProgress } from '../types';

export type { ProgressTrack, StudentProgress } from '../types';

type ProgressStudentInput = Pick<
  Student,
  'dateOfBirth' | 'hoursRequired' | 'completed' | 'completedAt' | 'completionReason' | 'trackOverride'
>;

type ProgressLessonInput = Pick<Lesson, 'status' | 'duration'>;

/**
 * Calculate age in whole years from a date of birth, live against today.
 * Mirrors frontend/src/utils/age.ts's calculateAge - same algorithm,
 * written once per side since there's no shared module across the
 * language boundary.
 */
export function calculateAge(dob: Date | string | null): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function computeStudentProgress(
  student: ProgressStudentInput,
  lessons: ProgressLessonInput[],
  standardLessonLengthMinutes: number = 120
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
  const age = calculateAge(student.dateOfBirth);
  const isMinor = age === null || age < 18;
  const track: 'hours' | 'lessons' =
    student.trackOverride === 'hours' || student.trackOverride === 'lessons'
      ? student.trackOverride
      : isMinor
      ? 'hours'
      : 'lessons';

  if (track === 'hours') {
    const hoursCompleted = round2(
      lessons.filter(l => l.status === 'completed').reduce((sum, l) => sum + l.duration, 0) / 60
    );
    const hoursScheduled = round2(
      lessons.filter(l => l.status === 'scheduled').reduce((sum, l) => sum + l.duration, 0) / 60
    );
    const hoursRequired = student.hoursRequired;

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
