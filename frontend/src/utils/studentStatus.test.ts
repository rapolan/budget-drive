import { describe, it, expect } from 'vitest';
import { studentNeedsFollowup, getFollowupReason, computeStudentStatus } from './studentStatus';
import type { Student, Lesson, ActiveEnrollmentSummary } from '@/types';

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
  createdAt: daysAgo(90),
  updatedAt: daysAgo(90),
} as Student;

// status/completed/completionReason/enrollmentDate moved from students to
// enrollments per the person/enrollment refactor - this fixture is what
// studentStatus.ts's functions now take as an explicit parameter instead of
// reading off the student.
const BASE_ENROLLMENT: ActiveEnrollmentSummary = {
  id: 'enrollment-1',
  programType: 'driver_training',
  status: 'active',
  enrollmentDate: daysAgo(90),
  completed: false,
  completionReason: null,
  withdrawnReason: null,
};

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
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(true);
  });

  it('does NOT flag a student with a cancelled lesson 3 days ago once a future lesson is booked', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(false);
  });

  it('flags a student with a no-show lesson 3 days ago and no upcoming lesson', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(3), status: 'no_show' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(true);
  });

  it('does NOT flag a student with a no-show lesson 3 days ago once a future lesson is booked', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'no_show' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(false);
  });

  it('still flags a student whose cancellation is within 14 days even with an unrelated past completed lesson', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(20), status: 'completed' }),
      lesson({ id: 'l2', date: daysAgo(10), status: 'cancelled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(true);
  });

  it('does not flag once the cancellation is older than 14 days (falls through to the gap-check clause instead)', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(20), status: 'cancelled' })];
    // No completed lesson exists, so the 14-60 day gap clause has nothing
    // to compare against either - overall result is "not flagged" via this path.
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(false);
  });
});

describe('studentNeedsFollowup - other branches (baseline coverage)', () => {
  it('never flags a student with no active enrollment', () => {
    const lessons = [lesson({ date: daysAgo(3), status: 'cancelled' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, null)).toBe(false);
  });

  it('never flags a completed enrollment regardless of lesson history', () => {
    const completedEnrollment = { ...BASE_ENROLLMENT, completed: true };
    const lessons = [lesson({ date: daysAgo(3), status: 'cancelled' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, completedEnrollment)).toBe(false);
  });

  it('never flags a withdrawn, inactive, or suspended enrollment regardless of lesson history', () => {
    const lessons = [lesson({ date: daysAgo(3), status: 'cancelled' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, { ...BASE_ENROLLMENT, status: 'withdrawn' })).toBe(false);
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, { ...BASE_ENROLLMENT, status: 'inactive' })).toBe(false);
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, { ...BASE_ENROLLMENT, status: 'suspended' })).toBe(false);
  });

  it('flags a student whose learner permit has expired, unconditionally', () => {
    const expiredStudent = { ...BASE_STUDENT, learnerPermitExpiration: daysAgo(1) };
    expect(studentNeedsFollowup(expiredStudent, [], NOW, BASE_ENROLLMENT)).toBe(true);
  });

  it('does not flag a student contacted within the last 7 days, even with a recent cancellation', () => {
    const contactedStudent = { ...BASE_STUDENT, lastContactedAt: daysAgo(2) };
    const lessons = [lesson({ date: daysAgo(3), status: 'cancelled' })];
    expect(studentNeedsFollowup(contactedStudent, lessons, NOW, BASE_ENROLLMENT)).toBe(false);
  });

  it('flags a new student with zero lessons enrolled more than 7 days ago', () => {
    const newEnrollment = { ...BASE_ENROLLMENT, enrollmentDate: daysAgo(10) };
    expect(studentNeedsFollowup(BASE_STUDENT, [], NOW, newEnrollment)).toBe(true);
  });

  it('does not flag a new student with zero lessons enrolled within the last 7 days', () => {
    const newEnrollment = { ...BASE_ENROLLMENT, enrollmentDate: daysAgo(2) };
    expect(studentNeedsFollowup(BASE_STUDENT, [], NOW, newEnrollment)).toBe(false);
  });

  it('flags a student with a 14-60 day gap since their last completed lesson and no upcoming lesson', () => {
    const lessons = [lesson({ date: daysAgo(30), status: 'completed' })];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(true);
  });

  it('does not flag a student with a 14-60 day gap if a future lesson is already booked', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(30), status: 'completed' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(studentNeedsFollowup(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe(false);
  });
});

describe('getFollowupReason - mirrors studentNeedsFollowup for the cancelled/no-show clause', () => {
  it('reports the cancellation reason when no future lesson is booked', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' })];
    expect(getFollowupReason(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).toBe('Cancelled lesson 3 days ago');
  });

  it('does not report a stale cancellation reason once a future lesson is booked (falls through to a different reason)', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    expect(getFollowupReason(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT)).not.toBe('Cancelled lesson 3 days ago');
  });
});

