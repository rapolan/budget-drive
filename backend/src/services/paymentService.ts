/**
 * Payment Service
 * Business logic for payment management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Payment } from '../types';
import { AppError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';
import { ledger } from './Ledger';
import { getActiveDriverTrainingEnrollment, getEnrollmentById, computePaymentSummary } from './enrollmentService';
import { keysToCamel } from '../utils/caseConversion';
import { isStudentCostCountedStatus } from '../utils/lessonCostFilter';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone, tenantToday } from '../utils/tenantTime';

const logger = createLogger('PaymentService');

export const getAllPayments = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ payments: Payment[]; total: number; page: number; totalPages: number }> => {
  logger.info('Fetching all payments', { tenantId, page, limit });

  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) FROM payments WHERE tenant_id = $1',
    [tenantId]
  );
  const total = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(total / limit);

  // Get paginated payments
  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1
     ORDER BY p.date DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );

  logger.info('Successfully fetched payments', {
    tenantId,
    count: result.rows.length,
    total,
    page,
  });

  return {
    payments: result.rows.map(keysToCamel) as Payment[],
    total,
    page,
    totalPages,
  };
};

export const getPaymentById = async (
  id: string,
  tenantId: string
): Promise<Payment | null> => {
  logger.debug('Fetching payment by ID', { tenantId, paymentId: id });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.debug('Payment not found', { tenantId, paymentId: id });
    return null;
  }

  return keysToCamel(result.rows[0]) as Payment;
};

export const getPaymentsByStudent = async (
  tenantId: string,
  studentId: string
): Promise<Payment[]> => {
  logger.debug('Fetching payments for student', { tenantId, studentId });

  // A person's payment history spans every enrollment they've ever had,
  // not just their current active one. program_type is included
  // (payments-phase1) so the history modal can show "Applied to:
  // <program>" per payment at zero extra cost - a plain additive column
  // on an already-joined table, not a new query or a new link.
  const result = await query(
    `SELECT p.*, e.student_id AS student_id, e.program_type AS program_type
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND e.student_id = $2
     ORDER BY p.date DESC`,
    [tenantId, studentId]
  );

  logger.debug('Successfully fetched student payments', {
    tenantId,
    studentId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

export const getPaymentsByLesson = async (
  tenantId: string,
  lessonId: string
): Promise<Payment[]> => {
  logger.debug('Fetching payments for lesson', { tenantId, lessonId });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND p.lesson_id = $2
     ORDER BY p.date DESC`,
    [tenantId, lessonId]
  );

  logger.debug('Successfully fetched lesson payments', {
    tenantId,
    lessonId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

export const getPaymentsByStatus = async (
  tenantId: string,
  status: 'pending' | 'completed' | 'failed' | 'refunded'
): Promise<Payment[]> => {
  logger.debug('Fetching payments by status', { tenantId, status });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND p.status = $2
     ORDER BY p.date DESC`,
    [tenantId, status]
  );

  logger.debug('Successfully fetched payments by status', {
    tenantId,
    status,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

export const getPaymentsByPaymentMethod = async (
  tenantId: string,
  paymentMethod: string
): Promise<Payment[]> => {
  logger.debug('Fetching payments by payment method', { tenantId, paymentMethod });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND p.payment_method = $2
     ORDER BY p.date DESC`,
    [tenantId, paymentMethod]
  );

  logger.debug('Successfully fetched payments by payment method', {
    tenantId,
    paymentMethod,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

/**
 * Resolves which enrollment a new payment for this student should attach
 * to - extracted from createPayment's own former inline logic (payment-
 * form-v2) so the quick-amounts endpoint powering the new Record Payment
 * form's chips can resolve the SAME enrollment createPayment itself will
 * actually use, instead of guessing or re-deriving a second definition.
 * Behavior is byte-for-byte unchanged from before the extraction - see
 * createPayment's own call site below, which now just calls this.
 *
 * Payments attach to the student's active driver_training enrollment when
 * one exists (Constraint A/D - at most one exists, and this is required
 * whenever a lessonId is given, since a lesson only ever belongs to a
 * driver_training enrollment). A DE-only student - no driver_training
 * enrollment at all - can be paid against their driver_education
 * enrollment instead, since DE has its own real course-fee balance (see
 * enrollmentService.createEnrollment's DE cost defaulting). A student
 * with NEITHER program throws - there is genuinely nothing to record a
 * payment against.
 */
