import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';

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

describe('findRankedAvailableSlots - single-instructor scope', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('only searches the requested instructor when instructorId is provided', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    // 1. Instructor lookup (scoped to the one instructor)
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'instructor-1', full_name: 'Priya Patel', zip_code: '90210' }])
    );
    // 2. Lessons for candidate instructors in the search window (for "coming from" lookup)
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 3. findAvailableSlots(instructor-1): settings
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
    // 4. availability (all days at once)
    mockQuery.mockResolvedValueOnce(
      queryResult([
        { instructor_id: 'instructor-1', day_of_week: new Date().getDay(), start_time: '09:00:00', end_time: '17:00:00', max_students: 3 },
      ])
    );
    // 5. time off
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 6. lessons
    mockQuery.mockResolvedValueOnce(queryResult([]));
    // 7. student's own lessons
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await findRankedAvailableSlots({
      tenantId: TENANT_ID,
      studentId: STUDENT_ID,
      pickupZip: '90210',
      duration: 120,
      dateRange: 1,
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

describe('findRankedAvailableSlots - ranking order', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('sorts slots by proximity score descending, then by date/time ascending', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

    const dayOfWeek = new Date(Date.now() + 24 * 60 * 60 * 1000).getDay();

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
    mockQuery.mockResolvedValueOnce(
      queryResult([{ instructor_id: 'instructor-far', day_of_week: dayOfWeek, start_time: '09:00:00', end_time: '17:00:00', max_students: 1 }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([]));
    mockQuery.mockResolvedValueOnce(queryResult([])); // student's own lessons

    // findAvailableSlots for instructor-close
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
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
      dateRange: 1,
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

    const dayOfWeek = new Date(Date.now() + 24 * 60 * 60 * 1000).getDay();

    mockQuery.mockResolvedValueOnce(
      queryResult([
        { id: 'instructor-ok', full_name: 'Works Fine', zip_code: '90210' },
        { id: 'instructor-broken', full_name: 'Broken', zip_code: '90210' },
      ])
    );
    mockQuery.mockResolvedValueOnce(queryResult([])); // lessons for "coming from" lookup

    // findAvailableSlots for instructor-ok succeeds
    mockQuery.mockResolvedValueOnce(queryResult([SETTINGS_ROW]));
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
      dateRange: 1,
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

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrowDateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const dayOfWeek = tomorrow.getDay();

  it('picks the latest-ending same-day lesson (not just any lesson) as the "coming from" point', async () => {
    const { findRankedAvailableSlots } = await import('../services/schedulingService');

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
      dateRange: 1,
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
        dateRange: 1,
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
