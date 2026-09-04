import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';
const STUDENT_ID_2 = 'student-2';
const ENROLLMENT_ID = 'enrollment-1';

/**
 * getDeEnrollmentsBatch is the program-aware Students list's DE data
 * source (docs/ARCHITECTURE.md's Students-page section) - batched by
 * student id, and it must reuse getClassroomAttendanceSummaries rather
 * than recompute completion, since that's the exact source
 * EnrollmentSubPanel/the Classroom roster already read.
 */
describe('enrollmentService.getDeEnrollmentsBatch', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns an empty map without querying when given no student ids', async () => {
    const { getDeEnrollmentsBatch } = await import('../services/enrollmentService');

    const result = await getDeEnrollmentsBatch([], TENANT_ID);

    expect(result.size).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns an empty map for a student with no DE enrollment', async () => {
    const { getDeEnrollmentsBatch } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // DE enrollments batch - none

    const result = await getDeEnrollmentsBatch([STUDENT_ID], TENANT_ID);

    expect(result.get(STUDENT_ID)).toBeUndefined();
    // getClassroomAttendanceSummaries short-circuits on an empty id list -
    // no second query when there's nothing to look up.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('attaches classroomAttendance and cohortName for a classroom DE enrollment', async () => {
    const { getDeEnrollmentsBatch } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          student_id: STUDENT_ID,
          status: 'active',
          completed: false,
          de_delivery_mode: 'classroom',
          manual_completed_hours: null,
          cohort_name: 'Fall Weekend Class',
        }])
      ) // DE enrollments batch
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
        ])
      ); // classroom attendance summaries batch

    const result = await getDeEnrollmentsBatch([STUDENT_ID], TENANT_ID);

    expect(result.get(STUDENT_ID)).toEqual({
      id: ENROLLMENT_ID,
      status: 'active',
      completed: false,
      deDeliveryMode: 'classroom',
      manualCompletedHours: null,
      classroomAttendance: { attendedCurriculumDays: [1, 2], isComplete: false },
      cohortName: 'Fall Weekend Class',
    });
  });

  it('does not call getClassroomAttendanceSummaries for an online DE enrollment, and reports manualCompletedHours', async () => {
    const { getDeEnrollmentsBatch } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        status: 'active',
        completed: false,
        de_delivery_mode: 'online',
        manual_completed_hours: '18',
        cohort_name: null,
      }])
    ); // DE enrollments batch - no classroom rows, so no attendance query follows

    const result = await getDeEnrollmentsBatch([STUDENT_ID], TENANT_ID);

    expect(result.get(STUDENT_ID)).toEqual({
      id: ENROLLMENT_ID,
      status: 'active',
      completed: false,
      deDeliveryMode: 'online',
      manualCompletedHours: 18,
      classroomAttendance: undefined,
      cohortName: null,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('reports a completed classroom DE enrollment via the same attendance-derived isComplete signal', async () => {
    const { getDeEnrollmentsBatch } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          student_id: STUDENT_ID,
          status: 'active',
          completed: true,
          de_delivery_mode: 'classroom',
          manual_completed_hours: null,
          cohort_name: 'Fall Weekend Class',
        }])
      )
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 2 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 3 },
          { enrollment_id: ENROLLMENT_ID, curriculum_day: 4 },
        ])
      );

    const result = await getDeEnrollmentsBatch([STUDENT_ID], TENANT_ID);

    expect(result.get(STUDENT_ID)?.completed).toBe(true);
    expect(result.get(STUDENT_ID)?.classroomAttendance?.isComplete).toBe(true);
  });

  it('batches multiple students in one call - one row per student with a DE enrollment', async () => {
    const { getDeEnrollmentsBatch } = await import('../services/enrollmentService');
    const ENROLLMENT_ID_2 = 'enrollment-2';

    mockQuery
      .mockResolvedValueOnce(
        queryResult([
          {
            id: ENROLLMENT_ID,
            student_id: STUDENT_ID,
            status: 'active',
            completed: false,
            de_delivery_mode: 'online',
            manual_completed_hours: '5',
            cohort_name: null,
          },
          {
            id: ENROLLMENT_ID_2,
            student_id: STUDENT_ID_2,
            status: 'completed',
            completed: true,
            de_delivery_mode: 'classroom',
            manual_completed_hours: null,
            cohort_name: 'Spring Class',
          },
        ])
      )
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: ENROLLMENT_ID_2, curriculum_day: 1 },
          { enrollment_id: ENROLLMENT_ID_2, curriculum_day: 2 },
          { enrollment_id: ENROLLMENT_ID_2, curriculum_day: 3 },
          { enrollment_id: ENROLLMENT_ID_2, curriculum_day: 4 },
        ])
      );

    const result = await getDeEnrollmentsBatch([STUDENT_ID, STUDENT_ID_2], TENANT_ID);

    expect(result.size).toBe(2);
    expect(result.get(STUDENT_ID)?.deDeliveryMode).toBe('online');
    expect(result.get(STUDENT_ID_2)?.classroomAttendance?.isComplete).toBe(true);
  });
});