describe('computeStudentStatus - end-to-end regression guard for the fix', () => {
  it('a student with a recent cancellation and a booked replacement lesson is no longer "needs_attention"', () => {
    const lessons = [
      lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' }),
      lesson({ id: 'l2', date: daysFromNow(5), status: 'scheduled' }),
    ];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT);
    expect(info.status).not.toBe('needs_attention');
  });

  it('a student with a recent cancellation and no replacement is still "needs_attention"', () => {
    const lessons = [lesson({ id: 'l1', date: daysAgo(3), status: 'cancelled' })];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT);
    expect(info.status).toBe('needs_attention');
  });

  it('a student with no active enrollment (prior one completed, no new one started) resolves to inactive, not a crash', () => {
    const info = computeStudentStatus(BASE_STUDENT, [], NOW, null);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('No Active Enrollment');
  });

  it('a student whose active enrollment is completed resolves to "completed", surfacing the completion reason', () => {
    const completedEnrollment = { ...BASE_ENROLLMENT, completed: true, completionReason: 'Passed road test' };
    const info = computeStudentStatus(BASE_STUDENT, [], NOW, completedEnrollment);
    expect(info.status).toBe('completed');
    expect(info.reason).toBe('Passed road test');
  });

  // Follow-up regression coverage: withdrawn/inactive/suspended had the
  // identical bug as completed did (see the data-layer fix in
  // enrollmentService.getDisplayDriverTrainingEnrollmentsBatch) - these
  // branches existed in computeStudentStatus already, but activeEnrollment
  // could never actually carry one of these statuses before that fix, so
  // they were unreachable in practice. This suite exercises the display
  // mapping itself, independent of the data layer.
  it('a student whose enrollment is withdrawn resolves to "Dropped", surfacing the withdrawal reason', () => {
    const withdrawnEnrollment = { ...BASE_ENROLLMENT, status: 'withdrawn' as const, withdrawnReason: 'Moved out of state' };
    const info = computeStudentStatus(BASE_STUDENT, [], NOW, withdrawnEnrollment);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('Dropped');
    expect(info.reason).toBe('Moved out of state');
  });

  it('a student whose enrollment is withdrawn with no recorded reason falls back to a generic "Student withdrew" reason', () => {
    const withdrawnEnrollment = { ...BASE_ENROLLMENT, status: 'withdrawn' as const, withdrawnReason: null };
    const info = computeStudentStatus(BASE_STUDENT, [], NOW, withdrawnEnrollment);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('Dropped');
    expect(info.reason).toBe('Student withdrew');
  });

  it('a student whose enrollment is suspended resolves to "Suspended"', () => {
    const suspendedEnrollment = { ...BASE_ENROLLMENT, status: 'suspended' as const };
    const info = computeStudentStatus(BASE_STUDENT, [], NOW, suspendedEnrollment);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('Suspended');
  });

  it('a student whose enrollment is inactive resolves to a neutral "Inactive" - not the withdrawal language', () => {
    const inactiveEnrollment = { ...BASE_ENROLLMENT, status: 'inactive' as const };
    const info = computeStudentStatus(BASE_STUDENT, [], NOW, inactiveEnrollment);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('Inactive');
    expect(info.reason).not.toMatch(/withdrew/i);
  });
});

describe('computeStudentStatus - status column colors/sizing/flags', () => {
  it('appends the non-cancelled upcoming-lesson count to the "Scheduled" label', () => {
    const lessons = [
      lesson({ status: 'scheduled', date: daysFromNow(1) }),
      lesson({ status: 'scheduled', date: daysFromNow(3) }),
      lesson({ status: 'cancelled', date: daysFromNow(2) }),
    ];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT);
    expect(info.status).toBe('scheduled');
    expect(info.displayStatus).toBe('Scheduled (2)');
    expect(info.upcomingLessonCount).toBe(2);
  });

  it('"Ready to Book" never carries actionRequired - it is the calm between-lessons state, not a flag', () => {
    // A completed lesson recent enough to be past the 14-60 day
    // needs_attention gap window, with no upcoming lesson - the plain
    // "ready to book, needs scheduling" state, not an urgent flag.
    const lessons = [lesson({ status: 'completed', date: daysAgo(3) })];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT);
    expect(info.status).toBe('ready_to_book');
    expect(info.displayStatus).toBe('Ready to Book');
    expect(info.actionRequired).toBeUndefined();
  });
});

// Regression: a terminal enrollment state must always win over the
// transient 60+-day-inactivity check - found live against seed student
// Naomi Frasier (completed Aug 3, last lesson Jun 14 - over 60 days
// before "today"), whose completed enrollment was showing "Inactive"
// because the 60-day check ran BEFORE the completed check. Terminal
// states (withdrawn/suspended/inactive/completed) are now all resolved
// first; the 60-day check is only reachable for an enrollment that is
// still active and not completed.
describe('computeStudentStatus - terminal states always win over the 60+-day-inactivity check', () => {
  it('a completed enrollment whose last lesson was 60+ days ago still shows "Completed", not "Inactive"', () => {
    const completedEnrollment = { ...BASE_ENROLLMENT, completed: true, completionReason: 'Finished all lessons' };
    const lessons = [lesson({ status: 'completed', date: daysAgo(70) })];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, completedEnrollment);
    expect(info.status).toBe('completed');
    expect(info.displayStatus).toBe('Completed');
  });

  it('a withdrawn enrollment quiet for 60+ days still shows "Dropped", not "Inactive"', () => {
    const withdrawnEnrollment = { ...BASE_ENROLLMENT, status: 'withdrawn' as const, withdrawnReason: 'Moved out of state' };
    const lessons = [lesson({ status: 'completed', date: daysAgo(70) })];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, withdrawnEnrollment);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('Dropped');
  });

  it('a suspended enrollment quiet for 60+ days still shows "Suspended", not the generic "Inactive"', () => {
    const suspendedEnrollment = { ...BASE_ENROLLMENT, status: 'suspended' as const };
    const lessons = [lesson({ status: 'completed', date: daysAgo(70) })];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, suspendedEnrollment);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('Suspended');
  });

  it('an ACTIVE, not-completed enrollment quiet for 60+ days still correctly raises "Inactive" - the check is scoped, not removed', () => {
    const lessons = [lesson({ status: 'completed', date: daysAgo(70) })];
    const info = computeStudentStatus(BASE_STUDENT, lessons, NOW, BASE_ENROLLMENT);
    expect(info.status).toBe('inactive');
    expect(info.displayStatus).toBe('Inactive');
    expect(info.reason).toMatch(/no activity for 70 days/i);
  });
});
