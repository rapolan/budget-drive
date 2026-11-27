/**
 * Payment Reporting Service
 *
 * Payments Phase 1 (additive only - no migrations, no changes to how
 * payments are created, refunded, or deleted). Everything here READS
 * existing `payments`/`enrollments`/`lessons` data and derives new
 * reporting views on top of it - paymentService.ts's own create/update/
 * refund/delete functions are never called or modified from this file.
 *
 * Kept as its own file (not added to paymentService.ts) specifically so
 * that boundary is structurally obvious, not just a convention to
 * remember: nothing here can accidentally touch write paths because this
 * file imports no write function from paymentService at all.
 */

import { query } from '../config/database';
import { computeReceiptNumber } from './receiptService';
import { STUDENT_COST_SQL_CONDITION } from '../utils/lessonCostFilter';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CollectedByMethod {
  paymentMethod: string;
  amount: number;
  count: number;
}

export interface PaymentPeriodSummary {
  start: string;
  end: string;
  collected: { amount: number; count: number };
  refunded: { amount: number; count: number };
  net: number;
  // Point-in-time balance, not period-scoped - "the existing combined
  // logic" per the task, i.e. the same across-all-enrollments total every
  // student's own paymentSummary.outstandingBalance already sums to when
  // added up tenant-wide. Deliberately NOT filtered by the period's date
  // range (a balance owed doesn't reset at a period boundary).
  outstanding: number;
  // Same point-in-time-not-period-scoped reasoning as outstanding above -
  // the sum of every positive creditBalance across every enrollment in
  // the tenant right now.
  paidNotYetScheduled: number;
  collectedByMethod: CollectedByMethod[];
}

/**
 * Collected/Refunded/Net for confirmed-status payments dated within
 * [start, end] (inclusive, tenant's own calendar dates - the caller is
 * responsible for resolving "today"/"this week"/"this month"/a custom
 * range into start/end strings via tenantTime.ts helpers; this function
 * does no timezone work itself, matching daysBetweenTenantDates's own
 * "pure calendar-day arithmetic on two already-unambiguous strings"
 * convention).
 */
