/**
 * Classroom Service — driver education cohort/session scheduling.
 * Phase 3 of the compliance-records arc (docs/compliance-records-build-plan.md).
 *
 * A cohort is a scheduling container: 4 class sessions, one per curriculum
 * day (1-4, distinct material each), a teacher, and a capacity. Cohorts are
 * NOT tied to any one student and never gate completion - see
 * classroomAttendanceService.ts for the actual per-student, per-curriculum-
 * day completion source of truth.
 */

import { query, getClient } from '../config/database';
import { DeCohort, DeCohortSession } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone } from '../utils/tenantTime';
import { calculateAge } from './studentProgressService';

const logger = createLogger('ClassroomService');

export interface CreateCohortSessionInput {
  curriculumDay: 1 | 2 | 3 | 4;
  sessionDate: string; // YYYY-MM-DD
  startTime?: string; // HH:MM, defaults to 08:00
  endTime?: string; // HH:MM, defaults to 14:00
}

export interface CreateCohortInput {
  name: string;
  teacherInstructorId?: string | null;
  capacity: number;
  sessions: CreateCohortSessionInput[]; // Exactly 4, one per curriculum day 1-4
}

export interface CohortWithSessions extends DeCohort {
  sessions: DeCohortSession[];
  enrolledCount: number;
}

function validateSessions(sessions: CreateCohortSessionInput[]): void {
  if (sessions.length !== 4) {
    throw new AppError('A cohort must have exactly 4 sessions, one per curriculum day (1-4)', 400);
  }
  const days = sessions.map((s) => s.curriculumDay).sort();
  if (JSON.stringify(days) !== JSON.stringify([1, 2, 3, 4])) {
    throw new AppError('Cohort sessions must cover curriculum days 1, 2, 3, and 4 exactly once each', 400);
  }
}

export const createCohort = async (
  tenantId: string,
  data: CreateCohortInput,
  userId?: string
): Promise<CohortWithSessions> => {
  logger.info('Creating driver education cohort', { tenantId, name: data.name });

  if (!data.capacity || data.capacity <= 0) {
    throw new AppError('Capacity must be a positive number', 400);
  }
  validateSessions(data.sessions);

  if (data.teacherInstructorId) {
    const teacherCheck = await query(
      `SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2 AND is_de_teacher = true`,
      [data.teacherInstructorId, tenantId]
    );
    if (teacherCheck.rows.length === 0) {
      throw new AppError('teacherInstructorId must be an existing instructor flagged as a DE teacher', 400);
    }
  }

  const cohortResult = await query(
    `INSERT INTO de_cohorts (tenant_id, name, teacher_instructor_id, capacity, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tenantId, data.name, data.teacherInstructorId || null, data.capacity, userId || null]
  );
  const cohort = keysToCamel(cohortResult.rows[0]) as DeCohort;

  const sessions: DeCohortSession[] = [];
  for (const session of data.sessions) {
    const sessionResult = await query(
      `INSERT INTO de_cohort_sessions (tenant_id, cohort_id, curriculum_day, session_date, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        tenantId,
        cohort.id,
        session.curriculumDay,
        session.sessionDate,
        session.startTime || '08:00',
        session.endTime || '14:00',
      ]
    );
    sessions.push(keysToCamel(sessionResult.rows[0]) as DeCohortSession);
  }

  sessions.sort((a, b) => a.curriculumDay - b.curriculumDay);

  logger.info('Successfully created cohort', { tenantId, cohortId: cohort.id });
  return { ...cohort, sessions, enrolledCount: 0 };
};

