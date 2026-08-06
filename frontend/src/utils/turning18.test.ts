import { describe, it, expect } from 'vitest';
import { needsTurning18Alert } from './turning18';
import type { Student, StudentProgress } from '@/types';

function makeStudent(age: number, progress: Partial<StudentProgress>): Student {
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - age);

  return {
    id: 'student-1',
    tenantId: 'tenant-1',
    fullName: 'Test Student',
    email: 'test@example.com',
    status: 'active',
    enrollmentDate: new Date('2026-01-01'),
    totalHoursCompleted: 0,
    dateOfBirth: dob,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    progress: {
      track: 'hours',
      displayLabel: '',
      percentComplete: 0,
      needsDateOfBirth: false,
      ...progress,
    },
  } as Student;
}

// Constraint B: fires only when completed + scheduled hours < required.
// A student who has already booked enough lessons to finish must NOT alert.
describe('needsTurning18Alert', () => {
  it('fires for an 18-year-old on the hours track who is under-booked', () => {
    const student = makeStudent(18, {
      hoursCompleted: 2,
      hoursScheduled: 1,
      hoursRequired: 6, // 2 + 1 = 3 < 6
    });
    expect(needsTurning18Alert(student)).toBe(true);
  });

  it('does NOT fire when completed + scheduled hours already meet the requirement', () => {
    const student = makeStudent(18, {
      hoursCompleted: 2,
      hoursScheduled: 4,
      hoursRequired: 6, // 2 + 4 = 6, not < 6
    });
    expect(needsTurning18Alert(student)).toBe(false);
  });

  it('does NOT fire when scheduled hours alone push them over the requirement', () => {
    const student = makeStudent(19, {
      hoursCompleted: 0,
      hoursScheduled: 8,
      hoursRequired: 6,
    });
    expect(needsTurning18Alert(student)).toBe(false);
  });

  it('does NOT fire for a minor (under 18)', () => {
    const student = makeStudent(16, {
      hoursCompleted: 0,
      hoursScheduled: 0,
      hoursRequired: 6,
    });
    expect(needsTurning18Alert(student)).toBe(false);
  });

  it('does NOT fire for a student on the lessons track', () => {
    const student = makeStudent(20, {
      track: 'lessons',
      lessonsCompleted: 0,
      lessonsBooked: 0,
    });
    expect(needsTurning18Alert(student)).toBe(false);
  });

  it('does NOT fire for a completed program', () => {
    const student = makeStudent(18, {
      track: 'completed',
      hoursCompleted: 0,
      hoursScheduled: 0,
      hoursRequired: 6,
    });
    expect(needsTurning18Alert(student)).toBe(false);
  });

  it('does NOT fire when date of birth is missing', () => {
    const student = makeStudent(18, {
      hoursCompleted: 0,
      hoursScheduled: 0,
      hoursRequired: 6,
      needsDateOfBirth: true,
    });
    student.dateOfBirth = undefined;
    expect(needsTurning18Alert(student)).toBe(false);
  });
});