export async function getPaymentPeriodSummary(
  tenantId: string,
  start: string,
  end: string
): Promise<PaymentPeriodSummary> {
  // "Collected" stays the gross amount of confirmed payments DATED in the
  // period - what actually came in that day, unaffected by a later
  // refund/void (which is its own dated event, accounted for separately
  // below). A payment refunded/voided after the period it was collected
  // in still correctly shows as collected in that earlier period.
  const collectedResult = await query(
    `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
     FROM payments
     WHERE tenant_id = $1 AND status = 'confirmed' AND date >= $2 AND date <= $3`,
    [tenantId, start, end]
  );
  // "Refunded" (payments-adjustments) now counts by the ADJUSTMENT's own
  // created_at date, not the original payment's date - a refund issued
  // today against a payment collected last month is a THIS period event
  // for reporting purposes, per the task's explicit instruction. Covers
  // both adjustment_type values (refund AND void - both return/cancel
  // money the same way for this figure) PLUS any legacy payment row the
  // old flip-status-in-place flow already marked status = 'refunded'
  // before this migration - counted by that payment's own `date` column,
  // since no adjustment row exists for it to carry a separate date
  // (migration 007's own comment: legacy rows are never backfilled with
  // a matching adjustment).
  const refundedResult = await query(
    `SELECT COALESCE(SUM(amount), 0) AS amount, COALESCE(COUNT(*), 0) AS count FROM (
       SELECT amount FROM payment_adjustments
       WHERE tenant_id = $1 AND created_at::date >= $2 AND created_at::date <= $3
       UNION ALL
       SELECT amount FROM payments
       WHERE tenant_id = $1 AND status = 'refunded' AND date >= $2 AND date <= $3
     ) refunded_events`,
    [tenantId, start, end]
  );
  const byMethodResult = await query(
    `SELECT payment_method, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
     FROM payments
     WHERE tenant_id = $1 AND status = 'confirmed' AND date >= $2 AND date <= $3
     GROUP BY payment_method
     ORDER BY amount DESC`,
    [tenantId, start, end]
  );

  // Point-in-time, tenant-wide outstanding/credit totals - same totalCost
  // derivation computePaymentSummary already uses per-enrollment (1:
  // enrollment.total_cost override if set, else 2: sum of non-cancelled
  // lesson costs, else 3: not computable), just aggregated directly in SQL
  // across every enrollment at once rather than looping per-enrollment in
  // application code (this tenant-wide total doesn't need the per-
  // enrollment progress/classroom-attendance work attachProgressAndPayments
  // also does, so it isn't reused here).
  //
  // Joined to students and filtered to archived_at IS NULL to match
  // getAllStudents' own scope exactly (studentService.ts) - without this,
  // an archived student's still-outstanding enrollment balance would be
  // summed in here but never appear in the Payments page's own
  // student-list-derived "Total Outstanding" total, producing two
  // different numbers for what is supposed to be the same figure. This
  // was found and fixed as a real discrepancy, not a hypothetical: a
  // seeded archived student with a $150 unpaid enrollment caused exactly
  // that drift.
  //
  // payment_totals now sums NET paid (payments-adjustments) - same
  // per-payment GREATEST(0, amount - adjustments) floor as
  // enrollmentService.attachProgressAndPayments's identical query.
  const balancesResult = await query(
    `WITH lesson_totals AS (
       SELECT enrollment_id, SUM(cost) AS lesson_cost_sum
       FROM lessons
       WHERE tenant_id = $1 AND ${STUDENT_COST_SQL_CONDITION}
       GROUP BY enrollment_id
     ),
     payment_totals AS (
       SELECT enrollment_id, SUM(net_paid) AS total_paid
       FROM (
         SELECT p.enrollment_id,
                GREATEST(0, p.amount - COALESCE(adj.total_adjusted, 0)) AS net_paid
         FROM payments p
         LEFT JOIN (
           SELECT payment_id, SUM(amount) AS total_adjusted
           FROM payment_adjustments
           GROUP BY payment_id
         ) adj ON adj.payment_id = p.id
         WHERE p.tenant_id = $1 AND p.status = 'confirmed'
       ) net_payments
       GROUP BY enrollment_id
     ),
     enrollment_costs AS (
       SELECT
         e.id,
         COALESCE(e.total_cost, lt.lesson_cost_sum) AS total_cost,
         COALESCE(pt.total_paid, 0) AS total_paid
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN lesson_totals lt ON lt.enrollment_id = e.id
       LEFT JOIN payment_totals pt ON pt.enrollment_id = e.id
       WHERE e.tenant_id = $1 AND s.archived_at IS NULL
     )
     SELECT
       COALESCE(SUM(GREATEST(0, total_cost - total_paid)) FILTER (WHERE total_cost IS NOT NULL), 0) AS outstanding,
       COALESCE(SUM(GREATEST(0, total_paid - total_cost)) FILTER (WHERE total_cost IS NOT NULL), 0) AS credit
     FROM enrollment_costs`,
    [tenantId]
  );

  const balances = balancesResult.rows[0];

  return {
    start,
    end,
    collected: {
      amount: round2(parseFloat(collectedResult.rows[0].amount)),
      count: parseInt(collectedResult.rows[0].count, 10),
    },
    refunded: {
      amount: round2(parseFloat(refundedResult.rows[0].amount)),
      count: parseInt(refundedResult.rows[0].count, 10),
    },
    net: round2(
      parseFloat(collectedResult.rows[0].amount) - parseFloat(refundedResult.rows[0].amount)
    ),
    outstanding: round2(parseFloat(balances.outstanding)),
    paidNotYetScheduled: round2(parseFloat(balances.credit)),
    collectedByMethod: byMethodResult.rows.map((row) => ({
      paymentMethod: row.payment_method,
      amount: round2(parseFloat(row.amount)),
      count: parseInt(row.count, 10),
    })),
  };
}

export interface WhoOwesYouRow {
  studentId: string;
  studentName: string;
  enrollmentId: string;
  amountOwed: number;
  // The oldest unpaid COMPLETED lesson's date - "unpaid" here means the
  // enrollment this lesson belongs to currently has a positive
  // outstanding balance; age buckets are measured from this date, not
  // from when the balance first appeared (there is no row recording
  // that), per the task's instruction to state the derivation in the PR.
  oldestUnpaidLessonDate: string;
  ageBucket: '0-30' | '31-60' | '61+';
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  // Payments-adjustments: when set, the frontend shows an amber "Payment
  // arrangement" badge instead of the red age-bucket badge for this row.
  paymentArrangement: { setAt: string; setByName: string | null; note: string | null } | null;
}

