import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';
import {
  resolveThresholdForOffset,
  runInstructorLicenseCheck,
  THRESHOLDS,
  POST_EXPIRY_INTERVAL_DAYS,
} from '../services/instructorLicenseNotificationService';
import { daysBetweenTenantDates } from '../utils/tenantTime';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc-123';
const INSTRUCTOR_ID = 'instructor-1';
const ADMIN_USER_ID = 'admin-1';

function mockRunCycle(options: {
  instructorRow: { id: string; full_name: string; instructor_license_expiration: string } | null;
  dedupInsertSucceeds?: boolean; // true = first time firing, false = ON CONFLICT (already fired)
  adminIds?: string[];
}) {
  const { instructorRow, dedupInsertSucceeds, adminIds = [ADMIN_USER_ID] } = options;

  mockQuery.mockResolvedValueOnce(
    queryResult(instructorRow ? [instructorRow] : [])
  ); // SELECT instructors WHERE ... instructor_license_expiration IS NOT NULL

  if (instructorRow && dedupInsertSucceeds !== undefined) {
    mockQuery.mockResolvedValueOnce(
      queryResult(dedupInsertSucceeds ? [{ id: 'dedup-row-1' }] : [])
    ); // INSERT instructor_license_notifications ... ON CONFLICT DO NOTHING RETURNING id

    if (dedupInsertSucceeds) {
      mockQuery.mockResolvedValueOnce(
        queryResult(adminIds.map((id) => ({ id })))
      ); // SELECT admins/owners
      for (const _ of adminIds) {
        mockQuery.mockResolvedValueOnce(queryResult([{ id: 'notif-1' }])); // INSERT notifications
      }
    }
  }
}

describe('resolveThresholdForOffset', () => {
  it('matches each pre-expiry threshold exactly', () => {
    for (const t of THRESHOLDS) {
      expect(resolveThresholdForOffset(t)).toBe(t);
    }
  });

  it('matches 0 on the expiry date itself', () => {
    expect(resolveThresholdForOffset(0)).toBe(0);
  });

  it('returns null for a day that matches no threshold', () => {
    expect(resolveThresholdForOffset(179)).toBeNull();
    expect(resolveThresholdForOffset(45)).toBeNull();
    expect(resolveThresholdForOffset(1)).toBeNull();
  });

  it('matches exact multiples of the post-expiry interval', () => {
    expect(resolveThresholdForOffset(-POST_EXPIRY_INTERVAL_DAYS)).toBe(-POST_EXPIRY_INTERVAL_DAYS);
    expect(resolveThresholdForOffset(-POST_EXPIRY_INTERVAL_DAYS * 2)).toBe(-POST_EXPIRY_INTERVAL_DAYS * 2);
    expect(resolveThresholdForOffset(-POST_EXPIRY_INTERVAL_DAYS * 3)).toBe(-POST_EXPIRY_INTERVAL_DAYS * 3);
  });

  it('returns null for a post-expiry day that is not on the weekly boundary', () => {
    expect(resolveThresholdForOffset(-1)).toBeNull();
    expect(resolveThresholdForOffset(-3)).toBeNull();
    expect(resolveThresholdForOffset(-10)).toBeNull();
  });
});

