import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';
import {
  tenantToday,
  tenantTomorrow,
  tenantMonthBoundaries,
  tenantNextMonthBoundaries,
  addTenantDays,
} from '../utils/tenantTime';
import { calculateAge } from '../services/studentProgressService';

vi.mock('../config/database', () => ({ query: mockQuery }));

// Item 9: the whole backend test suite runs under a forced UTC process
// clock (TZ=UTC in backend/.env - item 7), so every test in this file
// already runs under a hostile (non-tenant) process timezone by
// construction. This describes and asserts that fact rather than mutating
// process.env.TZ at runtime, which corrupts date-fns-tz/V8's cached
// timezone tables mid-process (confirmed via a standalone repro: an
// otherwise-identical findAvailableSlots call returns zero slots only
// after a runtime `process.env.TZ = 'UTC'` re-assignment, even when TZ was
// already UTC beforehand) - tests then exercise tenantToday/tenantTomorrow/
// month boundaries/slot dates/age against America/New_York (DST-observing)
// and America/Phoenix (no DST) tenants, proving each resolves against the
// TENANT's calendar day, not the process's, including at instants where
// UTC and the tenant's date differ.
beforeAll(() => {
  expect(new Date('2026-01-01T00:00:00Z').getTimezoneOffset()).toBe(0);
});

describe('tenantTime primitives under a forced UTC process clock', () => {
  it('tenantToday/tenantTomorrow resolve against America/New_York, not UTC, at a UTC-ahead instant', () => {
    // 9:30pm Feb 28 in New York (EST, UTC-5 in winter) is already March 1 in UTC.
    const lateNightEastern = new Date('2026-03-01T02:30:00Z');

    expect(tenantToday('America/New_York', lateNightEastern)).toBe('2026-02-28');
    expect(tenantTomorrow('America/New_York', lateNightEastern)).toBe('2026-03-01');

    // Confirms this genuinely differs from what a UTC reading would give -
    // otherwise the test wouldn't be proving anything about tenant-awareness.
    expect(tenantToday('UTC', lateNightEastern)).toBe('2026-03-01');
  });

  it('tenantToday/tenantTomorrow resolve against America/Phoenix (no DST) at a UTC-ahead instant', () => {
    // 10:30pm Jun 30 Phoenix (fixed UTC-7, no DST even in summer) is 5:30am
    // Jul 1 in UTC.
    const summerLateNight = new Date('2026-07-01T05:30:00Z');

    expect(tenantToday('America/Phoenix', summerLateNight)).toBe('2026-06-30');
    expect(tenantTomorrow('America/Phoenix', summerLateNight)).toBe('2026-07-01');
    expect(tenantToday('UTC', summerLateNight)).toBe('2026-07-01');
  });

  it('tenantMonthBoundaries lands on the correct month for America/New_York when UTC has already rolled to the next month', () => {
    // 9pm Feb 28 Eastern is already March 1 00:30 UTC.
    const lateFeb = new Date('2026-03-01T02:30:00Z');
    expect(tenantMonthBoundaries('America/New_York', lateFeb)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    // The UTC reading would (wrongly) give March.
    expect(tenantMonthBoundaries('UTC', lateFeb)).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
  });

  it('tenantMonthBoundaries lands on the correct month for America/Phoenix', () => {
    // 5:30pm Dec 31 Phoenix (UTC-7) is Jan 1 00:30 UTC.
    const newYearEve = new Date('2026-01-01T00:30:00Z');
    expect(tenantMonthBoundaries('America/Phoenix', newYearEve)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });
});

// tenantNextMonthBoundaries is composed from tenantMonthBoundaries/
// addTenantDays/zonedWallClockToUtc only (never a hand-rolled month-add) -
// these tests specifically exercise the two cases that composition must get
// right: a 31-day month rolling into a 30-day month (the direction that
// would silently overflow if next month's boundaries were derived by naive
// arithmetic instead of asking date-fns for the real answer), and a
// December-to-January year rollover.
describe('tenantNextMonthBoundaries under a forced UTC process clock', () => {
  it('rolls a 31-day month (May) into the correct 30-day next month (June) for America/New_York', () => {
    // Noon Eastern on May 15 is safely mid-day UTC too - no rollover ambiguity
    // in the reference instant itself; the case under test is the BOUNDARY
    // composition, not another UTC-vs-tenant date disagreement.
    const midMay = new Date('2026-05-15T16:00:00Z'); // noon EDT (UTC-4)
    expect(tenantNextMonthBoundaries('America/New_York', midMay)).toEqual({
      start: '2026-06-01',
      end: '2026-06-30', // NOT '2026-06-31' - June has 30 days
    });
  });

  it('rolls a 31-day month (May) into the correct 30-day next month (June) for America/Phoenix (no DST)', () => {
    const midMay = new Date('2026-05-15T19:00:00Z'); // noon Phoenix (fixed UTC-7)
    expect(tenantNextMonthBoundaries('America/Phoenix', midMay)).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
    });
  });

  it('rolls December into January of the following year for America/New_York', () => {
    const midDec = new Date('2026-12-15T17:00:00Z'); // noon EST (UTC-5)
    expect(tenantNextMonthBoundaries('America/New_York', midDec)).toEqual({
      start: '2027-01-01',
      end: '2027-01-31',
    });
  });

  it('rolls December into January of the following year for America/Phoenix', () => {
    const midDec = new Date('2026-12-15T19:00:00Z'); // noon Phoenix
    expect(tenantNextMonthBoundaries('America/Phoenix', midDec)).toEqual({
      start: '2027-01-01',
      end: '2027-01-31',
    });
  });

  it('resolves the correct next month even when UTC and tenant date disagree at the reference instant', () => {
    // 9:30pm Feb 28 Eastern is already March 1 in UTC - tenant "this month"
    // must still read February, so "next month" must still be March.
    const lateFeb = new Date('2026-03-01T02:30:00Z');
    expect(tenantNextMonthBoundaries('America/New_York', lateFeb)).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
  });
});

