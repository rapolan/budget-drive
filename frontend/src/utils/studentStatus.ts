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

import type { Student, Lesson } from '@/types';

export type ComputedStatus = 'scheduled' | 'ready_to_book' | 'needs_attention' | 'completed' | 'inactive';

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
 * Workflow priority:
 * 1. Inactive (dropped/suspended/60+ days no activity) - archive
 * 2. Completed - finished all hours
 * 3. Needs Attention - issues requiring action
 * 4. Scheduled - has upcoming lessons
 * 5. Ready to Book - no upcoming lessons, needs scheduling
 */
export function computeStudentStatus(student: Student, lessons: Lesson[]): StatusInfo {
  const studentLessons = lessons.filter(l => l.studentId === student.id);
  const now = new Date();

  // Get upcoming scheduled lessons
  const upcomingLessons = studentLessons.filter(lesson => {
    const lessonDate = new Date(lesson.date);
    return lesson.status === 'scheduled' && lessonDate >= now;
  });

  // 1. INACTIVE: Dropped, suspended, or 60+ days no activity
  if (student.status === 'suspended') {
    return {
      status: 'inactive',
      displayStatus: 'Suspended',
      reason: 'Admin suspended',
    };
  }

  if (student.status === 'dropped') {
    return {
      status: 'inactive',
      displayStatus: 'Dropped',
      reason: 'Student withdrew',
    };
  }

  // Check for 60+ days of inactivity (no lessons at all, or last lesson was 60+ days ago)
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

  // 2. COMPLETED: Finished all required hours
  if (student.totalHoursCompleted >= (student.hoursRequired || 0) && (student.hoursRequired || 0) > 0) {
    return {
      status: 'completed',
      displayStatus: 'Completed',
      reason: 'Finished all required hours',
    };
  }

  // 3. NEEDS ATTENTION: Issues requiring admin action
  if (studentNeedsFollowup(student, studentLessons)) {
    return {
      status: 'needs_attention',
      displayStatus: 'Needs Attention',
      reason: getFollowupReason(student, lessons),
      actionRequired: true,
    };
  }

  // 4. SCHEDULED: Has upcoming lesson(s)
  if (upcomingLessons.length > 0) {
    const nextLesson = upcomingLessons.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )[0];
    const nextLessonDate = new Date(nextLesson.date);
    const isToday = nextLessonDate.toDateString() === now.toDateString();

    return {
      status: 'scheduled',
      displayStatus: 'Scheduled',
      reason: isToday
        ? `Lesson today at ${nextLesson.startTime}`
        : `Next lesson: ${nextLessonDate.toLocaleDateString()}`,
      upcomingLessonCount: upcomingLessons.length,
    };
  }

  // 5. READY TO BOOK: No upcoming lessons, needs scheduling
  return {
    status: 'ready_to_book',
    displayStatus: 'Ready to Book',
    reason: studentLessons.length === 0
      ? 'New student - no lessons yet'
      : 'No upcoming lessons scheduled',
    actionRequired: true,
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
export function studentNeedsFollowup(student: Student, studentLessons: Lesson[]): boolean {
  // Don't flag completed, dropped, or suspended students
  if (['completed', 'dropped', 'suspended'].includes(student.status)) {
    return false;
  }

  const now = new Date();

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
    const daysSinceEnrollment = (now.getTime() - new Date(student.enrollmentDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceEnrollment > 7;
  }

  // 3. Recent cancelled or no-show lessons (within 14 days)
  const recentCancelledOrNoShow = studentLessons.filter(lesson => {
    const lessonDate = new Date(lesson.date);
    const daysSinceLesson = (now.getTime() - lessonDate.getTime()) / (1000 * 60 * 60 * 24);
    return (lesson.status === 'cancelled' || lesson.status === 'no_show') && daysSinceLesson <= 14;
  });

  if (recentCancelledOrNoShow.length > 0) {
    return true;
  }

  // 4. Gap of 14-60 days since last completed lesson (and no upcoming)
  const upcomingLessons = studentLessons.filter(l =>
    l.status === 'scheduled' && new Date(l.date) >= now
  );

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
export function getFollowupReason(student: Student, lessons: Lesson[]): string {
  const studentLessons = lessons.filter(l => l.studentId === student.id);
  const now = new Date();

  // 1. Permit expired
  const permitExpired = student.learnerPermitExpiration &&
    new Date(student.learnerPermitExpiration) < now;

  if (permitExpired) {
    return 'Permit expired - urgent';
  }

  // 2. New student with no lessons
  if (studentLessons.length === 0) {
    const daysSinceEnrollment = Math.floor(
      (now.getTime() - new Date(student.enrollmentDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return `Enrolled ${daysSinceEnrollment} days ago, no lessons booked`;
  }

  // 3. Recent cancelled or no-show
  const recentCancelledOrNoShow = studentLessons
    .filter(lesson => {
      const lessonDate = new Date(lesson.date);
      const daysSinceLesson = (now.getTime() - lessonDate.getTime()) / (1000 * 60 * 60 * 24);
      return (lesson.status === 'cancelled' || lesson.status === 'no_show') && daysSinceLesson <= 14;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (recentCancelledOrNoShow.length > 0) {
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
