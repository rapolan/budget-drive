import { describe, it, expect } from 'vitest';
import { getTenantNow } from '../services/tenantService';

describe('getTenantNow under a forced UTC process clock', () => {
  it('reproduces the tenantToday hostile-clock case exactly', () => {
    // Matches tenantTimeHostileClock.test.ts's own reference instant -
    // 2026-03-01T02:30:00Z is still Feb 28 in America/New_York.
    const lateNightEastern = new Date('2026-03-01T02:30:00Z');
    const result = getTenantNow('America/New_York', lateNightEastern);

    expect(result.today).toBe('2026-02-28');
    expect(result.tomorrow).toBe('2026-03-01');
    expect(result.timezone).toBe('America/New_York');
  });

  it('currentTime is the tenant wall-clock HH:mm, not the UTC instant', () => {
    // 2026-03-01T02:30:00Z = 2026-02-28 21:30 in America/New_York (EST, UTC-5).
    const result = getTenantNow('America/New_York', new Date('2026-03-01T02:30:00Z'));
    expect(result.currentTime).toBe('21:30');
  });

  it('weekStart is unchanged when today is already a Sunday', () => {
    // 2026-03-01 is a Sunday.
    const result = getTenantNow('UTC', new Date('2026-03-01T12:00:00Z'));
    expect(result.today).toBe('2026-03-01');
    expect(result.weekStart).toBe('2026-03-01');
  });

  it('weekStart rolls back to the preceding Sunday when today is mid-week', () => {
    // 2026-03-04 is a Wednesday; the preceding Sunday is 2026-03-01.
    const result = getTenantNow('UTC', new Date('2026-03-04T12:00:00Z'));
    expect(result.today).toBe('2026-03-04');
    expect(result.weekStart).toBe('2026-03-01');
  });

  it('weekEnd is always weekStart + 6 days', () => {
    const result = getTenantNow('UTC', new Date('2026-03-04T12:00:00Z'));
    expect(result.weekStart).toBe('2026-03-01');
    expect(result.weekEnd).toBe('2026-03-07');
  });

  it('monthBoundaries matches tenantMonthBoundaries called directly', () => {
    const reference = new Date('2026-03-04T12:00:00Z');
    const result = getTenantNow('UTC', reference);
    expect(result.monthBoundaries).toEqual({ start: '2026-03-01', end: '2026-03-31' });
  });

  it('defaults reference to the real current time when omitted', () => {
    const before = Date.now();
    const result = getTenantNow('UTC');
    const after = Date.now();
    // today should be today's real UTC calendar date, bounded by the call window.
    const resultInstant = new Date(`${result.today}T00:00:00Z`).getTime();
    expect(resultInstant).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1000);
    expect(resultInstant).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
  });
});
