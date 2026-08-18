import { describe, it, expect } from 'vitest';
import { studentNeedsFollowup, getFollowupReason, computeStudentStatus } from './studentStatus';
import type { Student, Lesson } from '@/types';

// studentStatus.ts's `now` parameter is required, never defaulted (a
// caller-supplied instant, matching what a real caller would pass in as
// tenant-resolved time - see docs/ARCHITECTURE.md §7). One fixed NOW here
// keeps every fixture and every call's `now` argument mutually consistent,
// regardless of real wall-clock drift during the test run.
const NOW = new Date();

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number): Date {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
}

const BASE_STUDENT: Student = {
  id: 'student-1',
  tenantId: 'tenant-1',
  fullName: 'Test Student',
  status: 'active',
  enrollmentDate: daysAgo(90),
  totalHoursCompleted: 5,
  createdAt: daysAgo(90),
  updatedAt: daysAgo(90),
} as Student;

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: null,
    date: daysAgo(1),
    startTime: '10:00',
    endTime: '12:00',
    duration: 120,
    lessonType: 'behind_wheel',
    status: 'completed',
    cost: 50,
    completionVerified: true,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...overrides,
  } as Lesson;
}

describe('studentNeedsFollowup - cancelled/no-show clause clears once a replacement lesson is booked', () => {
  it('flags a student with a cancelled lesson 3 days ago and no upcoming lesson', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(true);
  });

  it('does NOT flag a student with a cancelled lesson 3 days ago once a future lesson is booked', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(false);
  });

  it('flags a student with a no-show lesson 3 days ago and no upcoming lesson', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(3), status: 'no_show' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(true);
  });

  it('does NOT flag a student with a no-show lesson 3 days ago once a future lesson is booked', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'no_show' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(false);
  });

  it('still flags a student whose cancellation is within 14 days even with an unrelated past completed lesson', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(20), status: 'completed' }),
      lesson({ id: 'l2', date: daysAgo(10), status: 'cancelled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(true);
  });

  it('does not flag once the cancellation is older than 14 days (falls through to the gap-check clause instead)', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(20), status: 'cancelled' })];
    // No completed lesson exists, so the 14-60 day gap clause has nothing
    // to compare against either - overall result is "not flagged" via this path.
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(false);
  });
});

describe('studentNeedsFollowup - other branches (baseline coverage)', () => {
  it('never flags a completed/dropped/suspended student regardless of lesson history', () => {
    const completedStudent = { ...BASE_STUDENT, status: 'completed' as const };
    const lessons = [lesson({ date: daysAgo(3), status: 'cancelled' })];
    expect(studentNeedsFollowup(completedStudent, lessons, NOW)).toBe(false);
  });

  it('flags a student whose learner permit has expired, unconditionally', () => {
    const expiredStudent = { ...BASE_STUDENT, learnerPermitExpiration: daysAgo(1) };
    expect(studentNeedsFollowup(expiredStudent, [], NOW)).toBe(true);
  });

  it('does not flag a student contacted within the last 7 days, even with a recent cancellation', () => {
    const contactedStudent = { ...BASE_STUDENT, lastContactedAt: daysAgo(2) };
    const lessons = [lesson({ date: daysAgo(3), status: 'cancelled' })];
    expect(studentNeedsFollowup(contactedStudent, lessons, NOW)).toBe(false);
  });

  it('flags a new student with zero lessons enrolled more than 7 days ago', () => {
    const newStudent = { ...BASE_STUDENT, enrollmentDate: daysAgo(10) };
    expect(studentNeedsFollowup(newStudent, [], NOW)).toBe(true);
  });

  it('does not flag a new student with zero lessons enrolled within the last 7 days', () => {
    const newStudent = { ...BASE_STUDENT, enrollmentDate: daysAgo(2) };
    expect(studentNeedsFollowup(newStudent, [], NOW)).toBe(false);
  });

  it('flags a student with a 14-60 day gap since their last completed lesson and no upcoming lesson', () => {
    const lessons = [lesson({ date: daysAgo(30), status: 'completed' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(true);
  });

  it('does not flag a student with a 14-60 day gap if a future lesson is already booked', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(30), status: 'completed' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW)).toBe(false);
  });
});

describe('getFollowupReason - mirrors studentNeedsFollowup for the cancelled/no-show clause', () => {
  it('reports the cancellation reason when no future lesson is booked', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' })];
    expect(getFollowupReason(BASE_STUDENT, lessons, NOW)).toBe('Cancelled lesson 3 days ago');
  });

  it('does not report a stale cancellation reason once a future lesson is booked (falls through to a different reason)', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(getFollowupReason(BASE_STUDENT, lessons, NOW)).not.toBe('Cancelled lesson 3 days ago');
  });
});

describe('computeStudentStatus - end-to-end regression guard for the fix', () => {
  it('a student with a recent cancellation and a booked replacement lesson is no longer "needs_attention"', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW);
    expect(info.status).not.toBe('needs_attention');
  });

  it('a student with a recent cancellation and no replacement is still "needs_attention"', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' })];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW);
    expect(info.status).toBe('needs_attention');
  });
});
