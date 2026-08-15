import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';
import { tenantTomorrow, tenantDayOfWeek, addTenantDays } from '../utils/tenantTime';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const TEST_TIMEZONE = 'America/Los_Angeles';

const SETTINGS_ROW = {
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

// findRankedAvailableSlots resolves the tenant's timezone (getTenantSettings,
// a query against tenant_settings) before deriving "tomorrow" - pinned to
// Pacific so this file's fixtures (which used to hand-compute server-local
// "tomorrow" to mirror the service's OWN server-local computation) can
// instead compute it via the same tenantTime helper the service now uses,
// with both sides agreeing on the same zone. Hostile-clock coverage proving
// this is correct under OTHER timezones lives in
// tenantTimeHostileClock.test.ts.
const TENANT_SETTINGS_ROW = {
  id: 'tenant-settings-1',
  tenant_id: TENANT_ID,
  timezone: TEST_TIMEZONE,
};

describe('findRankedAvailableSlots - single-instructor scope', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('only searches the requested instructor when instructorId is provided', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const dayOfWeek = tenantDayOfWeek(tenantTomorrow(TEST_TIMEZONE), TEST_TIMEZONE);

    // 1. getTenantSettings (timezone)
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW]));
    // 2. Instructor lookup (scoped to the one instructor)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Priya Patel', zip_code: '90210' }])
    );
    // 3. Lessons for candidate instructors in the search window (for "coming from" lookup)
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 4. findAvailableSlots(instructor-1): settings (timezone already resolved
    //    above and passed straight through - no second tenant_settings query)
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    // 5. availability (all days at once)
    mockQuery.mockResolvedValueOnce(
      queryResult([
        { instructor_id: 'instructor-1', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 },
      ])
    );
    // 6. time off
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 7. lessons
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 8. student's own lessons
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: 120,
      startDate: tenantTomorrow(TEST_TIMEZONE),
      endDate: tenantTomorrow(TEST_TIMEZONE),
      instructorId: 'instructor-1',
    });

    // Only the instructor lookup query should have filtered by a specific id -
    // confirm no "all active instructors" query ran (that query has no id param)
    const instructorLookupCalls = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM instructors')
    );
    expect(instructorLookupCalls).toHaveLength(1);
    expect(instructorLookupCalls[0][1]).toEqual(['instructor-1', TENANT_ID]);

    expect(result.slots.every((s) => s.instructorId === 'instructor-1')).toBe(true);
    expect(result.failedInstructors).toEqual([]);
  });
});

