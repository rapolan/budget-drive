import { describe, it, expect } from 'vitest';
import { addCalendarDays, daysBetween } from './timeFormat';

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