export const resolveTargetEnrollmentForPayment = async (
  tenantId: string,
  studentId: string,
  hasLessonId: boolean,
  // Only used for the DE-branch "no genuine outstanding balance" warning
  // log below - undefined is fine for a caller (like the quick-amounts
  // endpoint) that only needs the resolved enrollment id, never the
  // insert-time amount.
  amount: number | undefined = undefined,
  dbQuery: typeof query = query
): Promise<string> => {
  const activeEnrollment = await getActiveDriverTrainingEnrollment(studentId, tenantId);
  if (activeEnrollment) {
    return activeEnrollment.id;
  }
  if (hasLessonId) {
    // A lesson-linked payment has nowhere to attach without a
    // driver_training enrollment - fall through to the same error rather
    // than silently attaching to an unrelated DE enrollment.
    throw new AppError('Student has no active driver_training enrollment', 400);
  }

  // Prefer a DE enrollment with a genuine outstanding balance (total_cost
  // minus confirmed payments so far) over just the most recent one - a
  // student with an old, already-paid-off DE enrollment and a newer one
  // still owing should attach to the one that's actually unpaid.
  // total_paid here is NET paid (payments-adjustments) - a DE enrollment
  // whose only payment was fully refunded/voided must be re-selected as
  // "genuinely outstanding" again, the same as if it had never been paid,
  // so a new payment doesn't silently attach to a DIFFERENT,
  // already-settled DE enrollment instead.
  const deEnrollmentResult = await dbQuery(
    `SELECT e.id,
            e.total_cost,
            COALESCE((
              SELECT SUM(GREATEST(0, p.amount - COALESCE(adj.total_adjusted, 0)))
              FROM payments p
              LEFT JOIN (
                SELECT payment_id, SUM(amount) AS total_adjusted
                FROM payment_adjustments GROUP BY payment_id
              ) adj ON adj.payment_id = p.id
              WHERE p.enrollment_id = e.id AND p.tenant_id = e.tenant_id AND p.status = 'confirmed'
            ), 0) AS total_paid
     FROM enrollments e
     WHERE e.student_id = $1 AND e.tenant_id = $2 AND e.program_type = 'driver_education'
     ORDER BY (e.total_cost IS NOT NULL AND e.total_cost > COALESCE((
                SELECT SUM(GREATEST(0, p2.amount - COALESCE(adj2.total_adjusted, 0)))
                FROM payments p2
                LEFT JOIN (
                  SELECT payment_id, SUM(amount) AS total_adjusted
                  FROM payment_adjustments GROUP BY payment_id
                ) adj2 ON adj2.payment_id = p2.id
                WHERE p2.enrollment_id = e.id AND p2.tenant_id = e.tenant_id AND p2.status = 'confirmed'
              ), 0)) DESC,
              e.created_at DESC
     LIMIT 1`,
    [studentId, tenantId]
  );
  if (deEnrollmentResult.rows.length === 0) {
    throw new AppError('Student has no active driver_training or driver_education enrollment', 400);
  }
  const deRow = deEnrollmentResult.rows[0];
  const deTotalCost = deRow.total_cost !== null ? Number(deRow.total_cost) : null;
  const deOutstanding = deTotalCost !== null ? deTotalCost - Number(deRow.total_paid) : null;
  if (deOutstanding !== null && deOutstanding <= 0 && amount !== undefined && amount > 0) {
    logger.warn('Recording a payment against a DE enrollment with no outstanding balance', {
      tenantId,
      studentId,
      enrollmentId: deRow.id,
    });
  }
  return deRow.id;
};

export interface PaymentQuickAmounts {
  // Cost of the single soonest scheduled lesson, net of credit already on
  // account (max(0, cost - credit)) - null when there is no scheduled
  // lesson at all. nextLessonDate is the raw lesson date (the frontend
  // formats it), also null in that case.
  nextLesson: { amount: number; date: string } | null;
  // Sum of ALL scheduled lessons' cost not yet covered by credit
  // (completed-unpaid lessons are covered first - see the comment on
  // getPaymentQuickAmounts below for why), plus how many of them are
  // still uncovered. 0/null when every scheduled lesson is already
  // covered or none exist.
  scheduledLessons: { amount: number; count: number } | null;
  // Sum of completed lessons' cost not yet covered by credit, plus how
  // many. 0/null when every completed lesson is already paid or none
  // exist.
  completedUnpaidLessons: { amount: number; count: number } | null;
  // The enrollment's own outstandingBalance (computePaymentSummary) -
  // "pay off everything owed on this course," independent of the
  // lesson-by-lesson breakdown above. null when not computable (matches
  // computePaymentSummary's own null case).
  remainingCourse: number | null;
}

