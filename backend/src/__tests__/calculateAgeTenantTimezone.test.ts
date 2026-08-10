import { describe, it, expect, afterEach, vi } from 'vitest';
import { calculateAge } from '../services/studentProgressService';

// Regression coverage: calculateAge used to compute "today" via `new
// Date()`, which reads the PROCESS's local time - correct only when the
// server happens to share the tenant's timezone. A student's 18th birthday
// must land on the TENANT's calendar day, not the server's, since it gates
// the adult-email requirement and the hours/lessons progress track.
describe('calculateAge - tenant-timezone-aware, not server-local', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has not yet turned 18 in a Pacific tenant at an instant where UTC has already rolled to the birthday', () => {
    // Birthday 2008-08-10. At 2026-08-10T02:00:00Z it's already the 10th in
    // UTC, but only 19:00 on the 9th in America/Los_Angeles (PDT, UTC-7).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z'));

    expect(calculateAge('2008-08-10', 'UTC')).toBe(18);
    expect(calculateAge('2008-08-10', 'America/Los_Angeles')).toBe(17);
  });

  it('has not yet turned 18 in an Eastern tenant at the same UTC-rolled-over instant', () => {
    // 2026-08-10T02:30:00Z is 2026-08-09T22:30:00-04:00 in America/New_York (EDT).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T02:30:00.000Z'));

    expect(calculateAge('2008-08-10', 'UTC')).toBe(18);
    expect(calculateAge('2008-08-10', 'America/New_York')).toBe(17);
  });

  it('resolves correctly for a no-DST tenant (America/Phoenix)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));

    expect(calculateAge('2000-01-01', 'America/Phoenix')).toBe(26);
  });

  it('falls back to the documented default timezone (America/Los_Angeles) when none is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z'));

    expect(calculateAge('2008-08-10')).toBe(calculateAge('2008-08-10', 'America/Los_Angeles'));
  });

  it('returns null for a null date of birth', () => {
    expect(calculateAge(null, 'America/New_York')).toBeNull();
  });
});