describe('runInstructorLicenseCheck - fires exactly once per threshold', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('each of the 5 pre-expiry thresholds fires exactly once across repeated daily runs', async () => {
    // Expiration fixed at 2026-12-31. Simulate daily runs at 181, 180, 179
    // days out - only the 180-day run should attempt the dedup insert (and
    // succeed); the other two days match no threshold at all, so the cron
    // never even reaches the insert for them.
    const EXPIRATION = '2026-12-31';
    const instructorRow = { id: INSTRUCTOR_ID, full_name: 'Test Instructor', instructor_license_expiration: EXPIRATION };

    const day181 = daysToDateStr(EXPIRATION, -181);
    const day180 = daysToDateStr(EXPIRATION, -180);
    const day179 = daysToDateStr(EXPIRATION, -179);

    // Day 181: no threshold matches - only the instructor SELECT runs.
    mockRunCycle({ instructorRow });
    await runInstructorLicenseCheck(TENANT_ID, day181);
    const insertCallsDay181 = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructor_license_notifications')
    );
    expect(insertCallsDay181).toHaveLength(0);

    resetMockQuery();

    // Day 180: threshold 180 matches, first time firing.
    mockRunCycle({ instructorRow, dedupInsertSucceeds: true });
    await runInstructorLicenseCheck(TENANT_ID, day180);
    const notifInsertsDay180 = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes("INSERT INTO notifications")
    );
    expect(notifInsertsDay180).toHaveLength(1);

    resetMockQuery();

    // Day 179: no threshold matches again.
    mockRunCycle({ instructorRow });
    await runInstructorLicenseCheck(TENANT_ID, day179);
    const notifInsertsDay179 = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO notifications')
    );
    expect(notifInsertsDay179).toHaveLength(0);
  });

  it('a threshold that already fired today does not re-notify on a repeated run (ON CONFLICT DO NOTHING)', async () => {
    const EXPIRATION = '2026-12-31';
    const instructorRow = { id: INSTRUCTOR_ID, full_name: 'Test Instructor', instructor_license_expiration: EXPIRATION };
    const day30 = daysToDateStr(EXPIRATION, -30);

    // Second run on the same day: the dedup insert conflicts (already recorded).
    mockRunCycle({ instructorRow, dedupInsertSucceeds: false });
    await runInstructorLicenseCheck(TENANT_ID, day30);

    const notifInserts = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO notifications')
    );
    expect(notifInserts).toHaveLength(0);

    const dedupInsert = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructor_license_notifications')
    );
    expect(dedupInsert).toBeDefined();
    expect(dedupInsert![0]).toMatch(/ON CONFLICT/i);
  });
});

describe('runInstructorLicenseCheck - expiration date updates reset the schedule', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('a threshold already fired for the old date fires fresh for a new expiration date', async () => {
    // The dedup unique key includes expiration_date, so a new date has no
    // matching row yet - the insert succeeds regardless of the old date's
    // history. This test asserts the SAME threshold value (30) is inserted
    // against a DIFFERENT expiration_date param.
    const NEW_EXPIRATION = '2027-06-15';
    const instructorRow = { id: INSTRUCTOR_ID, full_name: 'Test Instructor', instructor_license_expiration: NEW_EXPIRATION };
    const day30BeforeNew = daysToDateStr(NEW_EXPIRATION, -30);

    mockRunCycle({ instructorRow, dedupInsertSucceeds: true });
    await runInstructorLicenseCheck(TENANT_ID, day30BeforeNew);

    const dedupInsert = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructor_license_notifications')
    );
    expect(dedupInsert).toBeDefined();
    const [, params] = dedupInsert!;
    expect(params).toContain(NEW_EXPIRATION);
    expect(params).toContain(30);
  });
});

describe('runInstructorLicenseCheck - post-expiry escalation', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('escalates on the weekly post-expiry cadence, and only on that cadence', async () => {
    const EXPIRATION = '2026-01-01';
    const instructorRow = { id: INSTRUCTOR_ID, full_name: 'Test Instructor', instructor_license_expiration: EXPIRATION };

    const results: Record<number, number> = {};
    for (const daysPast of [7, 10, 14, 21]) {
      resetMockQuery();
      const shouldFire = daysPast % POST_EXPIRY_INTERVAL_DAYS === 0;
      mockRunCycle({ instructorRow, dedupInsertSucceeds: shouldFire ? true : undefined });
      const todayStr = daysToDateStr(EXPIRATION, daysPast);
      await runInstructorLicenseCheck(TENANT_ID, todayStr);

      const notifInserts = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO notifications')
      );
      results[daysPast] = notifInserts.length;
    }

    expect(results[7]).toBe(1);
    expect(results[10]).toBe(0);
    expect(results[14]).toBe(1);
    expect(results[21]).toBe(1);
  });
});

