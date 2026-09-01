/**
 * Classroom Attendance Service — the completion source of truth for
 * classroom driver education (Phase 3 of the compliance-records arc).
 *
 * A de_attendance row is a fact about (enrollment_id, session_id): which
 * specific session (any cohort's) a student attended. Completion is NEVER
 * a per-cohort flag - it's computed by counting DISTINCT curriculum_day
 * values across every present=true row for an enrollment, regardless of
 * which cohort each session belongs to. This is what makes a cross-cohort
 * make-up (attend Day 2 at a cohort other than your home one) correctly
 * count toward completion.
 */

import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('ClassroomAttendanceService');

export interface RecordAttendanceInput {
  enrollmentId: string;
  present: boolean;
}

interface SessionRow {
  id: string;
  cohort_id: string;
  curriculum_day: number;
}

/**
 * Marks one student present/absent for one specific session. The session
 * may belong to a DIFFERENT cohort than the student's home one (a
 * make-up) - callable from any cohort's roster, not just the student's own.
 *
 * The "a student can only be present at one curriculum_day once, ever,
 * across all cohorts" rule spans sessions via curriculum_day, so it can't
 * be a single-table SQL constraint - it's enforced here, before every
 * present=true insert, by checking for an existing present=true row at the
 * SAME curriculum_day on ANY session (not just this one).
 */