/**
 * Powers the new Record Payment form's quick-amount chips (payment-form-
 * v2) - never a second definition of "paid"/"owed": totalPaid/
 * outstandingBalance come from enrollmentService's own computePaymentSummary,
 * and which lessons count at all comes from the one shared
 * utils/lessonCostFilter.ts (cancelled and no_show excluded, same as
 * every other student-cost figure in this app).
 *
 * Resolves the SAME enrollment createPayment itself would attach a new
 * payment to (resolveTargetEnrollmentForPayment above), so the chips a
 * staff member sees always describe the enrollment their payment will
 * actually land on - never a different, guessed-at one.
 *
 * Credit allocation model: this app has no per-lesson payment link
 * (payments attach to an ENROLLMENT, never a lesson - Constraint stays
 * unchanged here), so "what's still needed" per bucket is a derived
 * allocation, not a stored fact. Net paid is walked against cost-counted
 * lessons in a fixed priority order - completed-but-unpaid lessons first
 * (oldest date first, since they already happened and are the most
 * overdue), then scheduled lessons (soonest first) - consuming the paid
 * pool lesson-by-lesson. Whatever portion of a lesson's cost the pool
 * doesn't reach is "still needed" for that lesson; summed per bucket,
 * this gives scheduledLessons/completedUnpaidLessons their amounts.
 * nextLesson is the single soonest scheduled lesson specifically, using
 * the SAME running pool (so if completed-unpaid lessons and earlier
 * scheduled lessons have already exhausted the credit by the time the
 * walk reaches it, its own "still needed" amount is its full cost, not
 * a double-counted fresh allocation).
 */
