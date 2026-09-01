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

export interface CohortRosterStudent {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  // Keyed by the session id (one of this cohort's 4 de_cohort_sessions).
  // present:false / isHomeCohort:true for a student never marked at that
  // session but enrolled in this cohort - absent is the default, not an
  // error state.
  attendance: Record<string, { present: boolean; isHomeCohort: boolean }>;
  // Cohort-agnostic completion signal, same as getClassroomAttendanceSummary
  // - counts every present=true day across ALL this student's attendance,
  // not just this cohort's sessions, so a make-up elsewhere already
  // reduces missingCurriculumDays here.
  attendedCurriculumDayCount: number;
  missingCurriculumDays: number[];
}

/**
 * Everything one cohort's roster view needs in a single call: its 4
 * sessions (dates/curriculum days) plus every student who should appear
 * (this cohort's own enrollees, plus any make-up guest already marked at
 * one of its sessions from a different home cohort), each with their
 * per-session attendance AND their overall (cohort-agnostic) completion
 * count - so the UI never has to fetch per-session or compute completion
 * itself. Replaces N separate per-session roster fetches with one.
 */
export const getCohortRoster = async (
  cohortId: string,
  tenantId: string
): Promise<{ sessions: { id: string; curriculumDay: number; sessionDate: string }[]; students: CohortRosterStudent[] }> => {
  const sessionsResult = await query(
    `SELECT id, curriculum_day, session_date FROM de_cohort_sessions
     WHERE cohort_id = $1 AND tenant_id = $2
     ORDER BY curriculum_day ASC`,
    [cohortId, tenantId]
  );
  if (sessionsResult.rows.length === 0) {
    throw new AppError('Cohort not found', 404);
  }
  const sessions = sessionsResult.rows.map((row: { id: string; curriculum_day: number; session_date: string }) => ({
    id: row.id,
    curriculumDay: row.curriculum_day,
    sessionDate: row.session_date,
  }));
  const sessionIds = sessions.map((s) => s.id);

  // Every student who should appear on this roster: this cohort's own
  // enrollees, UNION anyone already marked (present or absent) at one of
  // this cohort's sessions despite having a different (or no) home cohort.
  const studentsResult = await query(
    `SELECT DISTINCT e.id AS enrollment_id, e.student_id, s.full_name AS student_name
     FROM de_cohort_enrollments dce
     JOIN enrollments e ON e.id = dce.enrollment_id
     JOIN students s ON s.id = e.student_id
     WHERE dce.cohort_id = $1 AND dce.tenant_id = $2

     UNION

     SELECT DISTINCT e.id AS enrollment_id, e.student_id, s.full_name AS student_name
     FROM de_attendance a
     JOIN enrollments e ON e.id = a.enrollment_id
     JOIN students s ON s.id = e.student_id
     WHERE a.session_id = ANY($3::uuid[]) AND a.tenant_id = $2

     ORDER BY student_name ASC`,
    [cohortId, tenantId, sessionIds]
  );

  if (studentsResult.rows.length === 0) {
    return { sessions, students: [] };
  }

  const enrollmentIds = studentsResult.rows.map((row: { enrollment_id: string }) => row.enrollment_id);

  // Per-session attendance for exactly these sessions (not this student's
  // attendance everywhere - that's the separate completion query below).
  const sessionAttendanceResult = await query(
    `SELECT a.enrollment_id, a.session_id, a.present, COALESCE(dce.cohort_id = $1, false) AS is_home_cohort
     FROM de_attendance a
     LEFT JOIN de_cohort_enrollments dce ON dce.enrollment_id = a.enrollment_id
     WHERE a.session_id = ANY($2::uuid[]) AND a.tenant_id = $3 AND a.enrollment_id = ANY($4::uuid[])`,
    [cohortId, sessionIds, tenantId, enrollmentIds]
  );

  type SessionAttendanceRow = { enrollment_id: string; session_id: string; present: boolean; is_home_cohort: boolean };
  const attendanceByEnrollment = new Map<string, Map<string, { present: boolean; isHomeCohort: boolean }>>();
  for (const row of sessionAttendanceResult.rows as SessionAttendanceRow[]) {
    const perSession = attendanceByEnrollment.get(row.enrollment_id) ?? new Map();
    perSession.set(row.session_id, { present: row.present, isHomeCohort: row.is_home_cohort });
    attendanceByEnrollment.set(row.enrollment_id, perSession);
  }

  // Cohort-agnostic completion: every present=true curriculum day across
  // ALL of this student's attendance, not just this cohort's 4 sessions -
  // a make-up attended at a different cohort already counts here.
  const completionResult = await query(
    `SELECT a.enrollment_id, s.curriculum_day
     FROM de_attendance a
     JOIN de_cohort_sessions s ON s.id = a.session_id
     WHERE a.enrollment_id = ANY($1::uuid[]) AND a.tenant_id = $2 AND a.present = true`,
    [enrollmentIds, tenantId]
  );
  type CompletionRow = { enrollment_id: string; curriculum_day: number };
  const attendedDaysByEnrollment = new Map<string, Set<number>>();
  for (const row of completionResult.rows as CompletionRow[]) {
    const days = attendedDaysByEnrollment.get(row.enrollment_id) ?? new Set<number>();
    days.add(row.curriculum_day);
    attendedDaysByEnrollment.set(row.enrollment_id, days);
  }

  const ALL_DAYS = [1, 2, 3, 4];
  const students: CohortRosterStudent[] = studentsResult.rows.map(
    (row: { enrollment_id: string; student_id: string; student_name: string }) => {
      const perSession = attendanceByEnrollment.get(row.enrollment_id) ?? new Map();
      const attendance: CohortRosterStudent['attendance'] = {};
      for (const session of sessions) {
        const entry = perSession.get(session.id);
        attendance[session.id] = entry ?? { present: false, isHomeCohort: true };
      }

      const attendedDays = attendedDaysByEnrollment.get(row.enrollment_id) ?? new Set<number>();
      return {
        enrollmentId: row.enrollment_id,
        studentId: row.student_id,
        studentName: row.student_name,
        attendance,
        attendedCurriculumDayCount: attendedDays.size,
        missingCurriculumDays: ALL_DAYS.filter((d) => !attendedDays.has(d)),
      };
    }
  );

  return { sessions, students };
};

