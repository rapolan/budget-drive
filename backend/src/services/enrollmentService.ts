/**
 * Enrollment Service
 *
 * A student (person) has one or more program enrollments. This service owns
 * everything program-specific: progress, completion, required hours, the
 * external driver_education prerequisite, and derived payment totals.
 * Guardians, identity, and DOB stay on the student (studentService) -
 * Constraint C is not renegotiable here.
 *
 * "The student's active driver_training enrollment" is resolved by every
 * lesson/payment/fee-flag creation path via getActiveDriverTrainingEnrollment
 * below - there is at most one per student (partial unique index on
 * (student_id) WHERE program_type = 'driver_training' AND status = 'active'),
 * enabling a returning student to complete one driver_training enrollment
 * and later start a second (e.g. car training, then motorcycle training
 * years later).
 */

import { query } from '../config/database';
import { Enrollment, EnrollmentPaymentSummary, Student, Lesson, ProgramType } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone } from '../utils/tenantTime';
import { computeStudentProgress, calculateAge } from './studentProgressService';
import { getClassroomAttendanceSummaries } from './classroomAttendanceService';
import crypto from 'crypto';

const logger = createLogger('EnrollmentService');

/**
 * Batch-attach progress (from computeStudentProgress) and derived payment
 * summary to a set of enrollments already belonging to one student. Mirrors
 * studentService's attachProgress - one extra query per data source, not
 * N+1. dateOfBirth/timezone are the student's, not the enrollment's -
 * Constraint B/C: DOB is person-level, progress math is unchanged.
 */
async function attachProgressAndPayments(
  enrollments: Enrollment[],
  student: Pick<Student, 'dateOfBirth'>,
  tenantId: string
): Promise<Enrollment[]> {
  if (enrollments.length === 0) return enrollments;

  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);
  const standardLessonLengthMinutes = tenantSettings?.standardLessonLengthMinutes ?? 120;

  const enrollmentIds = enrollments.map(e => e.id);

  const lessonsResult = await query(
    `SELECT enrollment_id, status, duration, cost FROM lessons WHERE tenant_id = $1 AND enrollment_id = ANY($2::uuid[])`,
    [tenantId, enrollmentIds]
  );
  const lessonsByEnrollment = new Map<string, { status: Lesson['status']; duration: number; cost: number }[]>();
  for (const row of lessonsResult.rows) {
    const list = lessonsByEnrollment.get(row.enrollment_id) ?? [];
    list.push({ status: row.status, duration: parseFloat(row.duration), cost: parseFloat(row.cost) });
    lessonsByEnrollment.set(row.enrollment_id, list);
  }

  const paymentsResult = await query(
    `SELECT enrollment_id, COALESCE(SUM(amount), 0) AS total_paid
     FROM payments
     WHERE tenant_id = $1 AND enrollment_id = ANY($2::uuid[]) AND status = 'confirmed'
     GROUP BY enrollment_id`,
    [tenantId, enrollmentIds]
  );
  const paidByEnrollment = new Map<string, number>();
  for (const row of paymentsResult.rows) {
    paidByEnrollment.set(row.enrollment_id, parseFloat(row.total_paid));
  }

  // classroom driver_education has no lesson-derived progress at all - its
  // completion signal is per-curriculum-day attendance instead. Batched
  // (one query for every classroom-DE enrollment in this set), not N+1.
  const classroomEnrollmentIds = enrollments
    .filter(e => e.programType === 'driver_education' && e.deDeliveryMode === 'classroom')
    .map(e => e.id);
  const attendanceByEnrollment = await getClassroomAttendanceSummaries(classroomEnrollmentIds, tenantId);

  return enrollments.map(enrollment => {
    const lessons = lessonsByEnrollment.get(enrollment.id) ?? [];

    const progress = computeStudentProgress(
      {
        dateOfBirth: student.dateOfBirth,
        hoursRequired: enrollment.hoursRequired,
        completed: enrollment.completed,
        completedAt: enrollment.completedAt,
        completionReason: enrollment.completionReason,
        trackOverride: enrollment.trackOverride,
      },
      lessons.map(l => ({ status: l.status, duration: l.duration })),
      standardLessonLengthMinutes,
      timezone
    );

    const paymentSummary = computePaymentSummary(enrollment, lessons, paidByEnrollment.get(enrollment.id) ?? 0);

    // Certificate-worklist eligibility mirror: was this person a minor AS
    // OF this enrollment's completion date, not today's date - computed
    // here (tenant-timezone-aware, server-side) rather than in the
    // frontend, so the enrollment tab's "awaiting certificate" badge can
    // never disagree with what the certificates worklist itself surfaces.
    // Meaningless (false) for a non-completed enrollment.
    const wasMinorAtCompletion = enrollment.completed && enrollment.completedAt
      ? (() => {
          const age = calculateAge(student.dateOfBirth, timezone, new Date(enrollment.completedAt as Date));
          return age === null || age < 18;
        })()
      : false;

    const classroomAttendance = attendanceByEnrollment.get(enrollment.id);

    return { ...enrollment, progress, paymentSummary, wasMinorAtCompletion, classroomAttendance };
  });
}