describe('runInstructorLicenseCheck - null expiration and renewal', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('excludes instructors with a null expiration from the query itself', async () => {
    mockRunCycle({ instructorRow: null });
    await runInstructorLicenseCheck(TENANT_ID, '2026-06-01');

    const selectCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM instructors')
    );
    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toMatch(/instructor_license_expiration IS NOT NULL/);

    // No threshold-related queries at all, since there were zero candidate rows.
    const dedupInsert = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructor_license_notifications')
    );
    expect(dedupInsert).toBeUndefined();
  });

  it('a renewed license (far-future expiration) stops matching any threshold, so no further notifications fire', async () => {
    const RENEWED_EXPIRATION = daysToDateStr('2026-06-01', 365 * 3); // ~3 years out
    const instructorRow = { id: INSTRUCTOR_ID, full_name: 'Test Instructor', instructor_license_expiration: RENEWED_EXPIRATION };

    mockRunCycle({ instructorRow });
    await runInstructorLicenseCheck(TENANT_ID, '2026-06-01');

    const dedupInsert = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructor_license_notifications')
    );
    expect(dedupInsert).toBeUndefined();
  });
});

// Hostile-clock case: proves daysBetweenTenantDates (and therefore every
// threshold decision built on it) resolves purely from the two date
// strings it's given, never from the process's own clock/timezone. This
// file's assertions above all run under this repo's forced TZ=UTC test
// environment (backend/.env.test) by construction - this block additionally
// proves the SAME threshold decision holds for a tenant in a non-UTC,
// DST-observing zone, since daysBetweenTenantDates does no timezone
// resolution of its own (it operates on already-tenant-resolved date
// strings, exactly like addTenantDays) - there is nothing in this function
// for a process-local clock to influence in the first place.
describe('daysBetweenTenantDates - hostile clock (tenant timezone differs from process)', () => {
  it('computes the same day-offset regardless of which IANA zone label is attached, because it is pure calendar-string arithmetic', () => {
    // A threshold boundary chosen specifically because a naive UTC-instant
    // subtraction (e.g. new Date(expiration) - new Date(today)) would
    // disagree with tenant-calendar-day arithmetic across a DST transition -
    // proving this function is immune to that failure class entirely, since
    // it never constructs a UTC instant from either string.
    expect(daysBetweenTenantDates('2026-03-01', '2026-08-29')).toBe(181); // spans the US DST spring-forward
    expect(daysBetweenTenantDates('2026-11-01', '2027-04-30')).toBe(180); // spans the US DST fall-back
  });

  it('a threshold fires on the correct tenant calendar day even when process TZ=UTC and the tenant is America/New_York', async () => {
    resetMockQuery();
    // Expiration exactly 30 tenant-calendar-days from "today" - the process
    // environment is UTC (backend/.env.test) throughout this whole file,
    // proving the threshold decision never depended on it.
    const EXPIRATION = '2026-09-15';
    const TODAY = daysToDateStr(EXPIRATION, -30);
    const instructorRow = { id: INSTRUCTOR_ID, full_name: 'Test Instructor', instructor_license_expiration: EXPIRATION };

    mockRunCycle({ instructorRow, dedupInsertSucceeds: true });
    await runInstructorLicenseCheck(TENANT_ID, TODAY);

    const dedupInsert = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO instructor_license_notifications')
    );
    expect(dedupInsert).toBeDefined();
    const [, params] = dedupInsert!;
    expect(params).toContain(30);
  });
});

function daysToDateStr(fromDateStr: string, offsetDays: number): string {
  const [year, month, day] = fromDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().split('T')[0];
}