export async function getPaymentQuickAmounts(tenantId: string, studentId: string): Promise<PaymentQuickAmounts> {
  const studentCheck = await query('SELECT id FROM students WHERE id = $1 AND tenant_id = $2', [studentId, tenantId]);
  if (studentCheck.rows.length === 0) {
    throw new AppError('Student not found or does not belong to this organization', 404);
  }

  const enrollmentId = await resolveTargetEnrollmentForPayment(tenantId, studentId, false);
  const enrollment = await getEnrollmentById(enrollmentId, tenantId);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  const lessonsResult = await query(
    `SELECT id, date, cost, status FROM lessons WHERE tenant_id = $1 AND enrollment_id = $2 ORDER BY date ASC, start_time ASC`,
    [tenantId, enrollmentId]
  );
  const allLessons = lessonsResult.rows.map((row) => ({
    id: row.id as string,
    date: row.date as string,
    cost: parseFloat(row.cost),
    status: row.status as 'scheduled' | 'completed' | 'cancelled' | 'no_show',
  }));
  const costCountedLessons = allLessons.filter((l) => isStudentCostCountedStatus(l.status));

  const netPaidResult = await query(
    `SELECT COALESCE(SUM(net_paid), 0) AS total_paid
     FROM (
       SELECT GREATEST(0, p.amount - COALESCE(adj.total_adjusted, 0)) AS net_paid
       FROM payments p
       LEFT JOIN (
         SELECT payment_id, SUM(amount) AS total_adjusted
         FROM payment_adjustments
         GROUP BY payment_id
       ) adj ON adj.payment_id = p.id
       WHERE p.tenant_id = $1 AND p.enrollment_id = $2 AND p.status = 'confirmed'
     ) net_payments`,
    [tenantId, enrollmentId]
  );
  const netPaid = parseFloat(netPaidResult.rows[0].total_paid);

  const paymentSummary = computePaymentSummary(
    { totalCost: enrollment.totalCost },
    costCountedLessons,
    netPaid
  );

  // Oldest-first for completed (most overdue first), soonest-first for
  // scheduled (already the sort order from the query above) - completed
  // lessons are never re-sorted since the query already orders by date
  // ascending for everything.
  const completedLessons = costCountedLessons.filter((l) => l.status === 'completed');
  const scheduledLessons = costCountedLessons.filter((l) => l.status === 'scheduled');

  let pool = netPaid;
  let completedUncoveredAmount = 0;
  let completedUncoveredCount = 0;
  for (const lesson of completedLessons) {
    const covered = Math.min(pool, lesson.cost);
    pool -= covered;
    const stillNeeded = round2(lesson.cost - covered);
    if (stillNeeded > 0) {
      completedUncoveredAmount = round2(completedUncoveredAmount + stillNeeded);
      completedUncoveredCount += 1;
    }
  }

  let scheduledUncoveredAmount = 0;
  let scheduledUncoveredCount = 0;
  let nextLesson: { amount: number; date: string } | null = null;
  for (const lesson of scheduledLessons) {
    const covered = Math.min(pool, lesson.cost);
    pool -= covered;
    const stillNeeded = round2(lesson.cost - covered);
    if (stillNeeded > 0) {
      scheduledUncoveredAmount = round2(scheduledUncoveredAmount + stillNeeded);
      scheduledUncoveredCount += 1;
    }
    if (nextLesson === null) {
      nextLesson = { amount: stillNeeded, date: lesson.date };
    }
  }

  return {
    nextLesson,
    scheduledLessons: scheduledUncoveredCount > 0
      ? { amount: scheduledUncoveredAmount, count: scheduledUncoveredCount }
      : null,
    completedUnpaidLessons: completedUncoveredCount > 0
      ? { amount: completedUncoveredAmount, count: completedUncoveredCount }
      : null,
    remainingCourse: paymentSummary.outstandingBalance,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Powers the new Record Payment form's "already recorded today" warning
 * (payment-form-v2) - a gentle, non-blocking nudge, never a hard block
 * (the task's own wording: "the user can still proceed"). Deliberately
 * server-side rather than a JS-side Date comparison against an already-
 * fetched payments list: this app just finished fixing a real bug class
 * where a `timestamp without time zone` column (payments.created_at) read
 * back into a JS Date and compared against "now" computed client-side can
 * silently land on the wrong side of a day/hour boundary under a
 * mismatched process/session timezone (see
 * adjustmentServiceRealDb.integration.test.ts's hostile-clock tests) -
 * letting Postgres compare created_at against its own now() avoids that
 * whole class of bug entirely, rather than re-introducing it here for a
 * brand new feature.
 *
 * "Last 24 hours" is a rolling window (not a calendar-day boundary), so
 * it is NOT timezone-sensitive the way a calendar-day comparison would
 * be - a rolling window is the same real duration regardless of which
 * zone is doing the looking. "School-local time" in the task's own
 * wording is satisfied for free here: Postgres's `now()` is the one true
 * instant regardless of timezone, and a rolling 24h window never needs
 * to ask "which calendar day is this" at all.
 */
export async function checkDuplicatePayment(
  tenantId: string,
  studentId: string,
  amount: number,
  paymentMethod: string
): Promise<{ isDuplicate: boolean; amount: number | null }> {
  const result = await query(
    `SELECT p.amount
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1
       AND e.student_id = $2
       AND p.status = 'confirmed'
       AND p.amount = $3
       AND p.payment_method = $4
       AND p.created_at >= now() - interval '24 hours'
     ORDER BY p.created_at DESC
     LIMIT 1`,
    [tenantId, studentId, amount, paymentMethod]
  );

  if (result.rows.length === 0) {
    return { isDuplicate: false, amount: null };
  }
  return { isDuplicate: true, amount: parseFloat(result.rows[0].amount) };
}

export const createPayment = async (
  tenantId: string,
  data: any,
  userId?: string,
  // Optional transactional client - defaults to the module-level query
  // function, so every existing caller is unaffected (same behavior, no
  // signature break). Only a caller that needs this insert to participate
  // in a wider BEGIN/COMMIT (e.g. feeFlagService's batch-paid action)
  // passes its own client here.
  dbQuery: typeof query = query
): Promise<Payment> => {
  logger.info('Creating new payment', {
    tenantId,
    studentId: data.studentId,
    amount: data.amount,
    paymentMethod: data.paymentMethod || 'cash',
  });

  try {
    // Validate that student belongs to tenant
    const studentCheck = await dbQuery(
      'SELECT id FROM students WHERE id = $1 AND tenant_id = $2',
      [data.studentId, tenantId]
    );
    if (studentCheck.rows.length === 0) {
      logger.error('Student not found for payment', undefined, {
        tenantId,
        studentId: data.studentId,
      });
      throw new AppError('Student not found or does not belong to this organization', 404);
    }

    const targetEnrollmentId = await resolveTargetEnrollmentForPayment(
      tenantId,
      data.studentId,
      Boolean(data.lessonId),
      Number(data.amount),
      dbQuery
    );

    // If lesson_id provided, validate it belongs to tenant and student
    if (data.lessonId) {
      const lessonCheck = await dbQuery(
        `SELECT l.id FROM lessons l
         JOIN enrollments e ON e.id = l.enrollment_id
         WHERE l.id = $1 AND l.tenant_id = $2 AND e.student_id = $3`,
        [data.lessonId, tenantId, data.studentId]
      );
      if (lessonCheck.rows.length === 0) {
        logger.error('Lesson not found for payment', undefined, {
          tenantId,
          lessonId: data.lessonId,
          studentId: data.studentId,
        });
        throw new AppError('Lesson not found or does not belong to this student', 404);
      }
    }

    // payments-dates-and-cards: defaults to the TENANT's own school-local
    // "today" (tenantToday), never new Date() - a JS Date written into
    // this plain `date` column stores whatever calendar date
    // new Date()'s real UTC instant falls on, which is a day AHEAD of
    // the tenant's own date for several hours each evening in any US
    // timezone (e.g. 9pm Pacific = already past midnight UTC). The vast
    // majority of callers already pass an explicit data.date (every
    // frontend entry point does, via PaymentModal's own tenantNow.today
    // default - see that component's own fix for the identical bug) -
    // this fallback exists only for callers that omit it entirely (e.g.
    // this file's own tests, or a future direct API caller).
    const paymentDate = data.date || await (async () => {
      const tenantSettings = await getTenantSettings(tenantId);
      return tenantToday(resolveTenantTimezone(tenantSettings?.timezone));
    })();

    const result = await dbQuery(
      `INSERT INTO payments (
        tenant_id, enrollment_id, amount, payment_method, payment_type,
        date, status, bsv_transaction_id, notes, reference_number, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *, $12 AS student_id`,
      [
        tenantId,
        targetEnrollmentId,
        data.amount,
        data.paymentMethod || 'cash',
        data.paymentType || 'lesson_payment',
        paymentDate,
        data.status || 'confirmed',
        data.bsvTransactionId || null,
        data.notes || null,
        data.referenceNumber || null,
        userId || null,
        data.studentId,
      ]
    );

    const payment = keysToCamel(result.rows[0]) as Payment;
    logger.info('Successfully created payment', {
      tenantId,
      paymentId: payment.id,
      amount: payment.amount,
      status: payment.status,
    });

    // Anchor BDP_PAY action through the ledger seam (noop unless BSV_ENABLED)
    try {
      await ledger.recordPayment({
        tenantId,
        paymentId: payment.id,
        amountCents: Math.round(payment.amount * 100),
        method: payment.paymentMethod,
      });
    } catch (ledgerError) {
      logger.warn('Ledger anchor failed (non-blocking)', {
        tenantId,
        paymentId: payment.id,
        error: ledgerError instanceof Error ? ledgerError.message : String(ledgerError),
      });
    }

    return payment;
  } catch (error) {
    logger.error('Failed to create payment', error as Error, {
      tenantId,
      studentId: data.studentId,
      amount: data.amount,
    });
    throw error;
  }
};

// Fields that touch what actually happened and how much - immutable once
// a payment is confirmed (payments-adjustments). Before this, PUT
// /payments/:id let owner/admin/staff flip any of these in place, which
// bypassed both the append-only adjustment model (e.g. setting status to
// 'refunded' directly) and the owner/admin-only gate on refund/void (a
// staff member could lower an amount with no adjustment trail at all).
// pending/failed payments are explicitly exempted - nothing in this
// codebase has ever relied on PUT /payments/:id to transition them
// (markPaymentAsReceived is the dedicated pending-to-confirmed route),
// but the lock only needs to cover the state that actually has money or a
// customer-facing record attached to it, so pending/failed keep the prior
// free-edit behavior unchanged.
const IMMUTABLE_ONCE_CONFIRMED_FIELDS: (keyof Payment)[] = [
  'amount',
  'date',
  'paymentMethod',
  'status',
  'bsvTransactionId',
];

export const updatePayment = async (
  id: string,
  tenantId: string,
  data: Partial<Payment>,
  userId?: string
): Promise<Payment> => {
  logger.info('Updating payment', {
    tenantId,
    paymentId: id,
    updateFields: Object.keys(data),
  });

  try {
    const lockedFieldRequested = IMMUTABLE_ONCE_CONFIRMED_FIELDS.some(
      (field) => data[field] !== undefined
    );

    if (lockedFieldRequested) {
      const existingResult = await query(
        'SELECT status FROM payments WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );

      if (existingResult.rows.length === 0) {
        logger.warn('Payment not found for update', { tenantId, paymentId: id });
        throw new AppError('Payment not found', 404);
      }

      if (existingResult.rows[0].status === 'confirmed') {
        logger.warn('Rejected attempt to edit a locked field on a confirmed payment', {
          tenantId,
          paymentId: id,
          requestedFields: Object.keys(data),
        });
        throw new AppError(
          data.amount !== undefined
            ? "A confirmed payment's amount cannot be changed. Record a new payment for the correct amount, and use Void or Refund to correct this one."
            : "A confirmed payment's date, method, status, and transaction ID cannot be changed once confirmed. Use Void or Refund to correct it.",
          409
        );
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.amount !== undefined) {
      fields.push(`amount = $${paramCount++}`);
      values.push(data.amount);
    }
    if (data.paymentMethod !== undefined) {
      fields.push(`payment_method = $${paramCount++}`);
      values.push(data.paymentMethod);
    }
    if (data.date !== undefined) {
      fields.push(`date = $${paramCount++}`);
      values.push(data.date);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.bsvTransactionId !== undefined) {
      fields.push(`bsv_transaction_id = $${paramCount++}`);
      values.push(data.bsvTransactionId);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(data.notes);
    }
    if (data.referenceNumber !== undefined) {
      fields.push(`reference_number = $${paramCount++}`);
      values.push(data.referenceNumber);
    }
    if (userId) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(userId);
    }

    if (fields.length === 0) {
      logger.warn('No fields to update in payment', { tenantId, paymentId: id });
      throw new AppError('No fields to update', 400);
    }

    values.push(id, tenantId);

    const result = await query(
      `UPDATE payments SET ${fields.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *, (SELECT e.student_id FROM enrollments e WHERE e.id = payments.enrollment_id) AS student_id`,
      values
    );

    if (result.rows.length === 0) {
      logger.warn('Payment not found for update', { tenantId, paymentId: id });
      throw new AppError('Payment not found', 404);
    }

    logger.info('Payment updated successfully', {
      tenantId,
      paymentId: id,
      updatedFields: Object.keys(data),
    });

    return keysToCamel(result.rows[0]) as Payment;
  } catch (error) {
    logger.error('Failed to update payment', error as Error, {
      tenantId,
      paymentId: id,
    });
    throw error;
  }
};

export const markPaymentAsReceived = async (
  id: string,
  tenantId: string,
  bsvTransactionId?: string
): Promise<Payment> => {
  logger.info('Marking payment as received', {
    tenantId,
    paymentId: id,
    bsvTransactionId: bsvTransactionId || 'none',
  });

  const fields: string[] = ['status = $3', 'confirmation_date = NOW()'];
  const values: any[] = [id, tenantId, 'confirmed'];
  let paramCount = 4;

  if (bsvTransactionId) {
    fields.push(`bsv_transaction_id = $${paramCount++}`);
    values.push(bsvTransactionId);
  }

  const result = await query(
    `UPDATE payments SET ${fields.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING *, (SELECT e.student_id FROM enrollments e WHERE e.id = payments.enrollment_id) AS student_id`,
    values
  );

  if (result.rows.length === 0) {
    logger.warn('Payment not found for marking as received', { tenantId, paymentId: id });
    throw new AppError('Payment not found', 404);
  }

  logger.info('Payment marked as received successfully', {
    tenantId,
    paymentId: id,
  });

  return keysToCamel(result.rows[0]) as Payment;
};

// refundPayment (flipped payments.status to 'refunded' in place) was
// removed - payments-adjustments replaces it entirely with
// adjustmentService.createAdjustment, which inserts an append-only
// payment_adjustments row rather than mutating the original payment.
// POST /payments/:id/refund now requires a body (amount, reasonCode,
// note) and calls that function directly from the controller - there is
// no longer a paymentService-level refund function to call with just an
// id, since a refund is no longer representable as a single id-only
// operation.

/**
 * Hard delete on a payment is permanently removed - an append-only
 * correction model (payment_adjustments) is incompatible with a payment
 * row ever disappearing outright. Always 409s, pointing the caller at
 * Void (which still leaves a full, permanent record of both the original
 * payment and the correction) as the real way to "undo" a payment now.
 */
export const deletePayment = async (
  _id: string,
  _tenantId: string
): Promise<never> => {
  throw new AppError(
    'Payments can no longer be deleted. Use Void instead - it keeps a permanent record of the correction.',
    409
  );
};
