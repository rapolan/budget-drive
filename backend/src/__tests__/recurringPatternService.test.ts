import { describe, it, expect, beforeEach, vi } from 'vitest';
import { queryResult } from './mocks/database';

// recurringPatternService calls `pool.query` (the default export) directly;
// tenantService.getTenantSettings (called from within generateLessons to
// resolve the tenant's timezone) uses the named `query` export instead.
// Both need to share one mock so the call sequence is a single, orderable
// timeline - in the real database.ts they're backed by the same pool.
const mockPoolQuery = vi.fn();
vi.mock('../config/database', () => ({
  default: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  query: (...args: unknown[]) => mockPoolQuery(...args),
}));

const TENANT_ID = 'tenant-abc';
const PATTERN_ID = 'pattern-1';

const PATTERN_ROW = {
  id: PATTERN_ID,
  tenant_id: TENANT_ID,
  student_id: 'student-1',
  instructor_id: 'instructor-1',
  vehicle_id: 'vehicle-1',
  lesson_type: 'behind_wheel',
  duration: 120,
  cost: 50,
  recurrence_type: 'weekly',
  days_of_week: [1],
  time_of_day: '14:00:00',
  start_date: new Date('2026-03-15T00:00:00.000Z'),
  end_date: new Date('2026-03-15T00:00:00.000Z'),
  max_occurrences: null,
};

// Regression coverage: generateLessons combined a tenant wall-clock
// time_of_day with a date via a naive `${lessonDate}T${startTime}` parse
// (interpreted in the PROCESS's local timezone, not the tenant's) to
// compute the lesson's stored end_time. Now resolved via the
// tenant-timezone helper module (item 1).
describe('recurringPatternService.generateLessons - tenant-timezone-aware end_time', () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
  });

  it('computes end_time by adding the pattern duration in the TENANT timezone, not the process-local timezone', async () => {
    const { recurringPatternService } = await import('../services/recurringPatternService');

    mockPoolQuery
      .mockResolvedValueOnce(queryResult([PATTERN_ROW])) // pattern lookup
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/New_York' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ is_exception: false }])) // is_exception_date
      .mockResolvedValueOnce(queryResult([])) // existing lesson check - none
      .mockResolvedValueOnce(queryResult([{ id: 'lesson-1', date: '2026-03-15', start_time: '14:00:00', end_time: '16:00:00' }])) // INSERT lesson
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }])) // INSERT pattern_generated_lessons
      .mockResolvedValueOnce(queryResult([{ next_date: '2026-03-22' }])); // next occurrence - past end_date, loop terminates

    const result = await recurringPatternService.generateLessons(PATTERN_ID, TENANT_ID);

    expect(result.lessons_generated).toBe(1);

    const insertLessonCall = mockPoolQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons')
    );
    expect(insertLessonCall).toBeDefined();
    const [, params] = insertLessonCall!;
    // params: [tenantId, studentId, instructorId, vehicleId, date, startTime, endTime, duration, lessonType, cost]
    expect(params[4]).toBe('2026-03-15'); // date
    expect(params[5]).toBe('14:00:00'); // start_time - unchanged, straight from pattern.time_of_day
    // 14:00 Eastern + 120 minutes = 16:00 Eastern, NOT a process-local
    // (e.g. Pacific) computation that would drift the hour.
    expect(params[6]).toBe('16:00:00'); // end_time
  });

  it('computes end_time correctly for a no-DST tenant (America/Phoenix)', async () => {
    const { recurringPatternService } = await import('../services/recurringPatternService');

    mockPoolQuery
      .mockResolvedValueOnce(queryResult([{ ...PATTERN_ROW, duration: 90 }])) // pattern lookup
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Phoenix' }])) // getTenantSettings
      .mockResolvedValueOnce(queryResult([{ is_exception: false }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ id: 'lesson-1' }]))
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }]))
      .mockResolvedValueOnce(queryResult([{ next_date: '2026-03-22' }]));

    await recurringPatternService.generateLessons(PATTERN_ID, TENANT_ID);

    const insertLessonCall = mockPoolQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons')
    );
    const [, params] = insertLessonCall!;
    // 14:00 + 90 minutes = 15:30, regardless of DST (Phoenix has none).
    expect(params[6]).toBe('15:30:00');
  });

  it('falls back to the documented default timezone when the tenant has none configured', async () => {
    const { recurringPatternService } = await import('../services/recurringPatternService');

    mockPoolQuery
      .mockResolvedValueOnce(queryResult([PATTERN_ROW]))
      .mockResolvedValueOnce(queryResult([])) // no tenant_settings row
      .mockResolvedValueOnce(queryResult([{ is_exception: false }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ id: 'lesson-1' }]))
      .mockResolvedValueOnce(queryResult([{ id: 'link-1' }]))
      .mockResolvedValueOnce(queryResult([{ next_date: '2026-03-22' }]));

    await recurringPatternService.generateLessons(PATTERN_ID, TENANT_ID);

    const insertLessonCall = mockPoolQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO lessons')
    );
    const [, params] = insertLessonCall!;
    // Default is America/Los_Angeles - 14:00 + 120min = 16:00, same
    // wall-clock arithmetic as any other zone (no DST boundary crossed here).
    expect(params[6]).toBe('16:00:00');
  });
});
