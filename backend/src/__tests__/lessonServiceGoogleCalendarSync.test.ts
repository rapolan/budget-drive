import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

// Regression/behavioral coverage for the Google Calendar sync hook points
// wired into lessonService.ts's 5 lesson-mutating functions
// (create/update/complete/no-show/cancel). The critical property under
// test: syncLessonToGoogle is called fire-and-forget (never awaited on
// the request path), so a hanging or failing Google call can NEVER delay
// or fail a lesson write - this is enforced with a controllable promise
// that only resolves after the assertion on createLesson's own timing
// already ran.

vi.mock('../config/database', () => ({ query: mockQuery }));

const mockValidateLessonBooking = vi.fn();
vi.mock('../services/schedulingService', () => ({
  validateLessonBooking: (...args: unknown[]) => mockValidateLessonBooking(...args),
}));

vi.mock('../services/lessonInviteService', () => ({
  default: { sendLessonInviteForLesson: vi.fn().mockResolvedValue(false) },
  sendLessonInviteForLesson: vi.fn().mockResolvedValue(false),
}));

const mockSyncLessonToGoogle = vi.fn();
const mockRemoveLessonEventFromInstructorCalendar = vi.fn();
vi.mock('../services/googleCalendarSyncService', () => ({
  syncLessonToGoogle: (...args: unknown[]) => mockSyncLessonToGoogle(...args),
  removeLessonEventFromInstructorCalendar: (...args: unknown[]) => mockRemoveLessonEventFromInstructorCalendar(...args),
}));

const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';
const INSTRUCTOR_B_ID = 'instructor-2';
const LESSON_ID = 'lesson-1';

function mockCreateLessonQuerySequence(overrides: Partial<Record<string, unknown>> = {}) {
  mockQuery
    .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student check
    .mockResolvedValueOnce(
      queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', status: 'active' }])
    ) // active enrollment
    .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // instructor check
    .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
    .mockResolvedValueOnce(queryResult([{ id: 'vehicle-explicit' }])) // explicit vehicle check
    .mockResolvedValueOnce(queryResult([])) // hasCompletedInternalDriverEducation
    .mockResolvedValueOnce(
      queryResult([{
        id: LESSON_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        instructor_id: INSTRUCTOR_ID,
        vehicle_id: 'vehicle-explicit',
        cost: 0,
        status: 'scheduled',
        ...overrides,
      }])
    ) // insert lesson
    .mockResolvedValueOnce(queryResult([{ email: null, full_name: 'Jane Doe' }])) // student email lookup
    .mockResolvedValueOnce(queryResult([{ email: null }])) // instructor email lookup
    .mockResolvedValueOnce(queryResult([])); // no-show notification dismissal
}