export const getCohorts = async (tenantId: string): Promise<CohortWithSessions[]> => {
  const cohortsResult = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM de_cohort_enrollments dce WHERE dce.cohort_id = c.id) AS enrolled_count
     FROM de_cohorts c
     WHERE c.tenant_id = $1
     ORDER BY c.created_at DESC`,
    [tenantId]
  );

  if (cohortsResult.rows.length === 0) {
    return [];
  }

  const cohortIds = cohortsResult.rows.map((row: Record<string, unknown>) => row.id);
  const sessionsResult = await query(
    `SELECT * FROM de_cohort_sessions WHERE cohort_id = ANY($1::uuid[]) ORDER BY curriculum_day ASC`,
    [cohortIds]
  );

  const sessionsByCohort = new Map<string, DeCohortSession[]>();
  for (const row of sessionsResult.rows) {
    const session = keysToCamel(row) as DeCohortSession;
    const list = sessionsByCohort.get(session.cohortId) || [];
    list.push(session);
    sessionsByCohort.set(session.cohortId, list);
  }

  return cohortsResult.rows.map((row: Record<string, unknown>) => {
    const cohort = keysToCamel(row) as DeCohort;
    return {
      ...cohort,
      enrolledCount: parseInt(String(row.enrolled_count), 10),
      sessions: sessionsByCohort.get(cohort.id) || [],
    };
  });
};

export const getCohortById = async (
  cohortId: string,
  tenantId: string
): Promise<CohortWithSessions | null> => {
  const cohortResult = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM de_cohort_enrollments dce WHERE dce.cohort_id = c.id) AS enrolled_count
     FROM de_cohorts c
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [cohortId, tenantId]
  );

  if (cohortResult.rows.length === 0) {
    return null;
  }

  const row = cohortResult.rows[0] as Record<string, unknown>;
  const cohort = keysToCamel(row) as DeCohort;

  const sessionsResult = await query(
    `SELECT * FROM de_cohort_sessions WHERE cohort_id = $1 ORDER BY curriculum_day ASC`,
    [cohortId]
  );

  return {
    ...cohort,
    enrolledCount: parseInt(String(row.enrolled_count), 10),
    sessions: sessionsResult.rows.map((r: Record<string, unknown>) => keysToCamel(r)) as DeCohortSession[],
  };
};

export interface UpdateCohortInput {
  name?: string;
  teacherInstructorId?: string | null;
  capacity?: number;
  status?: 'scheduled' | 'completed' | 'cancelled';
}

export const updateCohort = async (
  cohortId: string,
  tenantId: string,
  data: UpdateCohortInput
): Promise<DeCohort> => {
  const existing = await query(`SELECT id FROM de_cohorts WHERE id = $1 AND tenant_id = $2`, [cohortId, tenantId]);
  if (existing.rows.length === 0) {
    throw new AppError('Cohort not found', 404);
  }

  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.teacherInstructorId !== undefined) {
    if (data.teacherInstructorId) {
      const teacherCheck = await query(
        `SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2 AND is_de_teacher = true`,
        [data.teacherInstructorId, tenantId]
      );
      if (teacherCheck.rows.length === 0) {
        throw new AppError('teacherInstructorId must be an existing instructor flagged as a DE teacher', 400);
      }
    }
    fields.push(`teacher_instructor_id = $${paramCount++}`);
    values.push(data.teacherInstructorId);
  }
  if (data.capacity !== undefined) {
    if (data.capacity <= 0) {
      throw new AppError('Capacity must be a positive number', 400);
    }
    fields.push(`capacity = $${paramCount++}`);
    values.push(data.capacity);
  }
  if (data.status !== undefined) {
    if (!['scheduled', 'completed', 'cancelled'].includes(data.status)) {
      throw new AppError('Invalid status', 400);
    }
    fields.push(`status = $${paramCount++}`);
    values.push(data.status);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  fields.push(`updated_at = now()`);
  values.push(cohortId);
  values.push(tenantId);

  const result = await query(
    `UPDATE de_cohorts SET ${fields.join(', ')} WHERE id = $${paramCount++} AND tenant_id = $${paramCount} RETURNING *`,
    values
  );

  return keysToCamel(result.rows[0]) as DeCohort;
};

/**
 * For a cancelled cohort (or any cohort, on request): the students enrolled
 * in it (de_cohort_enrollments) who still have curriculum days unattended.
 * Re-slotting them uses the identical cross-cohort day-assignment flow as
 * any other make-up (classroomAttendanceService.recordAttendance) - this
 * only surfaces the gap, it doesn't move anyone.
 */
export interface CohortGapEntry {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  missingCurriculumDays: number[];
}

export const getCohortAttendanceGaps = async (
  cohortId: string,
  tenantId: string
): Promise<CohortGapEntry[]> => {
  const cohort = await getCohortById(cohortId, tenantId);
  if (!cohort) {
    throw new AppError('Cohort not found', 404);
  }

  const result = await query(
    `SELECT
       dce.enrollment_id,
       e.student_id,
       s.full_name AS student_name,
       COALESCE(
         array_agg(DISTINCT cs.curriculum_day) FILTER (WHERE cs.curriculum_day IS NOT NULL),
         ARRAY[]::smallint[]
       ) AS attended_days
     FROM de_cohort_enrollments dce
     JOIN enrollments e ON e.id = dce.enrollment_id
     JOIN students s ON s.id = e.student_id
     LEFT JOIN de_attendance a ON a.enrollment_id = dce.enrollment_id AND a.present = true
     LEFT JOIN de_cohort_sessions cs ON cs.id = a.session_id
     WHERE dce.cohort_id = $1 AND dce.tenant_id = $2
     GROUP BY dce.enrollment_id, e.student_id, s.full_name`,
    [cohortId, tenantId]
  );

  const ALL_DAYS = [1, 2, 3, 4];
  return result.rows
    .map((row: { enrollment_id: string; student_id: string; student_name: string; attended_days: number[] }) => {
      const attended: number[] = (row.attended_days || []).map((d: number) => Number(d));
      const missing = ALL_DAYS.filter((d) => !attended.includes(d));
      return {
        enrollmentId: row.enrollment_id,
        studentId: row.student_id,
        studentName: row.student_name,
        missingCurriculumDays: missing,
      };
    })
    .filter((entry: CohortGapEntry) => entry.missingCurriculumDays.length > 0);
};

/**
 * Joins a student's driver_education enrollment to a cohort as their home
 * cohort - the SINGLE join path every entry point uses (the student
 * modal's enrollment flow, the Classroom roster's "Add student" panel,
 * and the new-student-then-enroll shortcut all call this one function -
 * no duplicated enrollment logic, no second capacity check anywhere
 * else). A student has exactly ONE home cohort (DB-level UNIQUE on
 * enrollment_id) - this is not the same as attending a session;
 * attendance (including make-ups at other cohorts) is tracked separately
 * in de_attendance and is never gated by cohort membership.
 *
 * Capacity is enforced RACE-SAFELY: the cheap pre-checks below (cohort
 * exists/not cancelled, enrollment exists/right program type) run
 * outside a transaction for a fast, clean error on the common failure
 * paths, but the capacity count and the insert both happen inside one
 * transaction with `SELECT ... FOR UPDATE` locking the cohort row -
 * without that lock, two concurrent joins at exactly-at-capacity could
 * both read "1 spot left" and both insert, overfilling the cohort (the
 * plain SELECT-then-INSERT this replaces had exactly that gap). Locking
 * only the one `de_cohorts` row means concurrent joins to DIFFERENT
 * cohorts are never blocked by each other.
 */
export const joinCohort = async (
  cohortId: string,
  tenantId: string,
  enrollmentId: string
): Promise<{ id: string; cohortId: string; enrollmentId: string; joinedAt: Date }> => {
  if (!enrollmentId) {
    throw new AppError('enrollmentId is required', 400);
  }

  const cohort = await getCohortById(cohortId, tenantId);
  if (!cohort) {
    throw new AppError('Cohort not found', 404);
  }
  if (cohort.status === 'cancelled') {
    throw new AppError('Cannot join a cancelled cohort', 400);
  }

  const enrollmentResult = await query(
    `SELECT id, program_type FROM enrollments WHERE id = $1 AND tenant_id = $2`,
    [enrollmentId, tenantId]
  );
  if (enrollmentResult.rows.length === 0) {
    throw new AppError('Enrollment not found', 404);
  }
  if (enrollmentResult.rows[0].program_type !== 'driver_education') {
    throw new AppError('Only a driver_education enrollment can join a cohort', 400);
  }

  logger.info('Joining cohort', { tenantId, cohortId, enrollmentId });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Locks this cohort's row for the duration of the transaction - a
    // concurrent joinCohort call for the SAME cohort blocks here until
    // this transaction commits or rolls back, so the capacity count
    // below is never stale by the time the insert runs.
    const lockedCohort = await client.query(
      `SELECT capacity FROM de_cohorts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [cohortId, tenantId]
    );
    if (lockedCohort.rows.length === 0) {
      throw new AppError('Cohort not found', 404);
    }
    const capacity = lockedCohort.rows[0].capacity;

    const countResult = await client.query(
      `SELECT COUNT(*) FROM de_cohort_enrollments WHERE cohort_id = $1`,
      [cohortId]
    );
    const enrolledCount = parseInt(countResult.rows[0].count, 10);
    if (enrolledCount >= capacity) {
      throw new AppError('This cohort is at capacity', 400);
    }

    const existingMembership = await client.query(
      `SELECT id FROM de_cohort_enrollments WHERE enrollment_id = $1 AND tenant_id = $2`,
      [enrollmentId, tenantId]
    );
    if (existingMembership.rows.length > 0) {
      throw new AppError('This enrollment already has a home cohort', 409);
    }

    const result = await client.query(
      `INSERT INTO de_cohort_enrollments (tenant_id, cohort_id, enrollment_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenantId, cohortId, enrollmentId]
    );

    await client.query('COMMIT');
    return keysToCamel(result.rows[0]) as { id: string; cohortId: string; enrollmentId: string; joinedAt: Date };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export interface RosterAddCandidate {
  studentId: string;
  studentName: string;
  age: number | null;
  isMinor: boolean;
  // 'none': no driver_education enrollment yet - addable, joinCohort will
  // create the enrollment's cohort membership implicitly via the caller
  // creating the enrollment first (see the "New student" shortcut) - for
  // an EXISTING student with no DE enrollment, the panel still can't add
  // them via joinCohort alone (it requires an enrollmentId); this state
  // exists so the UI can offer the right action rather than a bad request.
  // 'this_cohort': already a member of the cohort being added to.
  // 'other_cohort': already has a home cohort elsewhere - block-and-inform.
  // 'joinable': has a driver_education enrollment with no home cohort yet.
  enrollmentId: string | null;
  status: 'none' | 'joinable' | 'this_cohort' | 'other_cohort';
  otherCohortName: string | null;
}

/**
 * Searches the tenant's students (by name or email) for the Classroom
 * roster's "Add student" panel - the "Existing student" tab. Unlike
 * classroomAttendanceService.searchMakeUpCandidates (which only searches
 * students who ALREADY have a driver_education enrollment, for the
 * single-session make-up picker), this searches ALL tenant students,
 * because a student with no DE enrollment yet is still a valid, common
 * result here (status: 'none') - the panel's job is to enroll them, not
 * just to record attendance for an enrollment that already exists.
 *
 * Each result carries exactly what the roster's "Add to class" action
 * needs to decide what to do: age/isMinor for DE-relevant context, and a
 * status distinguishing the three membership cases from the spec -
 * 'this_cohort' (disabled, already here), 'other_cohort' (blocked, with
 * the other cohort's name so the UI can say which one), 'joinable'
 * (addable now via joinCohort), or 'none' (no driver_education enrollment
 * at all yet - addable only via the "New student"-shortcut path, which
 * creates the enrollment and joins in one guided flow).
 */
export const searchStudentsForRosterAdd = async (
  tenantId: string,
  cohortId: string,
  search: string
): Promise<RosterAddCandidate[]> => {
  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);

  const result = await query(
    `SELECT
       s.id AS student_id,
       s.full_name AS student_name,
       s.date_of_birth,
       e.id AS enrollment_id,
       dce.cohort_id AS home_cohort_id,
       c.name AS home_cohort_name
     FROM students s
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.tenant_id = s.tenant_id AND e.program_type = 'driver_education'
     LEFT JOIN de_cohort_enrollments dce ON dce.enrollment_id = e.id AND dce.tenant_id = s.tenant_id
     LEFT JOIN de_cohorts c ON c.id = dce.cohort_id
     WHERE s.tenant_id = $1
       AND (s.full_name ILIKE $2 OR s.email ILIKE $2)
     ORDER BY s.full_name ASC
     LIMIT 10`,
    [tenantId, `%${search}%`]
  );

  return result.rows.map((row: {
    student_id: string;
    student_name: string;
    date_of_birth: string | null;
    enrollment_id: string | null;
    home_cohort_id: string | null;
    home_cohort_name: string | null;
  }) => {
    const age = calculateAge(row.date_of_birth, timezone);
    const isMinor = age === null || age < 18;

    let status: RosterAddCandidate['status'];
    let otherCohortName: string | null = null;
    if (!row.enrollment_id) {
      status = 'none';
    } else if (!row.home_cohort_id) {
      status = 'joinable';
    } else if (row.home_cohort_id === cohortId) {
      status = 'this_cohort';
    } else {
      status = 'other_cohort';
      otherCohortName = row.home_cohort_name;
    }

    return {
      studentId: row.student_id,
      studentName: row.student_name,
      age,
      isMinor,
      enrollmentId: row.enrollment_id,
      status,
      otherCohortName,
    };
  });
};
