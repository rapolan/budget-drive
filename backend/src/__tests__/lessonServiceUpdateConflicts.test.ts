import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';
import { AppError } from '../middleware/errorHandler';

vi.mock('../config/database', () => ({ query: mockQuery }));

const mockValidateLessonBooking = vi.fn();
vi.mock('../services/schedulingService', () => ({
  validateLessonBooking: (...args: any[]) => mockValidateLessonBooking(...args),
}));

vi.mock('../services/treasuryService', () => ({
  default: { createTransaction: vi.fn() },
}));

vi.mock('../services/Ledger', () => ({
  ledger: { anchorAction: vi.fn() },
}));

vi.mock('../services/lessonInviteService', () => ({
  default: { sendLessonInviteForLesson: vi.fn().mockResolvedValue(false) },
  sendLessonInviteForLesson: vi.fn().mockResolvedValue(false),
}));

const TENANT_ID = 'tenant-abc';
const LESSON_ID = 'lesson-1';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';
const VEHICLE_ID = 'vehicle-1';

const existingLessonRow = {
  id: LESSON_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  instructor_id: INSTRUCTOR_ID,
  vehicle_id: VEHICLE_ID,
  date: new Date('2026-08-03T00:00:00.000Z'),
  start_time: '10:00:00',
  end_time: '12:00:00',
  duration: 120,
  lesson_number: null,
  status: 'scheduled',
  lesson_type: 'behind_wheel',
  pickup_address: null,
  notes: null,
  cost: 50,
  student_performance: null,
  instructor_rating: null,
  completion_verified: false,
};

describe('lessonService.updateLesson - scheduling conflict validation', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
  });

  it('editing a lesson into an overlap is rejected with the structured conflict', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([existingLessonRow])) // fetch existing lesson
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])); // instructor existence check

    const conflicts = [
      { type: 'instructor_busy', message: 'Instructor already has a lesson during this time' },
    ];
    mockValidateLessonBooking.mockResolvedValueOnce({ valid: false, conflicts });

    let caught: unknown;
    try {
      await updateLesson(LESSON_ID, TENANT_ID, { instructorId: 'instructor-2' } as any);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(409);
    expect((caught as AppError).conflicts).toEqual(conflicts);
    expect(mockValidateLessonBooking).toHaveBeenCalledTimes(1);
  });

  it('editing only non-schedule fields (notes, status) skips the conflict check entirely', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([existingLessonRow])) // fetch existing lesson
      .mockResolvedValueOnce(queryResult([{ ...existingLessonRow, notes: 'Updated notes', status: 'completed' }])); // UPDATE ... RETURNING *

    const result = await updateLesson(LESSON_ID, TENANT_ID, {
      notes: 'Updated notes',
      status: 'completed',
    } as any);

    expect(mockValidateLessonBooking).not.toHaveBeenCalled();
    expect(result.notes).toBe('Updated notes');
  });

  it('rescheduling within the same day at capacity still succeeds - excludeLessonId is honored', async () => {
    const { updateLesson } = await import('../services/lessonService');

    mockQuery
      .mockResolvedValueOnce(queryResult([existingLessonRow])) // fetch existing lesson
      .mockResolvedValueOnce(queryResult([{ ...existingLessonRow, start_time: '13:00:00', end_time: '15:00:00' }])); // UPDATE ... RETURNING *

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    await updateLesson(LESSON_ID, TENANT_ID, {
      startTime: '13:00:00',
      endTime: '15:00:00',
    } as any);

    expect(mockValidateLessonBooking).toHaveBeenCalledTimes(1);
    const callArgs = mockValidateLessonBooking.mock.calls[0];
    // validateLessonBooking(tenantId, instructorId, studentId, vehicleId, startTime, endTime, excludeLessonId)
    expect(callArgs[0]).toBe(TENANT_ID);
    expect(callArgs[1]).toBe(INSTRUCTOR_ID); // merged from existing row, unchanged
    expect(callArgs[2]).toBe(STUDENT_ID); // merged from existing row, unchanged
    expect(callArgs[6]).toBe(LESSON_ID); // excludeLessonId - the lesson's own id
  });
});
