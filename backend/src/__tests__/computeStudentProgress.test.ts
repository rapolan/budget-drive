import { describe, it, expect } from 'vitest';
import { computeStudentProgress } from '../services/studentProgressService';
import { DEFAULT_TENANT_TIMEZONE, tenantToday, parseTenantDateOnly } from '../utils/tenantTime';

function minor(overrides: Partial<Parameters<typeof computeStudentProgress>[0]> = {}) {
  const seventeenYearsAgo = new Date();
  seventeenYearsAgo.setFullYear(seventeenYearsAgo.getFullYear() - 17);
  return {
    dateOfBirth: seventeenYearsAgo,
    hoursRequired: 6,
    completed: false,
    completedAt: null,
    completionReason: null,
    trackOverride: null,
    ...overrides,
  };
}

function adult(overrides: Partial<Parameters<typeof computeStudentProgress>[0]> = {}) {
  const twentyYearsAgo = new Date();
  twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
  return {
    dateOfBirth: twentyYearsAgo,
    hoursRequired: 6,
    completed: false,
    completedAt: null,
    completionReason: null,
    trackOverride: null,
    ...overrides,
  };
}

describe('computeStudentProgress', () => {
  it('minor at 4.5 of 6 hours - HOURS track', () => {
    const progress = computeStudentProgress(minor(), [
      { status: 'completed', duration: 270 }, // 4.5 hrs
    ]);

    expect(progress.track).toBe('hours');
    expect(progress.hoursCompleted).toBe(4.5);
    expect(progress.hoursRequired).toBe(6);
    expect(progress.displayLabel).toBe('4.5 / 6 hrs');
  });

  it('adult at 2 of 3 lessons (one cancelled excluded from denominator) - LESSONS track', () => {
    const progress = computeStudentProgress(adult(), [
      { status: 'completed', duration: 60 },
      { status: 'completed', duration: 60 },
      { status: 'scheduled', duration: 60 },
      { status: 'cancelled', duration: 60 },
    ]);

    expect(progress.track).toBe('lessons');
    expect(progress.lessonsCompleted).toBe(2);
    expect(progress.lessonsBooked).toBe(3);
    expect(progress.lessonsPercent).toBe(67);
    expect(progress.displayLabel).toBe('2 of 3 lessons (67%)');
  });

  it('adult with a no_show lesson: counted in the denominator, not the numerator', () => {
    const progress = computeStudentProgress(adult(), [
      { status: 'completed', duration: 60 },
      { status: 'no_show', duration: 60 },
    ]);

    expect(progress.lessonsCompleted).toBe(1);
    expect(progress.lessonsBooked).toBe(2);
  });

  it('adult with zero booked lessons shows "No lessons booked", never "0%"', () => {
    const progress = computeStudentProgress(adult(), []);

    expect(progress.displayLabel).toBe('No lessons booked');
    expect(progress.displayLabel).not.toMatch(/0%/);
    expect(progress.percentComplete).toBe(0);
  });

  it('a cancelled-only lesson list is also treated as zero booked lessons', () => {
    const progress = computeStudentProgress(adult(), [
      { status: 'cancelled', duration: 60 },
    ]);

    expect(progress.displayLabel).toBe('No lessons booked');
  });

  it('completed program short-circuits regardless of lesson data', () => {
    const progress = computeStudentProgress(
      minor({ completed: true, completedAt: new Date('2026-01-01'), completionReason: 'Finished early' }),
      [{ status: 'no_show', duration: 60 }] // would otherwise indicate a very incomplete minor
    );

    expect(progress.track).toBe('completed');
    expect(progress.displayLabel).toBe('Completed');
    expect(progress.percentComplete).toBe(100);
    expect(progress.completionReason).toBe('Finished early');
  });

  it('null date of birth defaults to HOURS track and flags needsDateOfBirth', () => {
    const progress = computeStudentProgress(minor({ dateOfBirth: null }), []);

    expect(progress.track).toBe('hours');
    expect(progress.needsDateOfBirth).toBe(true);
  });

  it('a known date of birth does not flag needsDateOfBirth', () => {
    const progress = computeStudentProgress(minor(), []);
    expect(progress.needsDateOfBirth).toBe(false);
  });

  it('trackOverride pins the track regardless of age (adult forced to hours)', () => {
    const progress = computeStudentProgress(adult({ trackOverride: 'hours' }), [
      { status: 'completed', duration: 60 },
    ]);
    expect(progress.track).toBe('hours');
  });

  it('trackOverride pins the track regardless of age (minor forced to lessons)', () => {
    const progress = computeStudentProgress(minor({ trackOverride: 'lessons' }), [
      { status: 'completed', duration: 60 },
    ]);
    expect(progress.track).toBe('lessons');
  });

  it('age boundary: birthday is today crosses into adult (18+) on the LESSONS track', () => {
    // computeStudentProgress's default timezone is DEFAULT_TENANT_TIMEZONE
    // (Pacific) - "today" must be derived the same way calculateAge derives
    // it internally, via tenantToday, not process-local new Date(). Under
    // TZ=UTC (item 7's server config) those two can disagree by a day.
    const today = tenantToday(DEFAULT_TENANT_TIMEZONE);
    const eighteenToday = parseTenantDateOnly(today);
    eighteenToday.setUTCFullYear(eighteenToday.getUTCFullYear() - 18);

    const progress = computeStudentProgress(minor({ dateOfBirth: eighteenToday }), []);
    expect(progress.track).toBe('lessons');
  });

  it('age boundary: one day before an 18th birthday stays a minor on the HOURS track', () => {
    const today = tenantToday(DEFAULT_TENANT_TIMEZONE);
    const almostEighteen = parseTenantDateOnly(today);
    almostEighteen.setUTCFullYear(almostEighteen.getUTCFullYear() - 18);
    almostEighteen.setUTCDate(almostEighteen.getUTCDate() + 1);

    const progress = computeStudentProgress(minor({ dateOfBirth: almostEighteen }), []);
    expect(progress.track).toBe('hours');
  });

  // Lesson-equivalent view: both hours and lesson-count representations
  // must come from this one function (Constraint A) - no other file may
  // derive lessonsRequired or recompute percentComplete.
  describe('lesson-equivalent progress', () => {
    it('a minor with 6 required hours and a 120-minute standard length requires 3 lessons', () => {
      const progress = computeStudentProgress(minor({ hoursRequired: 6 }), [], 120);
      expect(progress.track).toBe('hours');
      expect(progress.lessonsRequired).toBe(3);
    });

    it('the same 6 required hours needs 4 lessons at a 90-minute standard length (rounds up)', () => {
      const progress = computeStudentProgress(minor({ hoursRequired: 6 }), [], 90);
      expect(progress.lessonsRequired).toBe(4); // ceil(360/90) = 4
    });

    it('a minor defaults to a 120-minute standard length when none is passed', () => {
      const progress = computeStudentProgress(minor({ hoursRequired: 6 }), []);
      expect(progress.lessonsRequired).toBe(3);
    });

    it("a minor's lessonsCompleted counts completed lessons, independent of duration", () => {
      const progress = computeStudentProgress(minor({ hoursRequired: 6 }), [
        { status: 'completed', duration: 90 },
        { status: 'completed', duration: 90 },
        { status: 'scheduled', duration: 90 },
      ], 120);
      expect(progress.lessonsCompleted).toBe(2);
    });

    it("a minor's percentComplete is lesson-count-based, not hours-based", () => {
      // 1 of 3 required lessons completed -> 33%, even though the completed
      // lesson's duration (90 min = 1.5 hrs) is a different fraction of the
      // 6-hour requirement (25%) - proves percentComplete tracks lessons.
      const progress = computeStudentProgress(minor({ hoursRequired: 6 }), [
        { status: 'completed', duration: 90 },
      ], 120);
      expect(progress.lessonsRequired).toBe(3);
      expect(progress.percentComplete).toBe(33);
    });

    it("an adult's lessonsRequired equals their booked-lesson count, unaffected by standardLessonLengthMinutes", () => {
      const progress = computeStudentProgress(adult(), [
        { status: 'completed', duration: 60 },
        { status: 'scheduled', duration: 60 },
      ], 90);
      expect(progress.track).toBe('lessons');
      expect(progress.lessonsRequired).toBe(2);
      expect(progress.lessonsRequired).toBe(progress.lessonsBooked);
    });

    it('an adult with zero booked lessons has lessonsRequired 0', () => {
      const progress = computeStudentProgress(adult(), []);
      expect(progress.lessonsRequired).toBe(0);
    });
  });
});
