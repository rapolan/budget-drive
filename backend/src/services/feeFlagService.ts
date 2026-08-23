/**
 * Fee Flag Service
 *
 * Constraint A: a no-show or late-cancellation fee is a FLAG on the student
 * recording amount and reason - never a payment record, never revenue. The
 * instructor collects the fee in cash for this school and it never reaches
 * the business, so a flag must never appear in school revenue or payments
 * reporting when the tenant's cancellation_fee_payee setting is
 * 'instructor'. This file is deliberately never referenced by, or joined
 * into, instructorService.getInstructorEarnings or any student revenue
 * column - that isolation is structural, not something callers opt into.
 *
 * createFeeFlag is internal - called only from lessonService's no-show/
 * cancel paths as a side effect of a status transition, never a public
 * write endpoint of its own.
 *
 * fee_flags deliberately carries BOTH student_id and enrollment_id, and
 * they are not redundant - unlike lessons.student_id/payments.student_id
 * (dropped in migration 019 as pure duplication, since an enrollment
 * already identifies its student), the two IDs here mean different things:
 * enrollment_id is PROVENANCE (which program's lesson generated this fee -
 * relevant for CVC §11108's cost-of-instruction record) and student_id is
 * WHO OWES IT (the person). A fee clears when the student's NEXT lesson
 * completes, which may be booked under a different (later) enrollment than
 * the one that generated the fee - so every student-scoped query below
 * (getOutstandingFlagsForStudent, clearOutstandingFlagsForStudent,
 * recordPaymentForFeeFlag) is intentionally person-scoped, not a shortcut
 * that should be "cleaned up" to use enrollment_id instead.
 *
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security.
 */

import { query, getClient } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { getTenantSettings } from './tenantService';
import * as paymentService from './paymentService';

const logger = createLogger('FeeFlagService');

