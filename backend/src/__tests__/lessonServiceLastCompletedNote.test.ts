import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const CURRENT_LESSON_ID = 'lesson-current';

describe('lessonService.getLastCompletedLessonNoteForStudent', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('looks up the viewed lesson\'s own date/start_time first, then searches for a completed lesson strictly before it', async () => {
    const { getLastCompletedLessonNoteForStudent } = await import('../services/lessonService');

    // 1st call: the viewed lesson's own date/start_time (tenant-scoped).
    mockQuery.mockResolvedValueOnce(
      queryResult([{ date: new Date('2026-10-15'), start_time: '09:00:00' }])
    );
    // 2nd call: the actual search.
    mockQuery.mockResolvedValueOnce(
      queryResult([{ date: new Date('2026-10-01'), notes: 'Great progress on parallel parking' }])
    );

    const result = await getLastCompletedLessonNoteForStudent(TENANT_ID, STUDENT_ID, CURRENT_LESSON_ID);

    expect(result).toEqual({ date: new Date('2026-10-01'), notes: 'Great progress on parallel parking' });

    const [lookupSql, lookupParams] = mockQuery.mock.calls[0];
    expect(lookupSql).toMatch(/SELECT date, start_time FROM lessons/);
    expect(lookupParams).toEqual([CURRENT_LESSON_ID, TENANT_ID]);

    const [searchSql, searchParams] = mockQuery.mock.calls[1];
    expect(searchSql).toMatch(/status = 'completed'/);
    expect(searchSql).toMatch(/l\.id != \$3/);
    // The row-comparison clause is what actually enforces "strictly
    // before" - a regression here would silently surface a later lesson's
    // note again (the exact bug this function was fixed for).
    expect(searchSql).toMatch(/\(l\.date, l\.start_time\) < \(\$4, \$5\)/);
    expect(searchParams).toEqual([TENANT_ID, STUDENT_ID, CURRENT_LESSON_ID, new Date('2026-10-15'), '09:00:00']);
  });

  it('returns null when the student has no completed lesson before the viewed lesson', async () => {
    const { getLastCompletedLessonNoteForStudent } = await import('../services/lessonService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ date: new Date('2026-10-15'), start_time: '09:00:00' }])
    );
    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await getLastCompletedLessonNoteForStudent(TENANT_ID, STUDENT_ID, CURRENT_LESSON_ID);

    expect(result).toBeNull();
  });

  it('returns null without searching when the viewed lesson itself cannot be found for this tenant', async () => {
    const { getLastCompletedLessonNoteForStudent } = await import('../services/lessonService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await getLastCompletedLessonNoteForStudent(TENANT_ID, STUDENT_ID, CURRENT_LESSON_ID);

    expect(result).toBeNull();
    // Only the lookup query ran - no second, wasted search query.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