// Item 1: startDate/endDate replaced the old dateRange:number parameter.
// Omitting both falls back to the documented default (tomorrow through 13
// days later - the same 14-day window dateRange:14 used to produce); an
// inverted or over-limit explicit range is rejected before any query runs.
describe('findRankedAvailableSlots - explicit date range', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('falls back to the 14-day tomorrow-based default when startDate/endDate are omitted', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const expectedStart = tenantTomorrow(TEST_TIMEZONE);
    const expectedEnd = addTenantDays(expectedStart, 13, TEST_TIMEZONE);
    const dayOfWeek = tenantDayOfWeek(expectedStart, TEST_TIMEZONE);

    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Priya Patel', zip_code: '90210' }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for "coming from" lookup
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW])); // findAvailableSlots settings
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-1', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // time off
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons
    mockQuery.mockResolvedValueOnce(queryResult([])); // student's own lessons

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: 120,
      instructorId: 'instructor-1',
    });

    // Call 3 (0-indexed: 2) is the lessons-for-"coming from" lookup, which
    // is passed the resolved window as its date-range params - confirms the
    // default actually landed on expectedStart/expectedEnd, not some other
    // fallback. (Call order: getTenantSettings, instructor lookup, this one.)
    const [lessonsSql, lessonsParams] = mockQuery.mock.calls[2];
    expect(lessonsSql).toContain('FROM lessons');
    expect(lessonsParams).toContain(expectedStart);
    expect(lessonsParams).toContain(expectedEnd);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it('returns only slots within a narrower explicit range', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const start = tenantTomorrow(TEST_TIMEZONE);
    const dayOfWeek = tenantDayOfWeek(start, TEST_TIMEZONE);

    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Priya Patel', zip_code: '90210' }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-1', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: 120,
      startDate: start,
      endDate: start,
      instructorId: 'instructor-1',
    });

    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(slot.date).toBe(start);
    }
  });

  it('rejects an endDate before startDate before any instructor/slot query runs', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const start = tenantTomorrow(TEST_TIMEZONE);
    const beforeStart = addTenantDays(start, -1, TEST_TIMEZONE);

    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings - resolved before validation

    await expect(
      findRankedAvailableSlots({
        tenantId: TENANT_ID,
        studentId: STUDENT_ID,
        pickupZip: '90210',
        duration: 120,
        startDate: start,
        endDate: beforeStart,
      })
    ).rejects.toThrow('endDate must not be before startDate');

    // Only the timezone lookup ran - no instructor lookup, no slot search.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects a range spanning more than 180 days before any instructor/slot query runs', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const start = tenantTomorrow(TEST_TIMEZONE);
    const tooFar = addTenantDays(start, 181, TEST_TIMEZONE);

    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW]));

    await expect(
      findRankedAvailableSlots({
        tenantId: TENANT_ID,
        studentId: STUDENT_ID,
        pickupZip: '90210',
        duration: 120,
        startDate: start,
        endDate: tooFar,
      })
    ).rejects.toThrow('180 days');

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('findRankedAvailableSlots - ranking order', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('sorts slots by proximity score descending, then by date/time ascending', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const dayOfWeek = tenantDayOfWeek(tenantTomorrow(TEST_TIMEZONE), TEST_TIMEZONE);

    // 0. getTenantSettings (timezone)
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW]));
    // 1. Instructor lookup (all active - two instructors)
    mockQuery.mockResolvedValueOnce(
      queryResult([
        { id: 'instructor-far', full_name: 'Far Away', zip_code: '10001' }, // NY zip - unknown region -> neutral score vs 90210
        { id: 'instructor-close', full_name: 'Close By', zip_code: '90210' }, // same zip as pickup -> 100 score
      ])
    );
    // 2. Lessons for candidate instructors in the search window (empty - both start from home)
    mockQuery.mockResolvedValueOnce(queryResult([]));

    // findAvailableSlots for instructor-far
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-far', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 1 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([])); // student's own lessons

    // findAvailableSlots for instructor-close
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-close', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 1 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([])); // student's own lessons

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: 120,
      startDate: tenantTomorrow(TEST_TIMEZONE),
      endDate: tenantTomorrow(TEST_TIMEZONE),
    });

    expect(result.slots.length).toBeGreaterThan(0);
    // The closer instructor's slot(s) must come first
    expect(result.slots[0].instructorId).toBe('instructor-close');
    expect(result.slots[0].proximityScore).toBe(100);

    // Scores should be non-increasing across the sorted list
    for (let i = 1; i < result.slots.length; i++) {
      expect(result.slots[i].proximityScore).toBeLessThanOrEqual(result.slots[i - 1].proximityScore);
    }
  });

  it('reports a failed instructor without failing the whole search', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const dayOfWeek = tenantDayOfWeek(tenantTomorrow(TEST_TIMEZONE), TEST_TIMEZONE);

    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings
    mockQuery.mockResolvedValueOnce(
      queryResult([
        { id: 'instructor-ok', full_name: 'Works Fine', zip_code: '90210' },
        { id: 'instructor-broken', full_name: 'Broken', zip_code: '90210' },
      ])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for "coming from" lookup

    // findAvailableSlots for instructor-ok succeeds
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-ok', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 1 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));

    // findAvailableSlots for instructor-broken throws (simulates a DB error)
    mockQuery.mockRejectedValueOnce(new Error('simulated failure'));

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: 120,
      startDate: tenantTomorrow(TEST_TIMEZONE),
      endDate: tenantTomorrow(TEST_TIMEZONE),
    });

    expect(result.failedInstructors).toEqual(['instructor-broken']);
    expect(result.slots.every((s) => s.instructorId === 'instructor-ok')).toBe(true);
    expect(result.slots.length).toBeGreaterThan(0);
  });
});

