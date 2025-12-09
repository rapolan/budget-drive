/**
 * Student Status Computation Utilities
 *
 * Automatically computes student status based on lesson data and permit expiration.
 * Status is READ-ONLY and computed in real-time (except for 'suspended' and manual 'dropped').
 */

import type { Student, Lesson } from '@/types';

export type ComputedStatus = 'enrolled' | 'active' | 'completed' | 'dropped' | 'suspended' | 'permit_expired';

export interface StatusInfo {
  status: ComputedStatus;
  displayStatus: string; // Human-readable status (hides permit_expired from UI)
  reason?: string; // Why the student has this status
  actionRequired?: boolean; // Does this status need admin action?
}

/**
 * Compute the actual student status based on lessons and data
 */
export function computeStudentStatus(student: Student, lessons: Lesson[]): StatusInfo {
  // Suspended and manually dropped are admin-controlled, not computed
  if (student.status === 'suspended') {
    return {
      status: 'suspended',
      displayStatus: 'Suspended',
      reason: 'Admin suspended',
      actionRequired: true,
    };
  }

  if (student.status === 'dropped') {
    return {
      status: 'dropped',
      displayStatus: 'Dropped',
      reason: 'Student withdrew',
    };
  }

  // Check if permit is expired
  const permitExpired = student.learnerPermitExpiration &&
    new Date(student.learnerPermitExpiration) < new Date();

  if (permitExpired) {
    // Hide permit_expired from UI - show as active/enrolled instead
    const studentLessons = lessons.filter(l => l.studentId === student.id);
    const hasLessons = studentLessons.length > 0;

    return {
      status: 'permit_expired',
      displayStatus: hasLessons ? 'Active' : 'Enrolled',
      reason: 'Permit expired - needs renewal',
      actionRequired: true,
    };
  }

  // Check if completed all required hours
  if (student.totalHoursCompleted >= (student.hoursRequired || 0)) {
    return {
      status: 'completed',
      displayStatus: 'Completed',
      reason: 'Finished all required hours',
    };
  }

  // Get student's lessons
  const studentLessons = lessons.filter(l => l.studentId === student.id);

  // If no lessons, student is enrolled but hasn't started
  if (studentLessons.length === 0) {
    return {
      status: 'enrolled',
      displayStatus: 'Enrolled',
      reason: 'No lessons booked yet',
    };
  }

  // Has lessons - student is active
  return {
    status: 'active',
    displayStatus: 'Active',
    reason: 'Currently learning',
  };
}

/**
 * Check if student needs follow-up
 * Considers last_contacted_at to avoid constant nagging
 */
export function studentNeedsFollowup(student: Student, lessons: Lesson[]): boolean {
  const statusInfo = computeStudentStatus(student, lessons);

  // Don't follow up with completed, dropped, or suspended students
  if (['completed', 'dropped', 'suspended'].includes(statusInfo.status)) {
    return false;
  }

  // Permit expired students need urgent follow-up (ignore last_contacted_at)
  if (statusInfo.status === 'permit_expired') {
    return true;
  }

  // Check if contacted recently (within last 7 days)
  if (student.lastContactedAt) {
    const daysSinceContact = (Date.now() - new Date(student.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact < 7) {
      return false; // Give them a 7-day grace period
    }
  }

  const studentLessons = lessons
    .filter(l => l.studentId === student.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Enrolled but no lessons for 7+ days
  if (studentLessons.length === 0) {
    const daysSinceEnrollment = (Date.now() - new Date(student.enrollmentDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceEnrollment > 7;
  }

  // Check for upcoming lessons
  const upcomingLessons = studentLessons.filter(lesson => {
    const lessonDate = new Date(lesson.date);
    return lesson.status === 'scheduled' && lessonDate > new Date();
  });

  // Has upcoming lessons - no follow-up needed
  if (upcomingLessons.length > 0) {
    return false;
  }

  // No upcoming lessons - check last lesson date
  const lastLesson = studentLessons.find(lesson =>
    lesson.status === 'completed' || lesson.status === 'scheduled'
  );

  if (!lastLesson) {
    // Only cancelled/no-show lessons
    return true;
  }

  const daysSinceLastLesson = (Date.now() - new Date(lastLesson.date).getTime()) / (1000 * 60 * 60 * 24);

  // Needs followup if last lesson was 14-60 days ago with no upcoming lessons
  return daysSinceLastLesson >= 14 && daysSinceLastLesson <= 60;
}

/**
 * Get reason why student needs follow-up
 */
export function getFollowupReason(student: Student, lessons: Lesson[]): string {
  const statusInfo = computeStudentStatus(student, lessons);

  if (statusInfo.status === 'permit_expired') {
    return 'Permit expired - urgent';
  }

  const studentLessons = lessons.filter(l => l.studentId === student.id);

  if (studentLessons.length === 0) {
    const daysSinceEnrollment = Math.floor(
      (Date.now() - new Date(student.enrollmentDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return `Enrolled ${daysSinceEnrollment} days ago, no lessons booked`;
  }

  const lastLesson = studentLessons
    .filter(l => l.status === 'completed' || l.status === 'scheduled')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (lastLesson) {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastLesson.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return `Last lesson ${daysSince} days ago, no upcoming lessons`;
  }

  return 'No completed lessons';
}