export const recordAttendance = async (
  sessionId: string,
  tenantId: string,
  data: RecordAttendanceInput,
  userId?: string
): Promise<void> => {
  const sessionResult = await query(
    `SELECT id, cohort_id, curriculum_day FROM de_cohort_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  if (sessionResult.rows.length === 0) {
    throw new AppError('Session not found', 404);
  }
  const session = sessionResult.rows[0] as SessionRow;

  const enrollmentCheck = await query(
    `SELECT id, program_type FROM enrollments WHERE id = $1 AND tenant_id = $2`,
    [data.enrollmentId, tenantId]
  );
  if (enrollmentCheck.rows.length === 0) {
    throw new AppError('Enrollment not found', 404);
  }
  if (enrollmentCheck.rows[0].program_type !== 'driver_education') {
    throw new AppError('Attendance can only be recorded for a driver_education enrollment', 400);
  }

  if (data.present) {
    const duplicateDayCheck = await query(
      `SELECT a.id FROM de_attendance a
       JOIN de_cohort_sessions s ON s.id = a.session_id
       WHERE a.enrollment_id = $1 AND a.present = true AND s.curriculum_day = $2 AND a.session_id != $3`,
      [data.enrollmentId, session.curriculum_day, sessionId]
    );
    if (duplicateDayCheck.rows.length > 0) {
      throw new AppError(
        `This student is already marked present for curriculum day ${session.curriculum_day} at another session`,
        409
      );
    }
  }

  logger.info('Recording classroom attendance', {
    tenantId,
    sessionId,
    enrollmentId: data.enrollmentId,
    present: data.present,
  });

  await query(
    `INSERT INTO de_attendance (tenant_id, enrollment_id, session_id, present, recorded_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (enrollment_id, session_id)
     DO UPDATE SET present = $4, recorded_by = $5, recorded_at = now()`,
    [tenantId, data.enrollmentId, sessionId, data.present, userId || null]
  );
};

export interface ClassroomAttendanceSummary {
  attendedCurriculumDays: number[]; // e.g. [1, 2, 4] - sorted, unique
  isComplete: boolean; // true once all 4 days are attended
}

/**
 * The completion signal itself: which curriculum days (1-4) this
 * enrollment has a present=true de_attendance row for, ACROSS ANY
 * cohort's sessions - never scoped to one cohort. isComplete = all 4.
 */
export const getClassroomAttendanceSummary = async (
  enrollmentId: string,
  tenantId: string
): Promise<ClassroomAttendanceSummary> => {
  const result = await query(
    `SELECT DISTINCT s.curriculum_day
     FROM de_attendance a
     JOIN de_cohort_sessions s ON s.id = a.session_id
     WHERE a.enrollment_id = $1 AND a.tenant_id = $2 AND a.present = true
     ORDER BY s.curriculum_day ASC`,
    [enrollmentId, tenantId]
  );

  const attendedCurriculumDays = result.rows.map((row: { curriculum_day: number }) => row.curriculum_day);
  return {
    attendedCurriculumDays,
    isComplete: attendedCurriculumDays.length === 4,
  };
};

/**
 * Batched form of getClassroomAttendanceSummary, for attaching to a list
 * of enrollments (enrollmentService.attachProgressAndPayments) without
 * N+1 queries.
 */
export const getClassroomAttendanceSummaries = async (
  enrollmentIds: string[],
  tenantId: string
): Promise<Map<string, ClassroomAttendanceSummary>> => {
  const map = new Map<string, ClassroomAttendanceSummary>();
  if (enrollmentIds.length === 0) return map;

  const result = await query(
    `SELECT DISTINCT a.enrollment_id, s.curriculum_day
     FROM de_attendance a
     JOIN de_cohort_sessions s ON s.id = a.session_id
     WHERE a.enrollment_id = ANY($1::uuid[]) AND a.tenant_id = $2 AND a.present = true`,
    [enrollmentIds, tenantId]
  );

  const daysByEnrollment = new Map<string, number[]>();
  for (const row of result.rows as { enrollment_id: string; curriculum_day: number }[]) {
    const list = daysByEnrollment.get(row.enrollment_id) ?? [];
    list.push(row.curriculum_day);
    daysByEnrollment.set(row.enrollment_id, list);
  }

  for (const enrollmentId of enrollmentIds) {
    const days = (daysByEnrollment.get(enrollmentId) ?? []).sort((a, b) => a - b);
    map.set(enrollmentId, { attendedCurriculumDays: days, isComplete: days.length === 4 });
  }

  return map;
};

export interface RosterEntry {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  isHomeCohort: boolean; // false = a make-up guest at this session
  present: boolean;
}

/**
 * One session's full roster: every student who should appear on this
 * session's attendance checkbox column - the cohort's own enrolled
 * students (isHomeCohort: true) PLUS any make-up guest already marked
 * present/absent here from a different home cohort (isHomeCohort: false).
 */
export const getSessionRoster = async (sessionId: string, tenantId: string): Promise<RosterEntry[]> => {
  const sessionResult = await query(
    `SELECT id, cohort_id FROM de_cohort_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  if (sessionResult.rows.length === 0) {
    throw new AppError('Session not found', 404);
  }
  const cohortId = sessionResult.rows[0].cohort_id;

  const result = await query(
    `SELECT
       e.id AS enrollment_id,
       e.student_id,
       s.full_name AS student_name,
       (dce.cohort_id = $2) AS is_home_cohort,
       COALESCE(a.present, false) AS present
     FROM de_cohort_enrollments dce
     JOIN enrollments e ON e.id = dce.enrollment_id
     JOIN students s ON s.id = e.student_id
     LEFT JOIN de_attendance a ON a.enrollment_id = e.id AND a.session_id = $1
     WHERE dce.cohort_id = $2 AND dce.tenant_id = $3

     UNION

     SELECT
       e.id AS enrollment_id,
       e.student_id,
       s.full_name AS student_name,
       false AS is_home_cohort,
       a.present AS present
     FROM de_attendance a
     JOIN enrollments e ON e.id = a.enrollment_id
     JOIN students s ON s.id = e.student_id
     WHERE a.session_id = $1 AND a.tenant_id = $3
       AND a.enrollment_id NOT IN (
         SELECT dce.enrollment_id FROM de_cohort_enrollments dce WHERE dce.cohort_id = $2
       )

     ORDER BY student_name ASC`,
    [sessionId, cohortId, tenantId]
  );

  return result.rows.map((row: Record<string, unknown>) => keysToCamel(row)) as unknown as RosterEntry[];
};