/**
 * total_cost derivation, in priority order: (1) enrollment.totalCost if
 * explicitly set - a quoted package-price override; (2) sum of this
 * enrollment's non-cancelled lessons.cost - the actual charge, since
 * tenant_settings.default_lesson_cost is confirmed to be only a
 * booking-wizard prefill, not an enforced formula (lessons.cost is freely
 * edited per lesson and that's what's actually persisted); (3) null - "not
 * computable yet" - when neither is available, rather than guessing 0.
 */
export function computePaymentSummary(
  enrollment: Pick<Enrollment, 'totalCost'>,
  lessons: { status: Lesson['status']; cost: number }[],
  totalPaid: number
): EnrollmentPaymentSummary {
  let totalCost: number | null = enrollment.totalCost;
  if (totalCost === null || totalCost === undefined) {
    const nonCancelled = lessons.filter(l => l.status !== 'cancelled');
    totalCost = nonCancelled.length > 0
      ? round2(nonCancelled.reduce((sum, l) => sum + l.cost, 0))
      : null;
  }

  if (totalCost === null) {
    return { totalPaid: round2(totalPaid), outstandingBalance: null, paymentStatus: 'unknown' };
  }

  const outstandingBalance = round2(Math.max(0, totalCost - totalPaid));
  let paymentStatus: EnrollmentPaymentSummary['paymentStatus'] = 'unpaid';
  if (outstandingBalance === 0 && totalPaid > 0) {
    paymentStatus = 'paid';
  } else if (totalPaid > 0 && outstandingBalance > 0) {
    paymentStatus = 'partial';
  }

  return { totalPaid: round2(totalPaid), outstandingBalance, paymentStatus };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Get every enrollment for a student, with progress + payment summary
 * attached. Used by the student detail view (Item 4's Enrollments tab).
 */
export const getEnrollmentsForStudent = async (
  studentId: string,
  tenantId: string,
  student: Pick<Student, 'dateOfBirth'>
): Promise<Enrollment[]> => {
  const result = await query(
    `SELECT * FROM enrollments WHERE student_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
    [studentId, tenantId]
  );
  const enrollments = result.rows.map(keysToCamel) as Enrollment[];
  return attachProgressAndPayments(enrollments, student, tenantId);
};

export const getEnrollmentById = async (
  id: string,
  tenantId: string
): Promise<Enrollment | null> => {
  const result = await query(`SELECT * FROM enrollments WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  if (result.rows.length === 0) return null;
  return keysToCamel(result.rows[0]) as Enrollment;
};

/**
 * getEnrollmentById plus progress/payment summary attached - for single-
 * enrollment detail views. Takes the student separately (caller already has
 * it in most cases) rather than re-fetching it here.
 */
export const getEnrollmentByIdWithProgress = async (
  id: string,
  tenantId: string,
  student: Pick<Student, 'dateOfBirth'>
): Promise<Enrollment | null> => {
  const enrollment = await getEnrollmentById(id, tenantId);
  if (!enrollment) return null;
  const [withProgress] = await attachProgressAndPayments([enrollment], student, tenantId);
  return withProgress;
};

/**
 * Resolve "the student's active driver_training enrollment" - at most one
 * exists per the partial unique index. Returns null (not a throw) so
 * callers can produce their own contextual AppError message.
 */
export const getActiveDriverTrainingEnrollment = async (
  studentId: string,
  tenantId: string
): Promise<Enrollment | null> => {
  const result = await query(
    `SELECT * FROM enrollments
     WHERE student_id = $1 AND tenant_id = $2 AND program_type = 'driver_training' AND status = 'active'`,
    [studentId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return keysToCamel(result.rows[0]) as Enrollment;
};

/**
 * Batch form of getActiveDriverTrainingEnrollment, for attachProgress-style
 * list endpoints - one query for the whole page, not N+1.
 */
export const getActiveDriverTrainingEnrollmentsBatch = async (
  studentIds: string[],
  tenantId: string
): Promise<Map<string, Enrollment>> => {
  const map = new Map<string, Enrollment>();
  if (studentIds.length === 0) return map;

  const result = await query(
    `SELECT * FROM enrollments
     WHERE student_id = ANY($1::uuid[]) AND tenant_id = $2 AND program_type = 'driver_training' AND status = 'active'`,
    [studentIds, tenantId]
  );
  for (const row of result.rows) {
    const enrollment = keysToCamel(row) as Enrollment;
    map.set(enrollment.studentId, enrollment);
  }
  return map;
};

/**
 * Batch form of "the driver_training enrollment that should drive this
 * student's DISPLAY status/progress" - deliberately distinct from
 * getActiveDriverTrainingEnrollmentsBatch above, which is write-path only
 * (lesson/payment/fee-flag creation resolve "the enrollment to attach a
 * new record to," and that must stay active-only - you cannot book a
 * lesson against a completed enrollment). This function is read/display
 * only, used by attachProgress (studentService.ts) for the Students list.
 *
 * Resolution order, per student:
 *   1. The ACTIVE driver_training enrollment, if one exists - a returning
 *      student's new enrollment always takes priority over an older
 *      completed/withdrawn/inactive/suspended one, never a stale status
 *      once a new program has started.
 *   2. Otherwise the most recently updated non-active one, whatever its
 *      status (completed, withdrawn, inactive, or suspended) - so EVERY
 *      terminal state drives its own correct display status
 *      (studentStatus.ts maps each), instead of any of them falling
 *      through to "No Active Enrollment". completed_at DESC is used
 *      specifically for a completed row (the moment it finished is more
 *      meaningful than when the row was last touched); updated_at DESC
 *      is the general tiebreaker for the other three, none of which have
 *      an equivalent "when this happened" column of their own besides
 *      withdrawn_at (not selected into this ordering since a student
 *      practically has at most one non-active driver_training row at a
 *      time under today's write paths).
 *   3. Otherwise nothing at all - the student has no driver_training
 *      enrollment ever, the one case "No Active Enrollment" is reserved
 *      for.
 */
export const getDisplayDriverTrainingEnrollmentsBatch = async (
  studentIds: string[],
  tenantId: string
): Promise<Map<string, Enrollment>> => {
  const map = new Map<string, Enrollment>();
  if (studentIds.length === 0) return map;

  const result = await query(
    `SELECT DISTINCT ON (student_id) *
     FROM enrollments
     WHERE student_id = ANY($1::uuid[]) AND tenant_id = $2 AND program_type = 'driver_training'
     ORDER BY student_id, (status = 'active') DESC, completed_at DESC NULLS LAST, updated_at DESC`,
    [studentIds, tenantId]
  );
  for (const row of result.rows) {
    const enrollment = keysToCamel(row) as Enrollment;
    map.set(enrollment.studentId, enrollment);
  }
  return map;
};

export interface CreateEnrollmentInput {
  programType: ProgramType;
  hoursRequired?: number;
  licenseType?: 'car' | 'motorcycle' | 'commercial';
  assignedInstructorId?: string;
  totalCost?: number;
  // driver_education only, per Constraint D - manually entered, no lesson tracking
  manualCompletedHours?: number;
  // driver_education only, required at creation (Phase 3) - classroom vs
  // online, feeds the certificate form-type mapper (certificateService).
  deDeliveryMode?: 'classroom' | 'online';
}

/**
 * Create a new enrollment for a student. For driver_training, the partial
 * unique index enforces at most one ACTIVE row at a time at the DB level -
 * this function additionally pre-checks so a caller gets a clean 400
 * instead of a raw constraint-violation error.
 */
export const createEnrollment = async (
  studentId: string,
  tenantId: string,
  data: CreateEnrollmentInput,
  userId?: string
): Promise<Enrollment> => {
  logger.info('Creating enrollment', { tenantId, studentId, programType: data.programType });

  const studentCheck = await query('SELECT id FROM students WHERE id = $1 AND tenant_id = $2', [studentId, tenantId]);
  if (studentCheck.rows.length === 0) {
    throw new AppError('Student not found', 404);
  }

  if (data.programType === 'driver_training') {
    const existingActive = await getActiveDriverTrainingEnrollment(studentId, tenantId);
    if (existingActive) {
      throw new AppError('Student already has an active driver_training enrollment', 400);
    }
  }

  if (data.programType === 'driver_education') {
    if (data.deDeliveryMode !== 'classroom' && data.deDeliveryMode !== 'online') {
      throw new AppError('deDeliveryMode ("classroom" or "online") is required for a driver_education enrollment', 400);
    }
  }

  const tenantSettings = await getTenantSettings(tenantId);
  const hoursRequired = data.hoursRequired ?? tenantSettings?.defaultHoursRequired ?? 6;
  const licenseType = data.licenseType ?? 'car';

  const result = await query(
    `INSERT INTO enrollments (
       tenant_id, student_id, program_type, hours_required, license_type,
       assigned_instructor_id, total_cost, manual_completed_hours, de_delivery_mode, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING *`,
    [
      tenantId,
      studentId,
      data.programType,
      hoursRequired,
      licenseType,
      data.assignedInstructorId || null,
      data.totalCost ?? null,
      data.manualCompletedHours ?? null,
      data.deDeliveryMode ?? null,
      userId || null,
    ]
  );

  logger.info('Successfully created enrollment', { tenantId, studentId, enrollmentId: result.rows[0].id });
  return keysToCamel(result.rows[0]) as Enrollment;
};

/**
 * Mark an enrollment's program complete. Guardian gate resolves the PERSON
 * via this enrollment's student_id FK (Constraint C: guardians stay
 * person-scoped, so completion must check the person, not the enrollment).
 * Also computes and stores completion_hash (Item 5) - internal IDs and
 * non-PII scalars only, via Node's built-in crypto. ledger_txid is never
 * written here or anywhere this session.
 */
export const markEnrollmentCompleted = async (
  id: string,
  tenantId: string,
  data: { completionReason?: string },
  userId?: string
): Promise<Enrollment> => {
  logger.info('Marking enrollment complete', { tenantId, enrollmentId: id });

  const enrollment = await getEnrollmentById(id, tenantId);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  const guardianCheck = await query(
    `SELECT
       s.date_of_birth,
       (SELECT COUNT(*) FROM student_guardians sg WHERE sg.student_id = s.id AND sg.tenant_id = $2) AS guardian_count
     FROM students s WHERE s.id = $1 AND s.tenant_id = $2`,
    [enrollment.studentId, tenantId]
  );
  if (guardianCheck.rows.length === 0) {
    throw new AppError('Student not found', 404);
  }
  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);
  const age = calculateAge(guardianCheck.rows[0].date_of_birth, timezone);
  const isMinor = age === null || age < 18;
  const guardianCount = parseInt(guardianCheck.rows[0].guardian_count, 10);
  if (isMinor && guardianCount === 0) {
    throw new AppError('Cannot mark program complete: this minor student has no linked guardian', 400);
  }

  const completedAt = new Date();
  const hoursCompletedForHash = enrollment.programType === 'driver_education'
    ? enrollment.manualCompletedHours
    : enrollment.hoursRequired;
  const completionHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      enrollmentId: enrollment.id,
      programType: enrollment.programType,
      hoursCompleted: hoursCompletedForHash,
      completedAt: completedAt.toISOString(),
    }))
    .digest('hex');

  const result = await query(
    `UPDATE enrollments
     SET completed = true,
         completed_at = $1,
         completed_by = $2,
         completion_reason = $3,
         status = 'completed',
         completion_hash = $4
     WHERE id = $5 AND tenant_id = $6
     RETURNING *`,
    [completedAt, userId || null, data.completionReason || null, completionHash, id, tenantId]
  );

  logger.info('Successfully marked enrollment complete', { tenantId, enrollmentId: id });
  return keysToCamel(result.rows[0]) as Enrollment;
};

/**
 * Reverse an enrollment completion. Unlike the old student-level reopen,
 * this is a guarded write: requires a reason (enforced at the route layer
 * via validateRequired) and records who/when/why via reopened_at/
 * reopened_by/reopened_reason - reopening is a new event, not an erasure,
 * so completion_hash is deliberately never cleared (the historical fact
 * "a completion occurred" must survive).
 *
 * certificateExists is scoped to THIS enrollment (certificates.enrollment_id,
 * as of migration 021) - a person with two enrollments no longer sees a
 * certificate-exists warning that actually belongs to their other one.
 */
export const reopenEnrollment = async (
  id: string,
  tenantId: string,
  data: { reason: string },
  userId?: string
): Promise<Enrollment & { certificateExists: boolean }> => {
  logger.info('Reopening enrollment', { tenantId, enrollmentId: id });

  const enrollment = await getEnrollmentById(id, tenantId);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  const certCheck = await query(
    `SELECT COUNT(*) AS count FROM certificates WHERE enrollment_id = $1 AND tenant_id = $2`,
    [enrollment.id, tenantId]
  );
  const certificateExists = parseInt(certCheck.rows[0].count, 10) > 0;

  const result = await query(
    `UPDATE enrollments
     SET completed = false,
         completed_at = NULL,
         completed_by = NULL,
         status = 'active',
         reopened_at = NOW(),
         reopened_by = $1,
         reopened_reason = $2
     WHERE id = $3 AND tenant_id = $4
     RETURNING *`,
    [userId || null, data.reason, id, tenantId]
  );

  logger.info('Successfully reopened enrollment', { tenantId, enrollmentId: id, certificateExists });
  return { ...(keysToCamel(result.rows[0]) as Enrollment), certificateExists };
};

/**
 * A minor who leaves before completing their program is entitled under
 * 13 CCR §340.27 to a transcript of training received - see
 * transcriptService.generateWithdrawalTranscript. Withdrawal is a guarded
 * write, same shape as reopen: requires a reason (enforced at the route
 * layer via validateRequired), restricted to owner/admin, records who/
 * when/why via withdrawn_at/withdrawn_by/withdrawn_reason. Only callable
 * on an active enrollment - completed and withdrawn are mutually
 * exclusive outcomes for a program, matching the existing terminal-
 * status-transition-guard pattern lessons use for their own status
 * transitions.
 */
export const withdrawEnrollment = async (
  id: string,
  tenantId: string,
  data: { reason: string },
  userId?: string
): Promise<Enrollment> => {
  logger.info('Withdrawing enrollment', { tenantId, enrollmentId: id });

  const enrollment = await getEnrollmentById(id, tenantId);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }
  if (enrollment.status !== 'active') {
    throw new AppError(`Cannot withdraw an enrollment with status '${enrollment.status}' - only an active enrollment can be withdrawn`, 409);
  }

  const result = await query(
    `UPDATE enrollments
     SET status = 'withdrawn',
         withdrawn_at = NOW(),
         withdrawn_by = $1,
         withdrawn_reason = $2
     WHERE id = $3 AND tenant_id = $4
     RETURNING *`,
    [userId || null, data.reason, id, tenantId]
  );

  logger.info('Successfully withdrew enrollment', { tenantId, enrollmentId: id });
  return keysToCamel(result.rows[0]) as Enrollment;
};

