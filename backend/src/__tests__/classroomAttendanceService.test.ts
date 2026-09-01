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

describe('classroomAttendanceService.getCohortRoster', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects an unknown cohort (404 - no sessions found)', async () => {
    const { getCohortRoster } = await import('../services/classroomAttendanceService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // sessions query finds nothing

    await expect(getCohortRoster(COHORT_ID, TENANT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns sessions and an empty student list when nobody is enrolled', async () => {
    const { getCohortRoster } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([
          { id: 's1', curriculum_day: 1, session_date: '2026-10-03' },
          { id: 's2', curriculum_day: 2, session_date: '2026-10-04' },
          { id: 's3', curriculum_day: 3, session_date: '2026-10-10' },
          { id: 's4', curriculum_day: 4, session_date: '2026-10-11' },
        ])
      ) // sessions
      .mockResolvedValueOnce(queryResult([])); // students union query

    const roster = await getCohortRoster(COHORT_ID, TENANT_ID);

    expect(roster.sessions).toHaveLength(4);
    expect(roster.students).toEqual([]);
  });

  it('marks a make-up guest attendance entry and computes cohort-agnostic completion', async () => {
    const { getCohortRoster } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([
          { id: 's1', curriculum_day: 1, session_date: '2026-10-03' },
          { id: 's2', curriculum_day: 2, session_date: '2026-10-04' },
          { id: 's3', curriculum_day: 3, session_date: '2026-10-10' },
          { id: 's4', curriculum_day: 4, session_date: '2026-10-11' },
        ])
      ) // sessions
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: 'enr-home', student_id: 'stu-1', student_name: 'Leo Whitfield' },
          { enrollment_id: 'enr-guest', student_id: 'stu-2', student_name: 'Mia Torres' },
        ])
      ) // students union
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: 'enr-home', session_id: 's1', present: true, is_home_cohort: true },
          { enrollment_id: 'enr-guest', session_id: 's3', present: true, is_home_cohort: false },
        ])
      ) // per-session attendance for these 4 sessions
      .mockResolvedValueOnce(
        queryResult([
          { enrollment_id: 'enr-home', curriculum_day: 1 },
          { enrollment_id: 'enr-guest', curriculum_day: 3 },
          { enrollment_id: 'enr-guest', curriculum_day: 4 }, // attended elsewhere, still counts
        ])
      ); // cohort-agnostic completion query

    const roster = await getCohortRoster(COHORT_ID, TENANT_ID);

    const guest = roster.students.find((s) => s.enrollmentId === 'enr-guest');
    expect(guest?.attendance['s3']).toEqual({ present: true, isHomeCohort: false });
    expect(guest?.attendance['s1']).toEqual({ present: false, isHomeCohort: true }); // default, never marked here
    expect(guest?.attendedCurriculumDayCount).toBe(2); // day 3 (this cohort) + day 4 (elsewhere)
    expect(guest?.missingCurriculumDays).toEqual([1, 2]);

    const home = roster.students.find((s) => s.enrollmentId === 'enr-home');
    expect(home?.attendedCurriculumDayCount).toBe(1);
    expect(home?.missingCurriculumDays).toEqual([2, 3, 4]);
  });

  // Regression: found via live verification, not this mock layer. Postgres
  // evaluates `dce.cohort_id = $1` as SQL NULL (not false) when the LEFT
  // JOIN finds no de_cohort_enrollments row at all (a student with no home
  // cohort anywhere, not just a different one) - the pg driver then
  // deserializes that NULL as JS null, not false. The query must COALESCE
  // it to false so this student still reads as a make-up guest rather than
  // silently defaulting to isHomeCohort: true on the frontend.
  it('normalizes a NULL is_home_cohort (no home cohort at all) to false, not null', async () => {
    const { getCohortRoster } = await import('../services/classroomAttendanceService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([
          { id: 's1', curriculum_day: 1, session_date: '2026-10-03' },
          { id: 's2', curriculum_day: 2, session_date: '2026-10-04' },
          { id: 's3', curriculum_day: 3, session_date: '2026-10-10' },
          { id: 's4', curriculum_day: 4, session_date: '2026-10-11' },
        ])
      )
      .mockResolvedValueOnce(queryResult([{ enrollment_id: 'enr-no-home', student_id: 'stu-3', student_name: 'Owen Castillo' }]))
      // Postgres itself returns false here (COALESCE applied in the SQL) -
      // this pins that the service must not undo that with `?? true`
      // logic on its own side.
      .mockResolvedValueOnce(queryResult([{ enrollment_id: 'enr-no-home', session_id: 's2', present: true, is_home_cohort: false }]))
      .mockResolvedValueOnce(queryResult([{ enrollment_id: 'enr-no-home', curriculum_day: 2 }]));

    const roster = await getCohortRoster(COHORT_ID, TENANT_ID);

    expect(roster.students[0].attendance['s2']).toEqual({ present: true, isHomeCohort: false });
  });
});

describe('classroomAttendanceService.searchMakeUpCandidates', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('excludes students already on this session\'s roster', async () => {
    const { searchMakeUpCandidates } = await import('../services/classroomAttendanceService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ enrollment_id: 'enr-3', student_id: 'stu-3', student_name: 'Owen Castillo' }])
    );

    const candidates = await searchMakeUpCandidates(TENANT_ID, 'Owen', ['enr-1', 'enr-2']);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].studentName).toBe('Owen Castillo');

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/program_type = 'driver_education'/);
    expect(params).toContain(TENANT_ID);
    expect(params).toContainEqual(['enr-1', 'enr-2']);
  });

  it('uses a sentinel UUID when no enrollments to exclude, so the NOT ANY clause stays valid SQL', async () => {
    const { searchMakeUpCandidates } = await import('../services/classroomAttendanceService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await searchMakeUpCandidates(TENANT_ID, '', []);

    const [, params] = mockQuery.mock.calls[0];
    expect(params[2]).toEqual(['00000000-0000-0000-0000-000000000000']);
  });
});