describe('lessonService.ts - Google Calendar sync hook points never block the request path', () => {
  beforeEach(() => {
    resetMockQuery();
    mockValidateLessonBooking.mockReset();
    mockSyncLessonToGoogle.mockReset();
    mockRemoveLessonEventFromInstructorCalendar.mockReset();
    vi.resetModules();
  });

  it('createLesson resolves before a hanging Google sync call ever settles', async () => {
    const { createLesson } = await import('../services/lessonService');

    let googleCallResolved = false;
    let resolveGoogleCall: () => void = () => {};
    mockSyncLessonToGoogle.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveGoogleCall = () => {
          googleCallResolved = true;
          resolve();
        };
      })
    );

    mockCreateLessonQuerySequence();
    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    const lesson = await createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      vehicleId: 'vehicle-explicit',
      date: '2026-09-23',
      startTime: '13:00:00',
      endTime: '14:00:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 0,
    });

    // createLesson has already resolved - the Google sync promise is still
    // pending (never resolved it ourselves yet).
    expect(lesson.id).toBe(LESSON_ID);
    expect(googleCallResolved).toBe(false);
    expect(mockSyncLessonToGoogle).toHaveBeenCalledWith(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);

    // Clean up the dangling promise so it doesn't leak into other tests.
    resolveGoogleCall();
  });

  it('createLesson succeeds even when the Google sync call rejects outright', async () => {
    const { createLesson } = await import('../services/lessonService');
    mockSyncLessonToGoogle.mockRejectedValue(new Error('Google API unavailable'));

    mockCreateLessonQuerySequence();
    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    await expect(createLesson(TENANT_ID, {
      studentId: STUDENT_ID,
      instructorId: INSTRUCTOR_ID,
      vehicleId: 'vehicle-explicit',
      date: '2026-09-23',
      startTime: '13:00:00',
      endTime: '14:00:00',
      duration: 60,
      lessonType: 'behind_wheel',
      cost: 0,
    })).resolves.toMatchObject({ id: LESSON_ID });
  });

  it('cancelLesson fires the sync so the cancelled status reaches Google', async () => {
    const { cancelLesson } = await import('../services/lessonService');
    mockSyncLessonToGoogle.mockResolvedValue(undefined);

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: LESSON_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, instructor_id: INSTRUCTOR_ID, status: 'scheduled' }])
      ) // assertLessonReviewable -> getLessonById
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          status: 'cancelled',
          date: new Date('2026-09-23T00:00:00.000Z'),
          start_time: '13:00:00',
          end_time: '14:00:00',
        }])
      ) // the cancel UPDATE ... RETURNING
      .mockResolvedValueOnce(queryResult([{ email: null }])) // student email lookup
      .mockResolvedValueOnce(queryResult([{ email: null }])) // instructor email lookup
      .mockResolvedValueOnce(queryResult([])) // reminder cancellation UPDATE
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles', cancellation_fee_window_hours: 0, cancellation_fee_amount: 0 }])); // getTenantSettings (fee window check)

    await cancelLesson(LESSON_ID, TENANT_ID, 'user-1');

    expect(mockSyncLessonToGoogle).toHaveBeenCalledWith(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);
  });

  it('a reassignment (instructorId changed on update) removes the lesson from the OLD instructor\'s calendar and syncs it to the new one', async () => {
    const { updateLesson } = await import('../services/lessonService');
    mockSyncLessonToGoogle.mockResolvedValue(undefined);
    mockRemoveLessonEventFromInstructorCalendar.mockResolvedValue(undefined);

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          status: 'scheduled',
          date: new Date('2026-09-23T00:00:00.000Z'),
          start_time: '13:00:00',
          end_time: '14:00:00',
        }])
      ) // existing lesson lookup
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_B_ID }])) // new instructor check
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])); // resolveTimezone for conflict check

    mockValidateLessonBooking.mockResolvedValueOnce({ valid: true, conflicts: [] });

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: LESSON_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        instructor_id: INSTRUCTOR_B_ID,
        status: 'scheduled',
        date: new Date('2026-09-23T00:00:00.000Z'),
        start_time: '13:00:00',
        end_time: '14:00:00',
      }])
    ); // the UPDATE ... RETURNING

    await updateLesson(LESSON_ID, TENANT_ID, { instructorId: INSTRUCTOR_B_ID });

    expect(mockRemoveLessonEventFromInstructorCalendar).toHaveBeenCalledWith(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);
    expect(mockSyncLessonToGoogle).toHaveBeenCalledWith(LESSON_ID, INSTRUCTOR_B_ID, TENANT_ID);
  });

  it('a non-reassignment update (e.g. notes only) does not call removeLessonEventFromInstructorCalendar', async () => {
    const { updateLesson } = await import('../services/lessonService');
    mockSyncLessonToGoogle.mockResolvedValue(undefined);

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          status: 'scheduled',
          date: new Date('2026-09-23T00:00:00.000Z'),
          start_time: '13:00:00',
          end_time: '14:00:00',
        }])
      ) // existing lesson lookup
      .mockResolvedValueOnce(
        queryResult([{
          id: LESSON_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          instructor_id: INSTRUCTOR_ID,
          status: 'scheduled',
          notes: 'updated notes',
        }])
      ); // the UPDATE ... RETURNING (notes-only, no schedule fields touched)

    await updateLesson(LESSON_ID, TENANT_ID, { notes: 'updated notes' });

    expect(mockRemoveLessonEventFromInstructorCalendar).not.toHaveBeenCalled();
    expect(mockSyncLessonToGoogle).toHaveBeenCalledWith(LESSON_ID, INSTRUCTOR_ID, TENANT_ID);
  });
});