// Regression coverage for getInstructorStartingPoint: it used to do
// (lessonsByInstructorDate.get(key) || []).filter(...).sort(...)[0] - safe
// only because .filter() happens to return a new array before .sort()
// mutates it. Replaced with a single linear scan over the shared array with
// no .filter()/.sort() at all, so it can never mutate lessonsByInstructorDate
// no matter how the surrounding code changes later.
describe('findRankedAvailableSlots - getInstructorStartingPoint (no sort, no mutation)', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  const tomorrowDateStr = tenantTomorrow(TEST_TIMEZONE);
  const dayOfWeek = tenantDayOfWeek(tomorrowDateStr, TEST_TIMEZONE);

  it('picks the latest-ending same-day lesson (not just any lesson) as the "coming from" point', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    // getTenantSettings (timezone)
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW]));
    // Instructor lookup
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Priya Patel', zip_code: '90210' }])
    );
    // Lessons for "coming from" lookup: two lessons for instructor-1 on the
    // same day the search will generate slots for, both ending before the
    // instructor's 09:00 availability window opens for later slots - the
    // 08:00-08:30 lesson ends later than the 07:00-07:30 one, so its pickup
    // zip (90005) must win, not 10001.
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          instructor_id: 'instructor-1',
          date: tomorrowDateStr,
          start_time: '07:00:00',
          end_time: '07:30:00',
          pickup_address: '123 Early St, 10001',
        },
        {
          instructor_id: 'instructor-1',
          date: tomorrowDateStr,
          start_time: '08:00:00',
          end_time: '08:30:00',
          pickup_address: '456 Later Ave, 90005',
        },
      ])
    );

    // findAvailableSlots(instructor-1): settings, availability (09:00-17:00
    // so every generated slot starts after both lessons above end), time
    // off, lessons (instructor-dimension conflict check), student's own
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-1', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: 60,
      startDate: tenantTomorrow(TEST_TIMEZONE),
      endDate: tenantTomorrow(TEST_TIMEZONE),
      instructorId: 'instructor-1',
    });

    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(slot.comingFrom).toBe('lesson');
      expect(slot.instructorZip).toBe('90005');
    }
  });

  it('never sorts the lessons array while computing a slot\'s "coming from" point', async () => {
    // findRankedAvailableSlots legitimately sorts its final rankedSlots
    // result array (by proximity then date/time - unrelated to this fix).
    // What must never happen is a .sort() call on an array of lesson rows
    // (the shape stored in lessonsByInstructorDate) - that's the specific
    // mutation vector this fix removes from getInstructorStartingPoint.
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const sortSpy = vi.spyOn(Array.prototype, 'sort');

    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Priya Patel', zip_code: '90210' }])
    );
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          instructor_id: 'instructor-1',
          date: tomorrowDateStr,
          start_time: '07:00:00',
          end_time: '07:30:00',
          pickup_address: '123 Early St, 10001',
        },
        {
          instructor_id: 'instructor-1',
          date: tomorrowDateStr,
          start_time: '08:00:00',
          end_time: '08:30:00',
          pickup_address: '456 Later Ave, 90005',
        },
      ])
    );
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-1', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));

    try {
      const result = await findRankedAvailableSlots({
        tenantId: TENANT_ID,
        studentId: STUDENT_ID,
        pickupZip: '90210',
        duration: 60,
        startDate: tenantTomorrow(TEST_TIMEZONE),
        endDate: tenantTomorrow(TEST_TIMEZONE),
        instructorId: 'instructor-1',
      });

      expect(result.slots.length).toBeGreaterThan(0);

      // No sort call was made on an array of lesson rows (identifiable by
      // each element having an `end_time` property, the shape returned by
      // the lessons query and stored in lessonsByInstructorDate). The
      // rankedSlots.sort(...) call on the final result array is expected
      // and untouched by this fix - it sorts RankedTimeSlot objects, which
      // have no `end_time` field.
      const sortedLessonArrays = sortSpy.mock.instances.filter(
        (arr) => Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && 'end_time' in arr[0]
      );
      expect(sortedLessonArrays).toEqual([]);
    } finally {
      sortSpy.mockRestore();
    }
  });
});

// Regression coverage: Postgres numeric columns (e.g. lessons.duration)
// come back through pg as strings ("60.00", not 60). A caller that reuses a
// stored lesson's duration to prefill a new search (e.g. "Book again")
// could pass that string straight through - route-level validateNumeric
// now coerces it before this service ever sees it, but this test proves
// the service itself is also defended (findSlotsInBlock's
// `currentTime + duration` would otherwise silently string-concatenate,
// e.g. 540 + "60.00" = "54060.00", making every theoretical slot fail the
// blockEnd check on its first iteration - zero slots, always). The
// `as unknown as number` cast simulates a caller bypassing the TypeScript
// `duration: number` contract, exactly as a real HTTP request body does
// (JSON has no way to enforce it, and this project's own frontend bug
// sent duration as a string before being fixed at the call site too).
describe('findRankedAvailableSlots - duration arrives as a numeric string', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('still generates slots when duration is a numeric string like "60.00", not the empty result the string-concatenation bug produced', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const start = tenantTomorrow(TEST_TIMEZONE);
    const dayOfWeek = tenantDayOfWeek(start, TEST_TIMEZONE);

    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Priya Patel', zip_code: '90210' }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for "coming from" lookup
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW])); // findAvailableSlots settings
    mockQuery.mockResolvedValueOnce(queryResult([TENANT_SETTINGS_ROW])); // getTenantSettings (max_lessons_per_student_per_day)
    mockQuery.mockResolvedValueOnce(
      // A single 9am-5pm block - with a genuine number duration this
      // produces multiple slots; with the string-concat bug it produces zero.
      queryResult([{ instructor_id: 'instructor-1', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 3 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // time off
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons
    mockQuery.mockResolvedValueOnce(queryResult([])); // student's own lessons

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: '60.00' as unknown as number,
      startDate: start,
      endDate: start,
      instructorId: 'instructor-1',
    });

    expect(result.failedInstructors).toEqual([]);
    expect(result.slots.length).toBeGreaterThan(0);
    // Every returned slot's own duration field must also be the coerced
    // number, not the original string, since findAvailableSlots stores
    // whatever `duration` it was given directly onto each TimeSlot.
    for (const slot of result.slots) {
      expect(slot.duration).toBe(60);
    }
  });
});
