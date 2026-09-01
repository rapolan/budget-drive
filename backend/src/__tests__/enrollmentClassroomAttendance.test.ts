import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';

/**
 * A classroom driver_education enrollment has no lesson-derived progress -
 * its completion signal is per-curriculum-day attendance instead, attached
 * the same way progress/paymentSummary already are. This must never be
 * scoped to one cohort's sessions - the whole point of the make-up model
 * is that attendance from ANY cohort counts.
 */
describe('enrollmentService.getEnrollmentsForStudent - classroomAttendance', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('attaches classroomAttendance for a classroom driver_education enrollment', async () => {
    const { getEnrollmentsForStudent } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_education',
          de_delivery_mode: 'classroom',
          status: 'active',
          hours_required: 30,
          completed: false,
          completed_at: null,
          completion_reason: null,
          track_override: null,
        }])
      ) // enrollments for student
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // lessons for enrollment
      .mockResolvedValueOnce(queryResult([])) // payments for enrollment
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 3 },
        ])
      ); // classroom attendance summaries batch query

    const enrollments = await getEnrollmentsForStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: null });

    expect(enrollments[0].classroomAttendance).toEqual({
      attendedCurriculumDays: [1, 3],
      isComplete: false,
    });
  });

  it('does not attach classroomAttendance for online driver_education (no attendance concept)', async () => {
    const { getEnrollmentsForStudent } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_education',
          de_delivery_mode: 'online',
          status: 'active',
          hours_required: 30,
          completed: false,
          completed_at: null,
          completion_reason: null,
          track_override: null,
          manual_completed_hours: 10,
        }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));
    // No 5th mock needed - getClassroomAttendanceSummaries should not even
    // be called since the enrollmentIds filter excludes non-classroom rows.

    const enrollments = await getEnrollmentsForStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: null });

    expect(enrollments[0].classroomAttendance).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('does not attach classroomAttendance for driver_training', async () => {
    const { getEnrollmentsForStudent } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_training',
          status: 'active',
          hours_required: 6,
          completed: false,
          completed_at: null,
          completion_reason: null,
          track_override: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    const enrollments = await getEnrollmentsForStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: null });

    expect(enrollments[0].classroomAttendance).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it('reports isComplete true once all 4 curriculum days are attended', async () => {
    const { getEnrollmentsForStudent } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          program_type: 'driver_education',
          de_delivery_mode: 'classroom',
          status: 'active',
          hours_required: 30,
          completed: false,
          completed_at: null,
          completion_reason: null,
          track_override: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, standard_lesson_length_minutes: 120 }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 3 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 4 },
        ])
      );

    const enrollments = await getEnrollmentsForStudent(STUDENT_ID, TENANT_ID, { dateOfBirth: null });

    expect(enrollments[0].classroomAttendance?.isComplete).toBe(true);
  });
});
