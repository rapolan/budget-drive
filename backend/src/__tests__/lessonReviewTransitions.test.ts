import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';
import { AppError } from '../middleware/errorHandler';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const LESSON_ID = 'lesson-1';
const STUDENT_ID = 'student-1';
const USER_ID = 'user-admin-1';

function lessonRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LESSON_ID,
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    instructor_id: 'instructor-1',
    vehicle_id: 'vehicle-1',
    date: '2026-08-10',
    start_time: '09:00:00',
    end_time: '11:00:00',
    duration: '120.00',
    lesson_number: null,
    pickup_address: null,
    status: 'scheduled',
    lesson_type: 'behind_wheel',
    skills_practiced: null,
    student_performance: null,
    instructor_rating: null,
    notes: null,
    completion_verified: false,
    cost: '150.00',
    bsv_record_hash: null,
    coda_row_id: null,
    created_by: null,
    updated_by: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date('2026-08-01'),
    updated_at: new Date('2026-08-01'),
    ...overrides,
  };
}

describe('lessonService - status transitions record reviewer and timestamp', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('completeLesson sets reviewedBy/reviewedAt from the acting user', async () => {
    const { completeLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()])) // assertLessonReviewable's getLessonById
      .mockResolvedValueOnce(
        queryResult([lessonRow({ status: 'completed', completion_verified: true, reviewed_by: USER_ID, reviewed_at: new Date('2026-08-11') })])
      ); // the UPDATE ... RETURNING *

    const lesson = await completeLesson(LESSON_ID, TENANT_ID, USER_ID);

    expect(lesson.status).toBe('completed');
    expect(lesson.reviewedBy).toBe(USER_ID);
    expect(lesson.reviewedAt).not.toBeNull();

    const [updateSql, updateParams] = mockQuery.mock.calls[1];
    expect(updateSql).toMatch(/reviewed_by\s*=\s*\$3/);
    expect(updateSql).toMatch(/reviewed_at\s*=\s*NOW\(\)/);
    expect(updateParams).toEqual([LESSON_ID, TENANT_ID, USER_ID]);
  });

  it('noShowLesson sets reviewedBy/reviewedAt from the acting user', async () => {
    const { noShowLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()])) // assertLessonReviewable
      .mockResolvedValueOnce(
        queryResult([lessonRow({ status: 'no_show', reviewed_by: USER_ID, reviewed_at: new Date('2026-08-11') })])
      ) // UPDATE ... RETURNING *
      .mockResolvedValueOnce(queryResult([{ full_name: 'Test Student' }])) // student name lookup for notification
      .mockResolvedValueOnce(queryResult([{ id: 'notif-1' }])); // createNoShowNotification's INSERT

    const lesson = await noShowLesson(LESSON_ID, TENANT_ID, USER_ID);

    expect(lesson.status).toBe('no_show');
    expect(lesson.reviewedBy).toBe(USER_ID);
    expect(lesson.reviewedAt).not.toBeNull();

    const [updateSql, updateParams] = mockQuery.mock.calls[1];
    expect(updateSql).toMatch(/reviewed_by\s*=\s*\$3/);
    expect(updateParams).toEqual([LESSON_ID, TENANT_ID, USER_ID]);
  });

  it('cancelLesson sets reviewedBy/reviewedAt from the acting user', async () => {
    const { cancelLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()])) // assertLessonReviewable
      .mockResolvedValueOnce(
        queryResult([lessonRow({ status: 'cancelled', reviewed_by: USER_ID, reviewed_at: new Date('2026-08-11') })])
      ) // UPDATE ... RETURNING *
      .mockResolvedValueOnce(queryResult([{ email: 'student@example.com' }])) // student email
      .mockResolvedValueOnce(queryResult([{ email: 'instructor@example.com' }])) // instructor email
      .mockResolvedValueOnce(queryResult([])) // notification_queue insert (student)
      .mockResolvedValueOnce(queryResult([])) // notification_queue insert (instructor)
      .mockResolvedValueOnce(queryResult([])); // cancel pending reminders

    const lesson = await cancelLesson(LESSON_ID, TENANT_ID, USER_ID);

    expect(lesson.status).toBe('cancelled');
    expect(lesson.reviewedBy).toBe(USER_ID);
    expect(lesson.reviewedAt).not.toBeNull();

    const [updateSql, updateParams] = mockQuery.mock.calls[1];
    expect(updateSql).toMatch(/reviewed_by\s*=\s*\$3/);
    expect(updateParams).toEqual([LESSON_ID, TENANT_ID, USER_ID]);
  });

  it('completeLesson works without a userId (reviewedBy stays null, no crash)', async () => {
    const { completeLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow()]))
      .mockResolvedValueOnce(queryResult([lessonRow({ status: 'completed', completion_verified: true })]));

    const lesson = await completeLesson(LESSON_ID, TENANT_ID);

    expect(lesson.status).toBe('completed');
    const [, updateParams] = mockQuery.mock.calls[1];
    expect(updateParams).toEqual([LESSON_ID, TENANT_ID, null]);
  });
});

describe('lessonService - status transition guard rejects an already-terminal lesson', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('completeLesson rejects a lesson that is already completed', async () => {
    const { completeLesson } = await import('../services/lessonService');
    mockQuery.mockResolvedValueOnce(queryResult([lessonRow({ status: 'completed' })]));

    await expect(completeLesson(LESSON_ID, TENANT_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    // Only the read happened - no UPDATE was ever issued.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('noShowLesson rejects a lesson that is already cancelled', async () => {
    const { noShowLesson } = await import('../services/lessonService');
    mockQuery.mockResolvedValueOnce(queryResult([lessonRow({ status: 'cancelled' })]));

    await expect(noShowLesson(LESSON_ID, TENANT_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('cancelLesson rejects a lesson that is already no_show', async () => {
    const { cancelLesson } = await import('../services/lessonService');
    mockQuery.mockResolvedValueOnce(queryResult([lessonRow({ status: 'no_show' })]));

    await expect(cancelLesson(LESSON_ID, TENANT_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('completeLesson on a still-scheduled lesson (the normal case) succeeds', async () => {
    const { completeLesson } = await import('../services/lessonService');
    mockQuery
      .mockResolvedValueOnce(queryResult([lessonRow({ status: 'scheduled' })]))
      .mockResolvedValueOnce(queryResult([lessonRow({ status: 'completed', completion_verified: true })]));

    const lesson = await completeLesson(LESSON_ID, TENANT_ID, USER_ID);
    expect(lesson.status).toBe('completed');
  });

  it('throws 404 when the lesson does not exist for this tenant', async () => {
    const { completeLesson } = await import('../services/lessonService');
    mockQuery.mockResolvedValueOnce(queryResult([])); // getLessonById finds nothing

    await expect(completeLesson(LESSON_ID, TENANT_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
