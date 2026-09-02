import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockQuery,
  resetMockQuery,
  queryResult,
  mockGetClient,
  mockClientQuery,
  resetMockClient,
} from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery, getClient: mockGetClient }));

const TENANT_ID = 'tenant-abc';
const COHORT_ID = 'cohort-1';
const INSTRUCTOR_ID = 'instructor-1';

const FOUR_SESSIONS = [
  { curriculumDay: 1 as const, sessionDate: '2026-10-03' },
  { curriculumDay: 2 as const, sessionDate: '2026-10-04' },
  { curriculumDay: 3 as const, sessionDate: '2026-10-10' },
  { curriculumDay: 4 as const, sessionDate: '2026-10-11' },
];

describe('classroomService.createCohort', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects a cohort without exactly 4 sessions', async () => {
    const { createCohort } = await import('../services/classroomService');

    await expect(
      createCohort(TENANT_ID, {
        name: 'Fall Weekend',
        capacity: 20,
        sessions: FOUR_SESSIONS.slice(0, 3),
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a cohort whose sessions do not cover curriculum days 1-4 exactly once each', async () => {
    const { createCohort } = await import('../services/classroomService');

    const badSessions = [
      { curriculumDay: 1 as const, sessionDate: '2026-10-03' },
      { curriculumDay: 1 as const, sessionDate: '2026-10-04' },
      { curriculumDay: 3 as const, sessionDate: '2026-10-10' },
      { curriculumDay: 4 as const, sessionDate: '2026-10-11' },
    ];

    await expect(
      createCohort(TENANT_ID, { name: 'Fall Weekend', capacity: 20, sessions: badSessions })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a non-positive capacity', async () => {
    const { createCohort } = await import('../services/classroomService');

    await expect(
      createCohort(TENANT_ID, { name: 'Fall Weekend', capacity: 0, sessions: FOUR_SESSIONS })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a teacherInstructorId that is not flagged as a DE teacher', async () => {
    const { createCohort } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // teacher check finds nothing

    await expect(
      createCohort(TENANT_ID, {
        name: 'Fall Weekend',
        capacity: 20,
        teacherInstructorId: INSTRUCTOR_ID,
        sessions: FOUR_SESSIONS,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a cohort with its 4 sessions, sorted by curriculum day', async () => {
    const { createCohort } = await import('../services/classroomService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID }])) // teacher check passes
      .mockResolvedValueOnce(
        queryResult([{
          id: COHORT_ID, tenant_id: TENANT_ID, name: 'Fall Weekend',
          teacher_instructor_id: INSTRUCTOR_ID, capacity: 20, status: 'scheduled',
          created_by: null, created_at: '2026-09-01', updated_at: '2026-09-01',
        }])
      ) // cohort insert
      // 4 session inserts, in the order the loop iterates (1,2,3,4)
      .mockResolvedValueOnce(queryResult([{ id: 's1', tenant_id: TENANT_ID, cohort_id: COHORT_ID, curriculum_day: 1, session_date: '2026-10-03', start_time: '08:00', end_time: '14:00' }]))
      .mockResolvedValueOnce(queryResult([{ id: 's2', tenant_id: TENANT_ID, cohort_id: COHORT_ID, curriculum_day: 2, session_date: '2026-10-04', start_time: '08:00', end_time: '14:00' }]))
      .mockResolvedValueOnce(queryResult([{ id: 's3', tenant_id: TENANT_ID, cohort_id: COHORT_ID, curriculum_day: 3, session_date: '2026-10-10', start_time: '08:00', end_time: '14:00' }]))
      .mockResolvedValueOnce(queryResult([{ id: 's4', tenant_id: TENANT_ID, cohort_id: COHORT_ID, curriculum_day: 4, session_date: '2026-10-11', start_time: '08:00', end_time: '14:00' }]));

    const cohort = await createCohort(TENANT_ID, {
      name: 'Fall Weekend',
      capacity: 20,
      teacherInstructorId: INSTRUCTOR_ID,
      sessions: FOUR_SESSIONS,
    });

    expect(cohort.id).toBe(COHORT_ID);
    expect(cohort.sessions).toHaveLength(4);
    expect(cohort.sessions.map((s) => s.curriculumDay)).toEqual([1, 2, 3, 4]);
    expect(cohort.enrolledCount).toBe(0);
  });
});

describe('classroomService.getCohortAttendanceGaps', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('lists only students with at least one missing curriculum day, with the exact missing days', async () => {
    const { getCohortAttendanceGaps } = await import('../services/classroomService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: COHORT_ID, tenant_id: TENANT_ID, name: 'Fall Weekend',
          teacher_instructor_id: null, capacity: 20, status: 'cancelled',
          created_by: null, created_at: '2026-09-01', updated_at: '2026-09-01',
          enrolled_count: '2',
        }])
      ) // getCohortById's cohort query
      .mockResolvedValueOnce(queryResult(FOUR_SESSIONS.map((s, i) => ({
        id: `s${i + 1}`, tenant_id: TENANT_ID, cohort_id: COHORT_ID,
        curriculum_day: s.curriculumDay, session_date: s.sessionDate,
        start_time: '08:00', end_time: '14:00',
      })))) // getCohortById's sessions query
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: 'enr-1', student_id: 'stu-1', student_name: 'Leo Whitfield', attended_days: [1, 2] },
          { enrollment_id: 'enr-2', student_id: 'stu-2', student_name: 'Mia Torres', attended_days: [1, 2, 3, 4] },
        ])
      ); // the gap query itself

    const gaps = await getCohortAttendanceGaps(COHORT_ID, TENANT_ID);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].studentName).toBe('Leo Whitfield');
    expect(gaps[0].missingCurriculumDays).toEqual([3, 4]);
  });

  it('rejects an unknown cohort id (404)', async () => {
    const { getCohortAttendanceGaps } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // cohort not found

    await expect(getCohortAttendanceGaps('missing', TENANT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('classroomService.updateCohort', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects an update to a cohort that does not exist', async () => {
    const { updateCohort } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(
      updateCohort(COHORT_ID, TENANT_ID, { status: 'cancelled' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('persists a status change to cancelled', async () => {
    const { updateCohort } = await import('../services/classroomService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: COHORT_ID }])) // existence check
      .mockResolvedValueOnce(
        queryResult([{
          id: COHORT_ID, tenant_id: TENANT_ID, name: 'Fall Weekend',
          teacher_instructor_id: null, capacity: 20, status: 'cancelled',
          created_by: null, created_at: '2026-09-01', updated_at: '2026-09-02',
        }])
      ); // UPDATE ... RETURNING

    const cohort = await updateCohort(COHORT_ID, TENANT_ID, { status: 'cancelled' });

    expect(cohort.status).toBe('cancelled');
    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toMatch(/status = \$/);
    expect(params).toContain('cancelled');
  });
});

describe('classroomService.joinCohort', () => {
  const ENROLLMENT_ID = 'enrollment-1';

  beforeEach(() => {
    resetMockQuery();
    resetMockClient();
  });

  function mockCohortLookup(overrides: { status?: string; capacity?: number; enrolledCount?: string } = {}) {
    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: COHORT_ID, tenant_id: TENANT_ID, name: 'Fall Weekend',
          teacher_instructor_id: null, capacity: overrides.capacity ?? 20,
          status: overrides.status ?? 'scheduled',
          created_by: null, created_at: '2026-09-01', updated_at: '2026-09-01',
          enrolled_count: overrides.enrolledCount ?? '0',
        }])
      ) // getCohortById's cohort query
      .mockResolvedValueOnce(queryResult([])); // getCohortById's sessions query
  }

  it('rejects joining an unknown cohort (404) before ever opening a transaction', async () => {
    const { joinCohort } = await import('../services/classroomService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // cohort not found

    await expect(joinCohort(COHORT_ID, TENANT_ID, ENROLLMENT_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects joining a cancelled cohort before ever opening a transaction', async () => {
    const { joinCohort } = await import('../services/classroomService');

    mockCohortLookup({ status: 'cancelled' });

    await expect(joinCohort(COHORT_ID, TENANT_ID, ENROLLMENT_ID)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('rejects joining for a driver_training enrollment before ever opening a transaction', async () => {
    const { joinCohort } = await import('../services/classroomService');

    mockCohortLookup();
    mockQuery.mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_training' }]));

    await expect(joinCohort(COHORT_ID, TENANT_ID, ENROLLMENT_ID)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  // The capacity check is re-run INSIDE the transaction, against a row
  // locked with SELECT ... FOR UPDATE - this is what makes it race-safe,
  // unlike the old plain SELECT-then-INSERT this replaces.
  it('rejects joining a cohort at capacity, re-checked inside the locked transaction, and rolls back', async () => {
    const { joinCohort } = await import('../services/classroomService');

    mockCohortLookup({ capacity: 2 });
    mockQuery.mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_education' }]));

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ capacity: 2 }])) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce(queryResult([{ count: '2' }])) // COUNT(*) - already full
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(joinCohort(COHORT_ID, TENANT_ID, ENROLLMENT_ID)).rejects.toMatchObject({ statusCode: 400 });

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[1]).toMatch(/FOR UPDATE/);
    expect(clientCalls[clientCalls.length - 1]).toBe('ROLLBACK');
  });

  it('rejects when the enrollment already has a home cohort (409), checked inside the transaction, and rolls back', async () => {
    const { joinCohort } = await import('../services/classroomService');

    mockCohortLookup();
    mockQuery.mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_education' }]));

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ capacity: 20 }])) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce(queryResult([{ count: '0' }])) // COUNT(*)
      .mockResolvedValueOnce(queryResult([{ id: 'existing-membership' }])) // existing membership found
      .mockResolvedValueOnce(queryResult([])); // ROLLBACK

    await expect(joinCohort(COHORT_ID, TENANT_ID, ENROLLMENT_ID)).rejects.toMatchObject({ statusCode: 409 });

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[clientCalls.length - 1]).toBe('ROLLBACK');
  });

  it('joins the cohort successfully inside a committed transaction', async () => {
    const { joinCohort } = await import('../services/classroomService');

    mockCohortLookup();
    mockQuery.mockResolvedValueOnce(queryResult([{ id: ENROLLMENT_ID, program_type: 'driver_education' }]));

    mockClientQuery
      .mockResolvedValueOnce(queryResult([])) // BEGIN
      .mockResolvedValueOnce(queryResult([{ capacity: 20 }])) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce(queryResult([{ count: '0' }])) // COUNT(*)
      .mockResolvedValueOnce(queryResult([])) // no existing membership
      .mockResolvedValueOnce(
        queryResult([{ id: 'membership-1', tenant_id: TENANT_ID, cohort_id: COHORT_ID, enrollment_id: ENROLLMENT_ID, joined_at: '2026-09-01' }])
      ) // INSERT
      .mockResolvedValueOnce(queryResult([])); // COMMIT

    const membership = await joinCohort(COHORT_ID, TENANT_ID, ENROLLMENT_ID);

    expect(membership.cohortId).toBe(COHORT_ID);
    expect(membership.enrollmentId).toBe(ENROLLMENT_ID);

    const clientCalls = mockClientQuery.mock.calls.map(([sql]) => sql);
    expect(clientCalls[0]).toBe('BEGIN');
    expect(clientCalls[clientCalls.length - 1]).toBe('COMMIT');
  });
});

describe('classroomService.searchStudentsForRosterAdd', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  function mockTenantSettings(timezone = 'America/Los_Angeles') {
    mockQuery.mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, timezone }]));
  }

  it('returns status "none" for a student with no driver_education enrollment', async () => {
    const { searchStudentsForRosterAdd } = await import('../services/classroomService');

    mockTenantSettings();
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        student_id: 'student-1',
        student_name: 'Alex Adult',
        date_of_birth: '1990-01-01',
        enrollment_id: null,
        home_cohort_id: null,
        home_cohort_name: null,
      }])
    );

    const results = await searchStudentsForRosterAdd(TENANT_ID, COHORT_ID, 'Alex');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      studentId: 'student-1',
      status: 'none',
      enrollmentId: null,
      isMinor: false,
    });
  });

  it('returns status "joinable" for a driver_education enrollment with no home cohort yet', async () => {
    const { searchStudentsForRosterAdd } = await import('../services/classroomService');

    mockTenantSettings();
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        student_id: 'student-2',
        student_name: 'Jamie Minor',
        date_of_birth: '2010-01-01',
        enrollment_id: 'enrollment-2',
        home_cohort_id: null,
        home_cohort_name: null,
      }])
    );

    const results = await searchStudentsForRosterAdd(TENANT_ID, COHORT_ID, 'Jamie');

    expect(results[0]).toMatchObject({
      status: 'joinable',
      enrollmentId: 'enrollment-2',
      isMinor: true,
    });
  });

  it('returns status "this_cohort" when the student already belongs to the cohort being added to', async () => {
    const { searchStudentsForRosterAdd } = await import('../services/classroomService');

    mockTenantSettings();
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        student_id: 'student-3',
        student_name: 'Sam Same',
        date_of_birth: '1995-01-01',
        enrollment_id: 'enrollment-3',
        home_cohort_id: COHORT_ID,
        home_cohort_name: 'Fall Weekend',
      }])
    );

    const results = await searchStudentsForRosterAdd(TENANT_ID, COHORT_ID, 'Sam');

    expect(results[0]).toMatchObject({ status: 'this_cohort', otherCohortName: null });
  });

  it('returns status "other_cohort" with the other cohort\'s name when blocked', async () => {
    const { searchStudentsForRosterAdd } = await import('../services/classroomService');

    mockTenantSettings();
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        student_id: 'student-4',
        student_name: 'Robin Elsewhere',
        date_of_birth: '1998-01-01',
        enrollment_id: 'enrollment-4',
        home_cohort_id: 'cohort-other',
        home_cohort_name: 'Spring Weekday',
      }])
    );

    const results = await searchStudentsForRosterAdd(TENANT_ID, COHORT_ID, 'Robin');

    expect(results[0]).toMatchObject({ status: 'other_cohort', otherCohortName: 'Spring Weekday' });
  });
});
