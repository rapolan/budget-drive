import { describe, it, expect } from 'vitest';
import { isReadyToMarkComplete } from './studentActionEligibility';
import type { Student, Lesson, ActiveEnrollmentSummary } from '@/types';

function activeEnrollment(overrides: Partial<ActiveEnrollmentSummary> = {}): ActiveEnrollmentSummary {
  return {
    id: 'enrollment-1',
    status: 'active',
    completed: false,
    programType: 'driver_training',
    ...overrides,
  } as ActiveEnrollmentSummary;
}

function adultStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Jordan Vance',
    email: 'jordan@example.com',
    activeEnrollment: activeEnrollment(),
    progress: {
      track: 'lessons',
      lessonsCompleted: 2,
      lessonsBooked: 3,
      lessonsPercent: 67,
      displayLabel: '2 of 3 lessons (67%)',
      percentComplete: 67,
      needsDateOfBirth: false,
    },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Student;
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    tenantId: 'tenant-1',
    studentId: 'student-1',
    instructorId: 'instructor-1',
    vehicleId: null,
    date: new Date('2026-08-20'),
    startTime: '10:00',
    endTime: '12:00',
    duration: 120,
    lessonType: 'behind_wheel',
    status: 'completed',
    cost: 150,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Lesson;
}

describe('isReadyToMarkComplete (item 10 regression: must require zero remaining scheduled lessons)', () => {
  it('an adult with 1 completed + 1 scheduled lesson is NOT ready to complete (Jordan Vance scenario)', () => {
    const student = adultStudent();
    const lessons = [
      lesson({ id: 'l1', status: 'completed' }),
      lesson({ id: 'l2', status: 'scheduled' }),
    ];

    expect(isReadyToMarkComplete(student, lessons)).toBe(false);
  });

  it('the SAME adult, once both lessons are completed (no scheduled remaining), IS ready to complete', () => {
    const student = adultStudent();
    const lessons = [
      lesson({ id: 'l1', status: 'completed' }),
      lesson({ id: 'l2', status: 'completed' }),
    ];

    expect(isReadyToMarkComplete(student, lessons)).toBe(true);
  });

  it('an hours-track (minor) student at 100% with a still-scheduled lesson is NOT ready to complete', () => {
    const student = adultStudent({
      progress: {
        track: 'hours',
        hoursCompleted: 6,
        hoursRequired: 6,
        hoursScheduled: 2,
        lessonsCompleted: 3,
        lessonsRequired: 3,
        displayLabel: '6 / 6 hrs',
        percentComplete: 100,
        needsDateOfBirth: false,
      },
    });
    const lessons = [
      lesson({ id: 'l1', status: 'completed' }),
      lesson({ id: 'l2', status: 'completed' }),
      lesson({ id: 'l3', status: 'completed' }),
      lesson({ id: 'l4', status: 'scheduled' }),
    ];

    expect(isReadyToMarkComplete(student, lessons)).toBe(false);
  });

  it('an hours-track (minor) student at 100% with no scheduled lessons remaining IS ready to complete', () => {
    const student = adultStudent({
      progress: {
        track: 'hours',
        hoursCompleted: 6,
        hoursRequired: 6,
        hoursScheduled: 0,
        lessonsCompleted: 3,
        lessonsRequired: 3,
        displayLabel: '6 / 6 hrs',
        percentComplete: 100,
        needsDateOfBirth: false,
      },
    });
    const lessons = [
      lesson({ id: 'l1', status: 'completed' }),
      lesson({ id: 'l2', status: 'completed' }),
      lesson({ id: 'l3', status: 'completed' }),
    ];

    expect(isReadyToMarkComplete(student, lessons)).toBe(true);
  });

  it('ignores another student\'s scheduled lesson when the lessons list is unfiltered (Students.tsx passes the full list)', () => {
    const student = adultStudent({ id: 'student-1' });
    const lessons = [
      lesson({ id: 'l1', studentId: 'student-1', status: 'completed' }),
      lesson({ id: 'l2', studentId: 'student-1', status: 'completed' }),
      lesson({ id: 'l3', studentId: 'some-other-student', status: 'scheduled' }),
    ];

    expect(isReadyToMarkComplete(student, lessons)).toBe(true);
  });

  it('still requires an active, not-yet-completed enrollment (existing behavior preserved)', () => {
    const student = adultStudent({ activeEnrollment: activeEnrollment({ completed: true }) });
    const lessons = [lesson({ status: 'completed' })];

    expect(isReadyToMarkComplete(student, lessons)).toBe(false);
  });
});