describe('calculateAge under a forced UTC process clock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves the age transition on the America/New_York calendar day, not UTC\'s', () => {
    vi.useFakeTimers();
    // 2026-08-10T02:30:00Z is 2026-08-09T22:30:00-04:00 in New York (EDT) -
    // UTC's calendar date has already reached the birthday; New York's has not.
    vi.setSystemTime(new Date('2026-08-10T02:30:00.000Z'));

    expect(calculateAge('2008-08-10', 'UTC')).toBe(18);
    expect(calculateAge('2008-08-10', 'America/New_York')).toBe(17);
  });

  it('resolves the age transition on the America/Phoenix calendar day (no DST)', () => {
    vi.useFakeTimers();
    // 2026-08-10T06:30:00Z is 2026-08-09T23:30:00-07:00 in Phoenix.
    vi.setSystemTime(new Date('2026-08-10T06:30:00.000Z'));

    expect(calculateAge('2008-08-10', 'UTC')).toBe(18);
    expect(calculateAge('2008-08-10', 'America/Phoenix')).toBe(17);
  });
});

const TENANT_ID = 'tenant-hostile-clock';
const INSTRUCTOR_ID = 'instructor-1';

const SCHEDULING_SETTINGS_ROW = {
  id: 'settings-1',
  tenant_id: TENANT_ID,
  buffer_time_between_lessons: 30,
  buffer_time_before_first_lesson: 0,
  buffer_time_after_last_lesson: 0,
  min_hours_advance_booking: 0,
  max_days_advance_booking: 90,
  default_lesson_duration: 120,
  default_max_students_per_day: 3,
  lesson_duration_templates: null,
  allow_back_to_back_lessons: false,
  default_work_start_time: '09:00:00',
  default_work_end_time: '17:00:00',
  created_at: new Date(),
  updated_at: new Date(),
};

function mockSlotsSequence(tenantSettingsRow: Record<string, unknown>, availability: unknown[]) {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce(queryResult([tenantSettingsRow])) // getTenantSettings (timezone)
    .mockResolvedValueOnce(queryResult([SCHEDULING_SETTINGS_ROW])) // getSchedulingSettings
    .mockResolvedValueOnce(queryResult(availability)) // instructor_availability
    .mockResolvedValueOnce(queryResult([])) // time off
    .mockResolvedValueOnce(queryResult([])); // lessons
}

// Slot dates must land on the TENANT's calendar day (via tenantDayOfWeek/
// addTenantDays inside findAvailableSlots), not UTC's - checked here for
// both a DST-observing and a no-DST US tenant while the process itself
// runs UTC.
describe('findAvailableSlots slot dates under a forced UTC process clock', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('produces slot dates matching the America/New_York calendar day', async () => {
    const { findAvailableSlots } = await import('../services/schedulingService');

    mockSlotsSequence(
      { id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/New_York' },
      [{ instructor_id: INSTRUCTOR_ID, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 }]
    );

    const slots = await findAvailableSlots({
      tenantId: TENANT_ID,
      instructorId: INSTRUCTOR_ID,
      startDate: new Date('2026-08-03T12:00:00Z'),
      endDate: new Date('2026-08-03T12:00:00Z'),
      duration: 120,
    });

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.date).toBe('2026-08-03');
    }
  });

  it('produces slot dates matching the America/Phoenix calendar day (no DST)', async () => {
    const { findAvailableSlots } = await import('../services/schedulingService');

    mockSlotsSequence(
      { id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/Phoenix' },
      [{ instructor_id: INSTRUCTOR_ID, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 }]
    );

    const slots = await findAvailableSlots({
      tenantId: TENANT_ID,
      instructorId: INSTRUCTOR_ID,
      startDate: new Date('2026-08-03T12:00:00Z'),
      endDate: new Date('2026-08-03T12:00:00Z'),
      duration: 120,
    });

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.date).toBe('2026-08-03');
    }
  });
});

// bookingPresetsService.getDatePresets end-to-end, under the forced-UTC
// process clock, for an America/New_York tenant - asserts against values
// computed via the same tenantTime.ts helpers the service itself calls
// (not hardcoded date literals), so this test doesn't rot as "today" changes.
describe('getDatePresets under a forced UTC process clock', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('resolves all three preset boundaries for an America/New_York tenant', async () => {
    const { getDatePresets } = await import('../services/bookingPresetsService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'ts-1', tenant_id: TENANT_ID, timezone: 'America/New_York' }])
    ); // getTenantSettings (the only query getDatePresets issues)

    const presets = await getDatePresets(TENANT_ID);

    const expectedNext2WeeksStart = tenantTomorrow('America/New_York');
    const expectedNext2WeeksEnd = addTenantDays(expectedNext2WeeksStart, 13, 'America/New_York');
    // "This Month" is a bookable range starting from today, not the 1st of
    // the calendar month - see bookingPresetsService.ts.
    const expectedThisMonth = {
      start: tenantToday('America/New_York'),
      end: tenantMonthBoundaries('America/New_York').end,
    };
    const expectedNextMonth = tenantNextMonthBoundaries('America/New_York');

    expect(presets.next2Weeks).toEqual({ start: expectedNext2WeeksStart, end: expectedNext2WeeksEnd });
    expect(presets.thisMonth).toEqual(expectedThisMonth);
    expect(presets.nextMonth).toEqual(expectedNextMonth);
  });
});
