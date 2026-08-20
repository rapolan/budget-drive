import { describe, it, expect } from 'vitest';
import { addCalendarDays, daysBetween, parseLocalDate, formatShortDate } from './timeFormat';

// Regression: lessons.date is a Postgres `date` column. The `pg` driver
// returns it as a JS Date object, and Express's res.json() then serializes
// it via Date.prototype.toJSON() (toISOString()) - the real wire shape is
// a full ISO datetime, e.g. "2026-08-17T00:00:00.000Z", never a bare
// YYYY-MM-DD, even though callers often assume the latter. This exact
// string is what GET /lessons actually returned for a live lesson during
// this bug's investigation - not a hand-written "ideal" fixture.
const REAL_LESSON_DATE_FROM_API = '2026-08-17T00:00:00.000Z';

describe('parseLocalDate', () => {
  it('parses a plain YYYY-MM-DD string (the documented, original contract)', () => {
    const d = parseLocalDate('2026-08-17');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-indexed
    expect(d.getDate()).toBe(17);
  });

  it('parses a full ISO datetime string (the real shape lessons.date arrives as) without producing an Invalid Date', () => {
    const d = parseLocalDate(REAL_LESSON_DATE_FROM_API);
    expect(d.toString()).not.toBe('Invalid Date');
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(17);
  });
});

describe('formatShortDate - regression for LessonHistoryTimeline "Invalid Date"', () => {
  it('formats a real lessons.date API value (full ISO datetime) as a short date, not "Invalid Date"', () => {
    expect(formatShortDate(REAL_LESSON_DATE_FROM_API)).not.toMatch(/invalid/i);
    expect(formatShortDate(REAL_LESSON_DATE_FROM_API)).toBe('Mon, Aug 17');
  });

  it('still formats a plain YYYY-MM-DD string correctly (unchanged behavior)', () => {
    expect(formatShortDate('2026-08-17')).toBe('Mon, Aug 17');
  });
});

describe('addCalendarDays', () => {
  it('adds a single day within the same month', () => {
    expect(addCalendarDays('2026-08-03', 1)).toBe('2026-08-04');
  });

  it('rolls over a month boundary', () => {
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('rolls over a year boundary', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('supports negative offsets', () => {
    expect(addCalendarDays('2026-08-04', -1)).toBe('2026-08-03');
  });

  it('adds more than a single day', () => {
    expect(addCalendarDays('2026-08-04', 13)).toBe('2026-08-17');
  });
});

describe('cross-view calendar-date consistency (Lessons table vs weekly vs monthly)', () => {
  // Regression: Lessons.tsx's table/card formatDate() used to do
  // `new Date(lesson.date).toLocaleDateString()`, a UTC-instant-to-browser-
  // local-zone round trip that rolls the calendar day back one for roughly
  // half of all timezones - while the weekly view (InstructorWeeklySchedule)
  // and monthly view (LessonsCalendarView) both already matched lessons via
  // `String(lesson.date).split('T')[0]`, a plain string extraction. This
  // asserts all three derivation strategies agree on the same calendar date
  // for the same raw API value, so a future regression in any one of them
  // shows up here rather than only as a visual mismatch between views.
  it('derives the same YYYY-MM-DD calendar date from the same lesson.date value via the string-extraction path (weekly/monthly) and the parseLocalDate path (table/card formatDate)', () => {
    const stringExtraction = REAL_LESSON_DATE_FROM_API.split('T')[0];
    const tableFormatterDate = parseLocalDate(REAL_LESSON_DATE_FROM_API);
    const tableFormatterDateStr = `${tableFormatterDate.getFullYear()}-${String(tableFormatterDate.getMonth() + 1).padStart(2, '0')}-${String(tableFormatterDate.getDate()).padStart(2, '0')}`;

    expect(tableFormatterDateStr).toBe(stringExtraction);
    expect(tableFormatterDateStr).toBe('2026-08-17');
  });
});

describe('daysBetween', () => {
  it('returns the number of calendar days between two dates', () => {
    expect(daysBetween('2026-08-04', '2026-08-17')).toBe(13);
  });

  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-08-04', '2026-08-04')).toBe(0);
  });

  it('spans a month boundary correctly', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
  });
});