export interface MakeUpCandidate {
  enrollmentId: string;
  studentId: string;
  studentName: string;
}

/**
 * Students with a driver_education enrollment who could be added as a
 * make-up guest at this specific session - i.e. not already marked at
 * THIS session (any other enrollment.id already present in
 * existingEnrollmentIds), name-filtered. Any driver_education enrollment
 * is eligible regardless of delivery mode or home cohort - the search
 * doesn't presuppose the student already has a home cohort at all.
 */
export const searchMakeUpCandidates = async (
  tenantId: string,
  search: string,
  excludeEnrollmentIds: string[]
): Promise<MakeUpCandidate[]> => {
  const result = await query(
    `SELECT e.id AS enrollment_id, e.student_id, s.full_name AS student_name
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE e.tenant_id = $1
       AND e.program_type = 'driver_education'
       AND s.full_name ILIKE $2
       AND NOT (e.id = ANY($3::uuid[]))
     ORDER BY s.full_name ASC
     LIMIT 10`,
    [tenantId, `%${search}%`, excludeEnrollmentIds.length > 0 ? excludeEnrollmentIds : ['00000000-0000-0000-0000-000000000000']]
  );

  return result.rows.map((row: { enrollment_id: string; student_id: string; student_name: string }) => ({
    enrollmentId: row.enrollment_id,
    studentId: row.student_id,
    studentName: row.student_name,
  }));
};
