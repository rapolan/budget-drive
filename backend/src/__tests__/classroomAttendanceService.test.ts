import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const SESSION_ID = 'session-1';
const ENROLLMENT_ID = 'enrollment-1';
const COHORT_ID = 'cohort-1';

describe('classroomAttendanceService.recordAttendance', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects an unknown session (404)', async () => {
    const { recordAttendance } = await import('../services/classroomAttendanceService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(
      recordAttendance(SESSION_ID, TENANT_ID, { enrollmentId: ENROLLMENT_ID, present: true })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects an unknown enrollment (404)', async () => {
    const { recordAttendance } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: SESSION_ID, cohort_id: COHORT_ID, curriculum_day: 2 }]))
      .mockResolvedValueOnce(queryResult([]));

    await expect(
      recordAttendance(SESSION_ID, TENANT_ID, { enrollmentId: ENROLLMENT_ID, present: true })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects marking attendance for a driver_training enrollment', async () => {
    const { recordAttendance } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: SESSION_ID, cohort_id: COHORT_ID, curriculum_day: 2 }]))
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_training' }]));

    await expect(
      recordAttendance(SESSION_ID, TENANT_ID, { enrollmentId: ENROLLMENT_ID, present: true })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // The core cross-cohort invariant: a student can't be present at the
  // SAME curriculum day twice, whether at this cohort or a different one -
  // checked by curriculum_day, not session_id, so it catches make-up
  // double-booking across cohorts too.
  it('rejects marking present when the student is already present for this curriculum day at a DIFFERENT session', async () => {
    const { recordAttendance } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: SESSION_ID, cohort_id: COHORT_ID, curriculum_day: 2 }]))
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_education' }]))
      .mockResolvedValueOnce(queryResult([{ id: 'other-attendance-row' }])); // duplicate-day check finds one

    await expect(
      recordAttendance(SESSION_ID, TENANT_ID, { enrollmentId: ENROLLMENT_ID, present: true })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('records present attendance and upserts on conflict', async () => {
    const { recordAttendance } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: SESSION_ID, cohort_id: COHORT_ID, curriculum_day: 2 }]))
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_education' }]))
      .mockResolvedValueOnce(queryResult([])) // no duplicate-day conflict
      .mockResolvedValueOnce(queryResult([{ id: 'attendance-1' }])); // INSERT ... ON CONFLICT

    await recordAttendance(SESSION_ID, TENANT_ID, { enrollmentId: ENROLLMENT_ID, present: true }, 'user-1');

    const [sql, params] = mockQuery.mock.calls[3];
    expect(sql).toMatch(/ON CONFLICT \(enrollment_id, session_id\)/);
    expect(params).toContain(true);
  });

  it('allows marking absent even if another curriculum day is already attended elsewhere (no duplicate-day check runs for absent)', async () => {
    const { recordAttendance } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: SESSION_ID, cohort_id: COHORT_ID, curriculum_day: 2 }]))
      .mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_education' }]))
      .mockResolvedValueOnce(queryResult([{ id: 'upsert-row' }])); // INSERT ... ON CONFLICT (present=false skips the duplicate-day check)

    await recordAttendance(SESSION_ID, TENANT_ID, { enrollmentId: ENROLLMENT_ID, present: false }, 'user-1');

    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});

describe('classroomAttendanceService.getClassroomAttendanceSummary', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('reports isComplete only once all 4 distinct curriculum days are attended', async () => {
    const { getClassroomAttendanceSummary } = await import('../services/classroomAttendanceService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ curriculum_day: 1 }, { curriculum_day: 2 }, { curriculum_day: 4 }])
    );

    const summary = await getClassroomAttendanceSummary(ENROLLMENT_ID, TENANT_ID);

    expect(summary.attendedCurriculumDays).toEqual([1, 2, 4]);
    expect(summary.isComplete).toBe(false);
  });

  it('reports isComplete true with all 4 days present', async () => {
    const { getClassroomAttendanceSummary } = await import('../services/classroomAttendanceService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ curriculum_day: 1 }, { curriculum_day: 2 }, { curriculum_day: 3 }, { curriculum_day: 4 }])
    );

    const summary = await getClassroomAttendanceSummary(ENROLLMENT_ID, TENANT_ID);

    expect(summary.isComplete).toBe(true);
  });
});

describe('classroomAttendanceService.getSessionRoster', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects an unknown session (404)', async () => {
    const { getSessionRoster } = await import('../services/classroomAttendanceService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(getSessionRoster(SESSION_ID, TENANT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns the roster including a make-up guest marked isHomeCohort=false', async () => {
    const { getSessionRoster } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: SESSION_ID, cohort_id: COHORT_ID }]))
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: 'enr-home', student_id: 'stu-1', student_name: 'Leo Whitfield', is_home_cohort: true, present: true },
          { enrollment_id: 'enr-guest', student_id: 'stu-2', student_name: 'Mia Torres', is_home_cohort: false, present: true },
        ])
      );

    const roster = await getSessionRoster(SESSION_ID, TENANT_ID);

    expect(roster).toHaveLength(2);
    expect(roster.find((r) => r.enrollmentId === 'enr-guest')?.isHomeCohort).toBe(false);
  });
});
