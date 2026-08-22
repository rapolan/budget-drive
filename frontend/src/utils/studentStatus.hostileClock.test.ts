import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeStudentStatus, studentNeedsFollowup, getFollowupReason } from './studentStatus';
import type { Student, Lesson, ActiveEnrollmentSummary } from '@/types';

// Hostile-clock regression suite for studentStatus.ts. Unlike the
// component-level suites, this one doesn't mock tenantNow - it calls the
// three exported functions directly with an explicit `now` argument (as
// every real call site now must, per the required-parameter change - see
// docs/ARCHITECTURE.md §7) and proves the result is identical regardless
// of process.env.TZ. This is expected to hold trivially once `now` is
// threaded in as a real Date instance: every internal computation is
// millisecond-delta arithmetic (Date#getTime() differences), which is
// timezone-independent - the only real risk is a stray
// new Date()/toDateString() call reading the AMBIENT clock instead of the
// passed-in `now`, which this guards against.

const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = 'America/New_York';
});

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

// A fixed instant, deliberately near a US timezone's local midnight so a
// stray reliance on ambient local time would be likely to roll the
// calendar day in at least one of the two zones under test.
const NOW = new Date('2026-03-01T04:30:00.000Z'); // 2026-02-28 23:30 EST / 2026-02-27 20:30 PST

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    email: 'test@example.com',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

// status/completed/completionReason/enrollmentDate moved from students to
// enrollments per the person/enrollment refactor.
function enrollment(overrides: Partial<ActiveEnrollmentSummary> = {}): ActiveEnrollmentSummary {
  return {
    id: 'enrollment-1',
    programType: 'driver_training',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    completed: false,
    completionReason: null,
    withdrawnReason: null,
    ...overrides,
  };
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: null,
    date: new Date('2026-02-20'),
    startTime: '10:00:00',
    endTime: '12:00:00',
    duration: 120,
    lessonType: 'behind_wheel',
    status: 'scheduled',
    cost: 150,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Lesson;
}

function runUnderBothZones<T>(fn: () => T): { newYork: T; losAngeles: T } {
  process.env.TZ = 'America/New_York';
  const newYork = fn();
  process.env.TZ = 'America/Los_Angeles';
  const losAngeles = fn();
  return { newYork, losAngeles };
}

describe('studentStatus - hostile clock (explicit now, browser TZ varied)', () => {
  it('computeStudentStatus: a permit-expired student is flagged identically under both browser zones', () => {
    const s = student({ learnerPermitExpiration: new Date('2026-02-01') });
    const e = enrollment();
    const { newYork, losAngeles } = runUnderBothZones(() => computeStudentStatus(s, [], NOW, e));

    expect(newYork.status).toBe('needs_attention');
    expect(newYork).toEqual(losAngeles);
  });

  it('computeStudentStatus: an upcoming-lesson student is marked "scheduled" identically under both browser zones', () => {
    const s = student();
    const e = enrollment();
    const lessons = [lesson({ date: new Date('2026-03-05'), status: 'scheduled' })];
    const { newYork, losAngeles } = runUnderBothZones(() => computeStudentStatus(s, lessons, NOW, e));

    expect(newYork.status).toBe('scheduled');
    expect(newYork).toEqual(losAngeles);
  });

  it('studentNeedsFollowup: a 20-day gap since the last completed lesson is flagged identically under both browser zones', () => {
    const s = student();
    const e = enrollment();
    const lessons = [lesson({ date: new Date('2026-02-08'), status: 'completed' })];
    const { newYork, losAngeles } = runUnderBothZones(() => studentNeedsFollowup(s, lessons, NOW, e));

    expect(newYork).toBe(true);
    expect(newYork).toBe(losAngeles);
  });

  it('getFollowupReason: the reported day count since last lesson is identical under both browser zones', () => {
    const s = student();
    const e = enrollment();
    const lessons = [lesson({ date: new Date('2026-02-08'), status: 'completed' })];
    const { newYork, losAngeles } = runUnderBothZones(() => getFollowupReason(s, lessons, NOW, e));

    expect(newYork).toEqual(losAngeles);
  });
});