export interface UpdateEnrollmentInput {
  hoursRequired?: number;
  licenseType?: 'car' | 'motorcycle' | 'commercial';
  assignedInstructorId?: string | null;
  totalCost?: number | null;
  trackOverride?: 'hours' | 'lessons' | null;
  externalDeCompleted?: boolean;
  externalDeCompletedDate?: Date | null;
  externalDeProvider?: string | null;
  manualCompletedHours?: number | null;
}

export const updateEnrollment = async (
  id: string,
  tenantId: string,
  data: UpdateEnrollmentInput,
  userId?: string
): Promise<Enrollment> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.hoursRequired !== undefined) {
    fields.push(`hours_required = $${paramCount++}`);
    values.push(data.hoursRequired);
  }
  if (data.licenseType !== undefined) {
    fields.push(`license_type = $${paramCount++}`);
    values.push(data.licenseType);
  }
  if (data.assignedInstructorId !== undefined) {
    fields.push(`assigned_instructor_id = $${paramCount++}`);
    values.push(data.assignedInstructorId);
  }
  if (data.totalCost !== undefined) {
    fields.push(`total_cost = $${paramCount++}`);
    values.push(data.totalCost);
  }
  if (data.trackOverride !== undefined) {
    fields.push(`track_override = $${paramCount++}`);
    values.push(data.trackOverride);
  }
  if (data.externalDeCompleted !== undefined) {
    fields.push(`external_de_completed = $${paramCount++}`);
    values.push(data.externalDeCompleted);
  }
  if (data.externalDeCompletedDate !== undefined) {
    fields.push(`external_de_completed_date = $${paramCount++}`);
    values.push(data.externalDeCompletedDate);
  }
  if (data.externalDeProvider !== undefined) {
    fields.push(`external_de_provider = $${paramCount++}`);
    values.push(data.externalDeProvider);
  }
  if (data.manualCompletedHours !== undefined) {
    fields.push(`manual_completed_hours = $${paramCount++}`);
    values.push(data.manualCompletedHours);
  }
  if (userId) {
    fields.push(`updated_by = $${paramCount++}`);
    values.push(userId);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE enrollments SET ${fields.join(', ')} WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Enrollment not found', 404);
  }

  return keysToCamel(result.rows[0]) as Enrollment;
};
