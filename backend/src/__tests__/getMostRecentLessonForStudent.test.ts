import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';

// Regression coverage for "Book again" (item 5's prefill source): the
// query must return only the single latest lesson (by date, then
// start_time), matching getLessonsByStudent's own ORDER BY - this is
// purely a LIMIT 1 efficiency variant of that already-correct ordering,
// not a different sort.
describe('lessonService.getMostRecentLessonForStudent', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns the single most recent lesson by date, then start_time', async () => {
    const { getMostRecentLessonForStudent } = await import('../services/lessonService');

    // The mock query itself doesn't apply ORDER BY/LIMIT (that's real SQL,
    // asserted separately below) - return only the row a correct query
    // would produce, proving the service reads and maps it correctly.
    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'lesson-latest',
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: 'instructor-2',
          date: '2026-08-20',
          start_time: '14:00:00',
          end_time: '16:00:00',
          duration: '120',
          lesson_type: 'behind_wheel',
          pickup_address: '456 Later Ave, 90005',
          cost: '75.00',
          status: 'scheduled',
        },
      ])
    );

    const lesson = await getMostRecentLessonForStudent(TENANT_ID, STUDENT_ID);

    expect(lesson).not.toBeNull();
    expect(lesson!.id).toBe('lesson-latest');
    expect(lesson!.instructorId).toBe('instructor-2');
    expect(lesson!.date).toBe('2026-08-20');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY l\.date DESC, l\.start_time DESC/);
    expect(sql).toMatch(/LIMIT 1/);
    expect(params).toEqual([TENANT_ID, STUDENT_ID]);
  });

  it('returns null for a student with no lessons', async () => {
    const { getMostRecentLessonForStudent } = await import('../services/lessonService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const lesson = await getMostRecentLessonForStudent(TENANT_ID, STUDENT_ID);

    expect(lesson).toBeNull();
  });
});
