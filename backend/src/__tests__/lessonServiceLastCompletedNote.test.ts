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

  it('returns the most recent completed lesson\'s date/notes, filtered to status=completed and excluding the given lesson', async () => {
    const { getLastCompletedLessonNoteForStudent } = await import('../services/lessonService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ date: new Date('2026-10-01'), notes: 'Great progress on parallel parking' }])
    );

    const result = await getLastCompletedLessonNoteForStudent(TENANT_ID, STUDENT_ID, CURRENT_LESSON_ID);

    expect(result).toEqual({ date: new Date('2026-10-01'), notes: 'Great progress on parallel parking' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'completed'/);
    expect(sql).toMatch(/l\.id != \$3/);
    expect(params).toEqual([TENANT_ID, STUDENT_ID, CURRENT_LESSON_ID]);
  });

  it('returns null when the student has no completed lessons other than the one being excluded', async () => {
    const { getLastCompletedLessonNoteForStudent } = await import('../services/lessonService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const result = await getLastCompletedLessonNoteForStudent(TENANT_ID, STUDENT_ID, CURRENT_LESSON_ID);

    expect(result).toBeNull();
  });
});