export interface FeeFlag {
  id: string;
  tenantId: string;
  studentId: string;
  enrollmentId: string;
  lessonId: string;
  amount: number;
  reason: string;
  status: 'outstanding' | 'cleared' | 'waived' | 'paid';
  waivedBy: string | null;
  waivedReason: string | null;
  waivedAt: Date | null;
  paidPaymentId: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeFlagForInstructor extends FeeFlag {
  studentName: string;
}

/**
 * Creates an outstanding fee flag for a student, sourced from a specific
 * lesson. Internal - called only from lessonService's status-transition
 * side effects (no-show, or a cancellation inside the fee window).
 */
export const createFeeFlag = async (
  tenantId: string,
  studentId: string,
  enrollmentId: string,
  lessonId: string,
  amount: number,
  reason: string
): Promise<FeeFlag> => {
  logger.info('Creating fee flag', { tenantId, studentId, enrollmentId, lessonId, amount, reason });

  const result = await query(
    `INSERT INTO fee_flags (tenant_id, student_id, enrollment_id, lesson_id, amount, reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'outstanding')
     RETURNING *`,
    [tenantId, studentId, enrollmentId, lessonId, amount, reason]
  );

  return keysToCamel(result.rows[0]) as FeeFlag;
};

/**
 * All outstanding fee flags for a student, oldest first.
 */
export const getOutstandingFlagsForStudent = async (
  tenantId: string,
  studentId: string
): Promise<FeeFlag[]> => {
  const result = await query(
    `SELECT * FROM fee_flags
     WHERE tenant_id = $1 AND student_id = $2 AND status = 'outstanding'
     ORDER BY created_at ASC`,
    [tenantId, studentId]
  );

  return result.rows.map(keysToCamel) as FeeFlag[];
};

/**
 * Batched outstanding-flag lookup for a set of students in one query (not
 * N+1) - mirrors studentGuardianService.countGuardiansForStudentsBatch and
 * studentService.attachProgress's existing no-N+1 pattern. Returns a Map of
 * studentId -> that student's outstanding flags; students with none simply
 * aren't present as keys.
 */
export const getOutstandingFlagsForStudentsBatch = async (
  tenantId: string,
  studentIds: string[]
): Promise<Map<string, FeeFlag[]>> => {
  const byStudent = new Map<string, FeeFlag[]>();
  if (studentIds.length === 0) return byStudent;

  const result = await query(
    `SELECT * FROM fee_flags
     WHERE tenant_id = $1 AND student_id = ANY($2::uuid[]) AND status = 'outstanding'
     ORDER BY created_at ASC`,
    [tenantId, studentIds]
  );

  for (const row of result.rows) {
    const flag = keysToCamel(row) as FeeFlag;
    const existing = byStudent.get(flag.studentId);
    if (existing) {
      existing.push(flag);
    } else {
      byStudent.set(flag.studentId, [flag]);
    }
  }
  return byStudent;
};

/**
 * All fee flags sourced from a given instructor's lessons - read-only,
 * "listed, not totalled" per Constraint A. Never summed here or by any
 * caller.
 */
export const getFeeFlagsForInstructor = async (
  tenantId: string,
  instructorId: string
): Promise<FeeFlagForInstructor[]> => {
  const result = await query(
    `SELECT ff.*, s.full_name AS "studentName"
     FROM fee_flags ff
     JOIN lessons l ON l.id = ff.lesson_id AND l.tenant_id = ff.tenant_id
     JOIN students s ON s.id = ff.student_id AND s.tenant_id = ff.tenant_id
     WHERE ff.tenant_id = $1 AND l.instructor_id = $2
     ORDER BY ff.created_at DESC`,
    [tenantId, instructorId]
  );

  return result.rows.map(keysToCamel) as FeeFlagForInstructor[];
};

/**
 * Waives a fee flag with attribution, matching
 * studentService.markStudentCompleted's waive-with-reason shape: userId
 * from req.user?.userId (never the request body), a free-text reason.
 */
export const waiveFeeFlag = async (
  id: string,
  tenantId: string,
  userId: string | undefined,
  reason: string
): Promise<FeeFlag> => {
  logger.info('Waiving fee flag', { tenantId, feeFlagId: id });

  const result = await query(
    `UPDATE fee_flags
     SET status = 'waived', waived_by = $1, waived_reason = $2, waived_at = NOW()
     WHERE id = $3 AND tenant_id = $4 AND status = 'outstanding'
     RETURNING *`,
    [userId || null, reason, id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Outstanding fee flag not found', 404);
  }

  return keysToCamel(result.rows[0]) as FeeFlag;
};

/**
 * Converts a fee flag into a real payment record - only reachable when the
 * tenant's cancellation_fee_payee setting is 'school', re-checked here
 * server-side (not just hidden client-side). When payee is 'instructor',
 * this throws 403 and no payment record is ever created - structurally
 * impossible to reach the school-only path.
 */
export const recordPaymentForFeeFlag = async (
  id: string,
  tenantId: string,
  userId: string | undefined,
  // Optional transactional client - see paymentService.createPayment's own
  // doc comment. Defaults to the module-level query so every existing
  // caller (the single-flag detail-page action) is unaffected.
  dbQuery: typeof query = query
): Promise<FeeFlag> => {
  const settings = await getTenantSettings(tenantId);
  if (settings?.cancellationFeePayee !== 'school') {
    throw new AppError(
      'This tenant collects cancellation fees via the instructor - no payment record can be created',
      403
    );
  }

  const flagResult = await dbQuery(
    `SELECT * FROM fee_flags WHERE id = $1 AND tenant_id = $2 AND status = 'outstanding'`,
    [id, tenantId]
  );
  if (flagResult.rows.length === 0) {
    throw new AppError('Outstanding fee flag not found', 404);
  }
  const flag = keysToCamel(flagResult.rows[0]) as FeeFlag;

  const payment = await paymentService.createPayment(
    tenantId,
    {
      studentId: flag.studentId,
      lessonId: flag.lessonId,
      amount: flag.amount,
      paymentType: 'cancellation_fee',
      notes: flag.reason,
    },
    userId,
    dbQuery
  );

  const result = await dbQuery(
    `UPDATE fee_flags
     SET status = 'paid', paid_payment_id = $1, paid_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING *`,
    [payment.id, id, tenantId]
  );

  return keysToCamel(result.rows[0]) as FeeFlag;
};

/**
 * Clears every outstanding fee flag for a student at once ("cash assumed
 * settled" is one real-world event) - called from lessonService's
 * completeLesson as a non-blocking side effect.
 */
export const clearOutstandingFlagsForStudent = async (
  tenantId: string,
  studentId: string
): Promise<void> => {
  await query(
    `UPDATE fee_flags
     SET status = 'cleared'
     WHERE tenant_id = $1 AND student_id = $2 AND status = 'outstanding'`,
    [tenantId, studentId]
  );
};

/**
 * One-click "Paid" for every outstanding fee flag a student currently has -
 * the Students list's per-row fee action (and reused by the detail page's
 * actions area, per Constraint A: one source of truth). Marking a fee paid
 * is a single fact, not a partial one, so this always resolves the
 * student's ENTIRE outstanding set, not one flag at a time.
 *
 * Payee-aware per flag, exactly matching what each flag's own action would
 * do individually - fee_flags has no stored payee column (it's a live
 * tenant_settings.cancellation_fee_payee read, same as
 * recordPaymentForFeeFlag already does), so every currently-outstanding
 * flag is resolved the same way, by the tenant's CURRENT setting:
 *   - 'school' payee: mirrors recordPaymentForFeeFlag exactly (a real
 *     payments row per flag, flag -> 'paid') - this is real school
 *     revenue, so clearing without a payment record would misstate the
 *     books. The list and the detail page's per-flag Paid action must
 *     produce identical payment records for the same flag - this function
 *     calls recordPaymentForFeeFlag itself for each flag rather than
 *     reimplementing payment creation.
 *   - 'instructor' payee: clear-only (flag -> 'cleared', no payment row) -
 *     the instructor collected cash that never reaches the school; a
 *     payment record here would put phantom revenue on the school's books
 *     for money it never received.
 *
 * Wrapped in one real BEGIN/COMMIT (a genuine multi-row money operation -
 * a partial failure with two payments created and a third flag still
 * outstanding is an inconsistent state that has to reconcile for a
 * school's books, and a retry would double-pay the already-recorded
 * flags). paymentService.createPayment and recordPaymentForFeeFlag both
 * accept the transactional client so every insert/update in this batch
 * participates in the same transaction.
 */
export const markStudentFeesPaid = async (
  tenantId: string,
  studentId: string,
  userId: string | undefined
): Promise<FeeFlag[]> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const dbQuery = client.query.bind(client) as typeof query;

    const outstanding = await dbQuery(
      `SELECT * FROM fee_flags WHERE tenant_id = $1 AND student_id = $2 AND status = 'outstanding'`,
      [tenantId, studentId]
    );
    if (outstanding.rows.length === 0) {
      await client.query('ROLLBACK');
      return [];
    }

    const settings = await getTenantSettings(tenantId);
    const isSchoolPayee = settings?.cancellationFeePayee === 'school';

    const resolved: FeeFlag[] = [];
    for (const row of outstanding.rows) {
      const flag = keysToCamel(row) as FeeFlag;
      if (isSchoolPayee) {
        resolved.push(await recordPaymentForFeeFlag(flag.id, tenantId, userId, dbQuery));
      } else {
        const clearedResult = await dbQuery(
          `UPDATE fee_flags SET status = 'cleared' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
          [flag.id, tenantId]
        );
        resolved.push(keysToCamel(clearedResult.rows[0]) as FeeFlag);
      }
    }

    await client.query('COMMIT');
    logger.info('Marked all of a student\'s outstanding fees paid', {
      tenantId,
      studentId,
      count: resolved.length,
      payee: isSchoolPayee ? 'school' : 'instructor',
    });
    return resolved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
