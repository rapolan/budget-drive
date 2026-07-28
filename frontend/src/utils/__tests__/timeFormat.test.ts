import { describe, it, expect } from 'vitest';
import { format12Hour, parseLocalDate, formatLocalDate, formatShortDate } from '../timeFormat';

describe('formatLocalDate', () => {
  it('formats a local-midnight date without rolling back a day', () => {
    // new Date(year, monthIndex, day) constructs in LOCAL time, not UTC -
    // this is the same construction pattern preselectedDate arrives as
    // (a plain JS Date built from user interaction, e.g. a calendar click).
    const localDate = new Date(2026, 7, 3); // August 3, 2026, local midnight
    expect(formatLocalDate(localDate)).toBe('2026-08-03');
  });

  it('formats a late-evening local time on the correct calendar day', () => {
    // This is exactly the scenario toISOString().split('T')[0] gets wrong:
    // 11:30 PM local, in any timezone west of UTC, is already the next day
    // in UTC - toISOString() would report 2026-08-04, one day ahead of what
    // the user actually sees on their calendar.
    const lateEvening = new Date(2026, 7, 3, 23, 30, 0);
    expect(formatLocalDate(lateEvening)).toBe('2026-08-03');
  });

  it('pads single-digit months and days', () => {
    const earlyDate = new Date(2026, 0, 5); // January 5, 2026
    expect(formatLocalDate(earlyDate)).toBe('2026-01-05');
  });

  it('round-trips with parseLocalDate for a plain date string', () => {
    const dateStr = '2026-08-03';
    expect(formatLocalDate(parseLocalDate(dateStr))).toBe(dateStr);
  });
});

describe('format12Hour', () => {
  it('formats morning, noon, afternoon, and midnight correctly', () => {
    expect(format12Hour('09:15')).toBe('9:15 AM');
    expect(format12Hour('12:00')).toBe('12:00 PM');
    expect(format12Hour('14:30')).toBe('2:30 PM');
    expect(format12Hour('00:00')).toBe('12:00 AM');
  });
});

describe('parseLocalDate', () => {
  it('parses a YYYY-MM-DD string as a local date, not UTC', () => {
    const parsed = parseLocalDate('2026-08-03');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7); // 0-indexed
    expect(parsed.getDate()).toBe(3);
  });
});

describe('formatShortDate', () => {
  it('accepts a Date object', () => {
    const result = formatShortDate(new Date(2026, 7, 3));
    expect(result).toMatch(/Aug 3/);
  });

  it('accepts a YYYY-MM-DD string and does not roll the day back', () => {
    const result = formatShortDate('2026-08-03');
    expect(result).toMatch(/Aug 3/);
  });
});
