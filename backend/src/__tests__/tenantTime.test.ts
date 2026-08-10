import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TENANT_TIMEZONE,
  resolveTenantTimezone,
  tenantToday,
  tenantTomorrow,
  addTenantDays,
  formatInTenantZone,
  zonedWallClockToUtc,
  tenantMonthBoundaries,
  tenantDayOfWeek,
  parseTenantDateOnly,
} from '../utils/tenantTime';

describe('resolveTenantTimezone', () => {
  it('falls back to the documented default when unset', () => {
    expect(resolveTenantTimezone(null)).toBe(DEFAULT_TENANT_TIMEZONE);
    expect(resolveTenantTimezone(undefined)).toBe(DEFAULT_TENANT_TIMEZONE);
    expect(resolveTenantTimezone('')).toBe(DEFAULT_TENANT_TIMEZONE);
    expect(resolveTenantTimezone('   ')).toBe(DEFAULT_TENANT_TIMEZONE);
  });

  it('returns the configured timezone when set', () => {
    expect(resolveTenantTimezone('America/Chicago')).toBe('America/Chicago');
  });
});

describe('tenantToday / tenantTomorrow - tenant date differs from UTC date', () => {
  // 9:30pm on Feb 28 in New York (UTC-5 in winter) is already March 1 in UTC.
  const lateNightEastern = new Date('2026-03-01T02:30:00Z');

  it('resolves "today" against the TENANT timezone, not UTC', () => {
    expect(tenantToday('America/New_York', lateNightEastern)).toBe('2026-02-28');
    expect(tenantToday('UTC', lateNightEastern)).toBe('2026-03-01');
  });

  it('resolves "tomorrow" against the tenant timezone', () => {
    expect(tenantTomorrow('America/New_York', lateNightEastern)).toBe('2026-03-01');
    expect(tenantTomorrow('UTC', lateNightEastern)).toBe('2026-03-02');
  });

  // 4am UTC is already "today" evening in a far-west zone but still
  // yesterday morning nowhere further west exists domestically - use the
  // inverse case instead: early UTC morning is still "yesterday" evening
  // for US zones (UTC is always ahead of every US timezone).
  it('resolves correctly for America/Los_Angeles (default) at a UTC-vs-tenant boundary', () => {
    // 11:30pm UTC Feb 28 is still 3:30pm Feb 28 in Pacific (UTC-8 winter).
    const earlyUtc = new Date('2026-02-28T23:30:00Z');
    expect(tenantToday('America/Los_Angeles', earlyUtc)).toBe('2026-02-28');
    expect(tenantToday('UTC', earlyUtc)).toBe('2026-02-28');

    // 1:30am UTC March 1 is still 5:30pm Feb 28 in Pacific.
    const nextUtcDay = new Date('2026-03-01T01:30:00Z');
    expect(tenantToday('America/Los_Angeles', nextUtcDay)).toBe('2026-02-28');
    expect(tenantToday('UTC', nextUtcDay)).toBe('2026-03-01');
  });

  it('resolves correctly for America/Phoenix (no DST, fixed UTC-7 year-round)', () => {
    // Summer: Phoenix stays UTC-7 while most of the US is on DST (UTC-7 too
    // for Mountain, but Phoenix never shifts even when Mountain does).
    const summerLateNight = new Date('2026-07-01T05:30:00Z'); // 10:30pm Jun 30 Phoenix
    expect(tenantToday('America/Phoenix', summerLateNight)).toBe('2026-06-30');
    expect(tenantToday('UTC', summerLateNight)).toBe('2026-07-01');

    const winterLateNight = new Date('2026-01-01T06:30:00Z'); // 11:30pm Dec 31 Phoenix
    expect(tenantToday('America/Phoenix', winterLateNight)).toBe('2025-12-31');
  });
});

describe('addTenantDays', () => {
  it('adds days within the tenant timezone, crossing a month boundary', () => {
    expect(addTenantDays('2026-02-28', 1, 'America/New_York')).toBe('2026-03-01');
  });

  it('supports negative days', () => {
    expect(addTenantDays('2026-03-01', -1, 'America/New_York')).toBe('2026-02-28');
  });

  it('is DST-transition-safe (adding a day across a spring-forward date)', () => {
    // 2026-03-08 is the US spring-forward date (2nd Sunday of March).
    expect(addTenantDays('2026-03-07', 1, 'America/New_York')).toBe('2026-03-08');
    expect(addTenantDays('2026-03-08', 1, 'America/New_York')).toBe('2026-03-09');
  });
});