/**
 * "Who owes you": enrollments with a positive outstanding balance, aged by
 * the oldest COMPLETED lesson (lessons that have already happened - a
 * scheduled future lesson's cost doesn't make someone "owe" yet, it just
 * contributes to a quoted total). Each row also carries the date/amount of
 * the student's last payment, so an installment payer (regularly paying
 * something, just not enough yet to clear a large package) doesn't read
 * as identical to someone who has paid nothing in months.
 *
 * Excludes archived students (s.archived_at IS NULL), matching
 * getAllStudents' own scope (studentService.ts) - an archived student
 * should not show up in a live "who owes you" worklist even if their
 * enrollment technically still has a balance.
 */
export async function getWhoOwesYou(tenantId: string): Promise<WhoOwesYouRow[]> {
  const result = await query(
    `WITH lesson_totals AS (
       SELECT enrollment_id, SUM(cost) AS lesson_cost_sum
       FROM lessons
       WHERE tenant_id = $1 AND ${STUDENT_COST_SQL_CONDITION}
       GROUP BY enrollment_id
     ),
     payment_totals AS (
       SELECT enrollment_id, SUM(net_paid) AS total_paid
       FROM (
         SELECT p.enrollment_id,
                GREATEST(0, p.amount - COALESCE(adj.total_adjusted, 0)) AS net_paid
         FROM payments p
         LEFT JOIN (
           SELECT payment_id, SUM(amount) AS total_adjusted
           FROM payment_adjustments
           GROUP BY payment_id
         ) adj ON adj.payment_id = p.id
         WHERE p.tenant_id = $1 AND p.status = 'confirmed'
       ) net_payments
       GROUP BY enrollment_id
     ),
     oldest_unpaid_completed AS (
       SELECT enrollment_id, MIN(date) AS oldest_date
       FROM lessons
       WHERE tenant_id = $1 AND status = 'completed'
       GROUP BY enrollment_id
     ),
     last_payment AS (
       SELECT DISTINCT ON (enrollment_id) enrollment_id, date, amount
       FROM payments
       WHERE tenant_id = $1 AND status = 'confirmed'
       ORDER BY enrollment_id, date DESC, created_at DESC
     )
     SELECT
       e.id AS enrollment_id,
       e.student_id,
       s.full_name AS student_name,
       COALESCE(e.total_cost, lt.lesson_cost_sum) AS total_cost,
       COALESCE(pt.total_paid, 0) AS total_paid,
       ouc.oldest_date,
       lp.date AS last_payment_date,
       lp.amount AS last_payment_amount,
       e.payment_arrangement_set_at,
       e.payment_arrangement_note,
       arr_user.full_name AS payment_arrangement_set_by_name
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN lesson_totals lt ON lt.enrollment_id = e.id
     LEFT JOIN payment_totals pt ON pt.enrollment_id = e.id
     LEFT JOIN oldest_unpaid_completed ouc ON ouc.enrollment_id = e.id
     LEFT JOIN last_payment lp ON lp.enrollment_id = e.id
     LEFT JOIN users arr_user ON arr_user.id = e.payment_arrangement_set_by
     WHERE e.tenant_id = $1
       AND s.archived_at IS NULL
       AND COALESCE(e.total_cost, lt.lesson_cost_sum) IS NOT NULL
       AND COALESCE(e.total_cost, lt.lesson_cost_sum) - COALESCE(pt.total_paid, 0) > 0
       AND ouc.oldest_date IS NOT NULL`,
    [tenantId]
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  return result.rows
    .map((row) => {
      const amountOwed = round2(parseFloat(row.total_cost) - parseFloat(row.total_paid));
      const oldestDate = new Date(row.oldest_date).toISOString().slice(0, 10);
      const ageDays = Math.floor(
        (new Date(todayIso).getTime() - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      const ageBucket: WhoOwesYouRow['ageBucket'] =
        ageDays <= 30 ? '0-30' : ageDays <= 60 ? '31-60' : '61+';

      return {
        studentId: row.student_id,
        studentName: row.student_name,
        enrollmentId: row.enrollment_id,
        amountOwed,
        oldestUnpaidLessonDate: oldestDate,
        ageBucket,
        lastPaymentDate: row.last_payment_date
          ? new Date(row.last_payment_date).toISOString().slice(0, 10)
          : null,
        lastPaymentAmount: row.last_payment_amount !== null ? round2(parseFloat(row.last_payment_amount)) : null,
        // Payments-adjustments: a row on an agreed arrangement shows an
        // amber "Payment arrangement" badge instead of the red age-bucket
        // badge (ageBucket is still computed/returned above regardless -
        // the frontend decides which badge to render based on this flag,
        // so the underlying age data is never lost even when hidden).
        paymentArrangement: row.payment_arrangement_set_at
          ? {
              setAt: new Date(row.payment_arrangement_set_at).toISOString(),
              setByName: row.payment_arrangement_set_by_name,
              note: row.payment_arrangement_note,
            }
          : null,
      };
    })
    .sort((a, b) => b.amountOwed - a.amountOwed);
}

export interface ReceiptAdjustmentLine {
  adjustmentType: 'refund' | 'void';
  amount: number;
  reasonCode: string;
  createdAt: string;
  createdByName: string | null;
}

export interface PaymentReceiptData {
  paymentId: string;
  receiptNumber: string;
  date: string;
  studentId: string;
  studentName: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  // "Applied to" is the enrollment/program only - there is no reliable,
  // cheap way to attribute a payment to specific lessons today (see
  // docs/ARCHITECTURE.md's payments-phase1 section: related_lesson_ids/
  // invoice_id exist as columns but are never read or written anywhere in
  // this codebase). Never guess at specific lessons here.
  appliedToProgramType: string;
  // The enrollment's running totals AT READ TIME (not frozen at the
  // moment this payment was made) - "remaining credit" per the task. Both
  // now reflect NET paid (payments-adjustments) across the enrollment.
  enrollmentTotalPaid: number;
  enrollmentOutstandingBalance: number | null;
  enrollmentCreditBalance: number | null;
  // Payments-adjustments: this payment's own refund/void lines (empty for
  // an unadjusted payment, which renders exactly as it did before this
  // phase) and its own net paid after them. The receipt number is never
  // recomputed or changed by an adjustment - it is derived from the
  // payment's own immutable id, unaffected by anything that happens to it
  // later.
  adjustments: ReceiptAdjustmentLine[];
  netPaid: number;
}

/**
 * Everything a printable receipt needs for one payment. Looked up by
 * (paymentId, tenantId) together - the derived receiptNumber is a display
 * label, never a lookup key on its own (see receiptService.ts's own doc
 * comment on tenant-scoping).
 */
export async function getPaymentReceiptData(
  tenantId: string,
  paymentId: string
): Promise<PaymentReceiptData | null> {
  const paymentResult = await query(
    `SELECT p.id, p.date, p.amount, p.payment_method, p.reference_number, p.enrollment_id,
            e.student_id, e.program_type, e.total_cost,
            s.full_name AS student_name
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN students s ON s.id = e.student_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [paymentId, tenantId]
  );

  if (paymentResult.rows.length === 0) {
    return null;
  }

  const row = paymentResult.rows[0];
  const paymentAmount = round2(parseFloat(row.amount));

  const lessonTotalsResult = await query(
    `SELECT COALESCE(SUM(cost), 0) AS lesson_cost_sum
     FROM lessons
     WHERE tenant_id = $1 AND enrollment_id = $2 AND ${STUDENT_COST_SQL_CONDITION}`,
    [tenantId, row.enrollment_id]
  );
  // NET paid across the whole enrollment (payments-adjustments) - same
  // per-payment GREATEST(0, amount - adjustments) floor as every other
  // balance computation in this codebase.
  const paidTotalResult = await query(
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
    [tenantId, row.enrollment_id]
  );
  // This payment's OWN adjustment lines - shown on the receipt in order,
  // with who made each one (for the owner's own records; never shown as
  // a claim about what the student was told).
  const adjustmentsResult = await query(
    `SELECT pa.adjustment_type, pa.amount, pa.reason_code, pa.created_at, u.full_name AS created_by_name
     FROM payment_adjustments pa
     LEFT JOIN users u ON u.id = pa.created_by
     WHERE pa.tenant_id = $1 AND pa.payment_id = $2
     ORDER BY pa.created_at ASC`,
    [tenantId, paymentId]
  );

  const totalCost = row.total_cost !== null
    ? parseFloat(row.total_cost)
    : parseFloat(lessonTotalsResult.rows[0].lesson_cost_sum) > 0
      ? parseFloat(lessonTotalsResult.rows[0].lesson_cost_sum)
      : null;
  const totalPaid = round2(parseFloat(paidTotalResult.rows[0].total_paid));
  const outstandingBalance = totalCost !== null ? round2(Math.max(0, totalCost - totalPaid)) : null;
  const creditBalance = totalCost !== null ? round2(Math.max(0, totalPaid - totalCost)) : null;

  const adjustments: ReceiptAdjustmentLine[] = adjustmentsResult.rows.map((a) => ({
    adjustmentType: a.adjustment_type,
    amount: round2(parseFloat(a.amount)),
    reasonCode: a.reason_code,
    createdAt: new Date(a.created_at).toISOString(),
    createdByName: a.created_by_name,
  }));
  const totalAdjustedForThisPayment = round2(adjustments.reduce((sum, a) => sum + a.amount, 0));
  const netPaidForThisPayment = round2(Math.max(0, paymentAmount - totalAdjustedForThisPayment));

  return {
    paymentId: row.id,
    receiptNumber: computeReceiptNumber(tenantId, row.id),
    date: new Date(row.date).toISOString().slice(0, 10),
    studentId: row.student_id,
    studentName: row.student_name,
    amount: paymentAmount,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number,
    appliedToProgramType: row.program_type,
    enrollmentTotalPaid: totalPaid,
    enrollmentOutstandingBalance: outstandingBalance,
    enrollmentCreditBalance: creditBalance,
    adjustments,
    netPaid: netPaidForThisPayment,
  };
}

export interface PaymentExportRow {
  // 'payment' for an original payment row, 'adjustment' for a refund/void
  // line (payments-adjustments) - included in the same export per the
  // task's own instruction, each on its own line, never merged into the
  // payment's row (an adjustment has its own date, reason, and amount
  // that don't fit the payment-row shape without losing information).
  rowType: 'payment' | 'adjustment';
  date: string;
  studentName: string;
  amount: number;
  paymentMethod: string | null;
  status: string;
  reasonCode: string | null;
  referenceNumber: string | null;
  receiptNumber: string;
}

/**
 * Payments within [start, end] (inclusive), for CSV export. Every status
 * is included (not just confirmed) - an export for reconciliation needs
 * to show refunded/pending/failed rows too, not silently drop them.
 *
 * Adjustment (refund/void) lines dated within the SAME range (by the
 * adjustment's own created_at, matching getPaymentPeriodSummary's own
 * "refunded counted by the adjustment's date" rule) are included as
 * their own rows, carrying the ORIGINAL payment's receipt number (an
 * adjustment has no receipt number of its own - it corrects a specific
 * payment, identified by that payment's number) and student name.
 */
export async function getPaymentsForExport(
  tenantId: string,
  start: string,
  end: string
): Promise<PaymentExportRow[]> {
  const result = await query(
    `SELECT p.id, p.date, p.amount, p.payment_method, p.status, p.reference_number,
            s.full_name AS student_name
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN students s ON s.id = e.student_id
     WHERE p.tenant_id = $1 AND p.date >= $2 AND p.date <= $3
     ORDER BY p.date ASC`,
    [tenantId, start, end]
  );

  const paymentRows: PaymentExportRow[] = result.rows.map((row) => ({
    rowType: 'payment',
    date: new Date(row.date).toISOString().slice(0, 10),
    studentName: row.student_name,
    amount: round2(parseFloat(row.amount)),
    paymentMethod: row.payment_method,
    status: row.status,
    reasonCode: null,
    referenceNumber: row.reference_number,
    receiptNumber: computeReceiptNumber(tenantId, row.id),
  }));

  const adjustmentsResult = await query(
    `SELECT pa.id, pa.payment_id, pa.adjustment_type, pa.amount, pa.reason_code, pa.created_at,
            p.id AS original_payment_id, s.full_name AS student_name
     FROM payment_adjustments pa
     JOIN payments p ON p.id = pa.payment_id
     JOIN enrollments e ON e.id = p.enrollment_id
     JOIN students s ON s.id = e.student_id
     WHERE pa.tenant_id = $1 AND pa.created_at::date >= $2 AND pa.created_at::date <= $3
     ORDER BY pa.created_at ASC`,
    [tenantId, start, end]
  );
  const adjustmentRows: PaymentExportRow[] = adjustmentsResult.rows.map((row) => ({
    rowType: 'adjustment',
    date: new Date(row.created_at).toISOString().slice(0, 10),
    studentName: row.student_name,
    amount: round2(parseFloat(row.amount)),
    paymentMethod: null,
    status: row.adjustment_type,
    reasonCode: row.reason_code,
    referenceNumber: null,
    receiptNumber: computeReceiptNumber(tenantId, row.original_payment_id),
  }));

  return [...paymentRows, ...adjustmentRows].sort((a, b) => a.date.localeCompare(b.date));
}