describe('zonedWallClockToUtc', () => {
  it('converts tenant wall-clock time to the correct UTC instant (DST-observing zone)', () => {
    // EDT (daylight) is UTC-4.
    expect(zonedWallClockToUtc('2026-03-15', '14:00', 'America/New_York').toISOString())
      .toBe('2026-03-15T18:00:00.000Z');
    // EST (standard) is UTC-5.
    expect(zonedWallClockToUtc('2026-01-15', '14:00', 'America/New_York').toISOString())
      .toBe('2026-01-15T19:00:00.000Z');
  });

  it('converts correctly for a zone with no DST (America/Phoenix, fixed UTC-7)', () => {
    expect(zonedWallClockToUtc('2026-03-15', '14:00', 'America/Phoenix').toISOString())
      .toBe('2026-03-15T21:00:00.000Z');
    expect(zonedWallClockToUtc('2026-07-15', '14:00', 'America/Phoenix').toISOString())
      .toBe('2026-07-15T21:00:00.000Z');
  });

  it('accepts HH:MM:SS as well as HH:MM', () => {
    const withSeconds = zonedWallClockToUtc('2026-03-15', '14:00:30', 'America/New_York');
    const withoutSeconds = zonedWallClockToUtc('2026-03-15', '14:00', 'America/New_York');
    expect(withSeconds.getTime() - withoutSeconds.getTime()).toBe(30 * 1000);
  });

  it('a 2pm lesson stays 2pm across a DST shift (Constraint A rationale)', () => {
    // Before spring-forward (2026-03-08): EST, UTC-5.
    const before = zonedWallClockToUtc('2026-03-01', '14:00', 'America/New_York');
    // After spring-forward: EDT, UTC-4.
    const after = zonedWallClockToUtc('2026-03-15', '14:00', 'America/New_York');
    // The UTC instants differ by an hour (proving the offset shifted)...
    expect(after.getUTCHours() - before.getUTCHours()).toBe(-1);
    // ...but formatting each back in tenant time still reads 14:00 both times.
    expect(formatInTenantZone(before, 'America/New_York', 'HH:mm')).toBe('14:00');
    expect(formatInTenantZone(after, 'America/New_York', 'HH:mm')).toBe('14:00');
  });
});

describe('formatInTenantZone', () => {
  it('formats a UTC instant using the tenant timezone, not process-local time', () => {
    const instant = new Date('2026-03-15T18:00:00Z');
    expect(formatInTenantZone(instant, 'America/New_York', 'yyyy-MM-dd HH:mm')).toBe('2026-03-15 14:00');
    expect(formatInTenantZone(instant, 'America/Los_Angeles', 'yyyy-MM-dd HH:mm')).toBe('2026-03-15 11:00');
  });

  it('supports human-readable formats (lesson invite date text)', () => {
    const instant = new Date('2026-03-15T18:00:00Z'); // Sunday
    expect(formatInTenantZone(instant, 'America/New_York', 'EEEE, MMMM d, yyyy')).toBe('Sunday, March 15, 2026');
  });

  it('never rolls the date back a day the way toISOString().split would for a late-evening instant', () => {
    // 9pm Pacific on March 14 (PDT, UTC-7 - after the March 8 spring-forward)
    // is 4am UTC on March 15. toISOString().split('T')[0] would read this
    // as "2026-03-15" (the UTC date); the tenant's actual calendar date is
    // still March 14.
    const instant = new Date('2026-03-15T04:00:00Z');
    expect(instant.toISOString().split('T')[0]).toBe('2026-03-15'); // the bug this replaces
    expect(formatInTenantZone(instant, 'America/Los_Angeles', 'yyyy-MM-dd')).toBe('2026-03-14');
  });
});

describe('tenantMonthBoundaries', () => {
  it('returns start/end of the reference month in the tenant timezone', () => {
    const midFeb = new Date('2026-02-15T12:00:00Z');
    expect(tenantMonthBoundaries('America/New_York', midFeb)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });

  it('handles a leap-year February correctly', () => {
    const midFeb2028 = new Date('2028-02-15T12:00:00Z');
    expect(tenantMonthBoundaries('America/New_York', midFeb2028)).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
  });

  it('resolves the correct month even when UTC and tenant date fall in different months', () => {
    // 9pm Feb 28 Eastern is already March 1 00:30 UTC - the reference
    // instant's UTC month is March, but tenant month must still be February.
    const lateFeb = new Date('2026-03-01T02:30:00Z');
    expect(tenantMonthBoundaries('America/New_York', lateFeb)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });
});

describe('tenantDayOfWeek', () => {
  it('returns the correct day of week (0=Sunday..6=Saturday) in the tenant timezone', () => {
    expect(tenantDayOfWeek('2026-03-15', 'America/New_York')).toBe(0); // Sunday
    expect(tenantDayOfWeek('2026-03-16', 'America/New_York')).toBe(1); // Monday
    expect(tenantDayOfWeek('2026-03-21', 'America/New_York')).toBe(6); // Saturday
  });

  it('is consistent across zones for the same date string (no cross-midnight surprises)', () => {
    expect(tenantDayOfWeek('2026-03-15', 'America/Phoenix')).toBe(0);
    expect(tenantDayOfWeek('2026-03-15', 'UTC')).toBe(0);
  });
});

describe('parseTenantDateOnly', () => {
  it('parses a YYYY-MM-DD string into a Date holding that calendar date', () => {
    const parsed = parseTenantDateOnly('2026-03-15');
    expect(parsed.getUTCFullYear()).toBe(2026);
    expect(parsed.getUTCMonth()).toBe(2); // 0-indexed: March
    expect(parsed.getUTCDate()).toBe(15);
  });
});
