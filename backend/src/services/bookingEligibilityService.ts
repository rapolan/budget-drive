/**
 * Booking Eligibility Service (payment-before-booking)
 *
 * Enforces the tenant's optional "require payment before booking" setting
 * (tenant_settings.require_payment_before_booking, migration 008, OFF by
 * default): a NEW lesson cannot be created unless the student's active
 * driver_training enrollment has enough credit to cover it.
 *
 * credit = net paid on the enrollment (confirmed payments minus
 *          adjustments/refunds/voids, via the SAME SQL
 *          enrollmentService.ts's attachProgressAndPayments already uses -
 *          not a second definition of "paid")
 *          minus the cost of the enrollment's STUDENT-COST-COUNTED
 *          lessons (see utils/lessonCostFilter.ts - excludes both
 *          'cancelled' and 'no_show')
 *
 * allow if credit >= the new lesson's own cost.
 *
 * Deliberately reuses enrollmentService.ts's exported computePaymentSummary
 * (same totalPaid-minus-totalCost math that already drives the "Paid, Not
 * Yet Scheduled"/outstanding-balance figures everywhere else in this app)
 * rather than inventing a second "credit" calculation - computePaymentSummary
 * already returns `creditBalance = max(0, totalPaid - totalCost)` for
 * exactly this purpose; this service only adds "is that credit >= the cost
 * of the lesson about to be booked."
 *
 * What this check NEVER reads: fee_flags. Cancellation/no-show fees are a
 * notice only, collected by the instructor in cash, never a payment or a
 * school-side credit - see feeFlagService.ts's own doc comment ("this
 * never touches payments/payment_adjustments"). A 'no_show' lesson's own
 * `cost` is excluded from the enrollment's cost sum below, the same as a
 * cancelled lesson's - a deliberate owner decision: the student already
 * paid for the no-show lesson, so its cost returns to their credit and
 * they can rebook without paying again. The no-show FEE (a separate cash
 * matter between student and instructor, tracked in fee_flags) is never
 * read here either way - this service never imports or queries fee_flags
 * at all, so excluding a no-show lesson's cost from credit cannot be
 * confused with reading or reducing by its fee amount.
 *
 * Package-priced enrollments: investigated before implementing (see this
 * branch's own commit/PR description for the full writeup). Conclusion: no
 * package-priced driver_training enrollment exists in this codebase today
 * in schema, seed data, or docs - driver_training enrollments always have
 * `enrollments.total_cost IS NULL` (computePaymentSummary derives totalCost
 * from the sum of non-cancelled lessons' own `cost` instead), and
 * driver_education enrollments (the only ones that DO set `total_cost`,
 * a flat course fee) have no `lessons` rows at all, so there is nothing
 * for this feature to gate for DE. The task's own conservative fallback -
 * "block only when net paid is 0 and no arrangement" - is implemented
 * below anyway (defensive, cheap, and correct if a future change ever DOES
 * introduce a driver_training enrollment with an explicit `total_cost`
 * override and $0-costed lessons), but is not reachable by any data this
 * app can currently produce.
 */

import { PoolClient } from 'pg';
import { query } from '../config/database';
import { computePaymentSummary } from './enrollmentService';
import { createLogger } from '../utils/logger';

const logger = createLogger('BookingEligibilityService');

export interface BookingEligibilityResult {
  allowed: boolean;
  // Payment arrangement always allows, regardless of credit - surfaced so
  // callers (the booking-eligibility GET endpoint) can show the blue
  // "Payment arrangement on file" note instead of a red warning banner.
  hasPaymentArrangement: boolean;
}

/**
 * The actual eligibility computation, given an enrollment row and the
 * lessons already booked against it. Pure (no I/O) so it can be unit
 * tested directly against constructed fixtures, and so the row-locked
 * caller below and the read-only preview/GET-endpoint caller can share
 * one implementation without either one needing its own copy of the math.
 */
export function evaluateBookingEligibility(
  enrollment: { totalCost: number | null; paymentArrangementSetAt: Date | string | null },
  existingLessons: { status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'; cost: number }[],
  netPaid: number,
  newLessonCost: number
): BookingEligibilityResult {
  if (enrollment.paymentArrangementSetAt) {
    return { allowed: true, hasPaymentArrangement: true };
  }

  const summary = computePaymentSummary(
    { totalCost: enrollment.totalCost },
    existingLessons,
    netPaid
  );

  // computePaymentSummary returns a null creditBalance when totalCost
  // itself isn't computable (no override AND no non-cancelled lessons yet
  // to derive one from) - a brand-new enrollment's very first lesson. The
  // task's own conservative fallback applies here: block only when net
  // paid is 0 (nothing at all on file to extend credit for) and there's
  // no arrangement (already excluded above). A student who has paid
  // ANYTHING, with no lessons booked yet, is allowed - the alternative
  // (blocking every first-ever lesson for every paying family) would be
  // far more disruptive than this feature is meant to be.
  if (summary.creditBalance === null) {
    return { allowed: netPaid > 0, hasPaymentArrangement: false };
  }

  return { allowed: summary.creditBalance >= newLessonCost, hasPaymentArrangement: false };
}

/**
 * Fetches the enrollment + its existing non-cancelled... (actually ALL
 * statuses - computePaymentSummary itself filters to non-cancelled
 * internally) lessons + net paid, then runs evaluateBookingEligibility.
 * Read-only - used by the GET booking-eligibility endpoint (pre-submit
 * banner) and the Settings-page safety-report preview. NOT used by the
 * actual create path, which needs the row-locked variant below instead
 * (two concurrent reads here could both see the same stale credit and
 * both report "allowed").
 */
export async function checkBookingEligibility(
  tenantId: string,
  enrollmentId: string,
  newLessonCost: number
): Promise<BookingEligibilityResult> {
  const enrollmentResult = await query(
    `SELECT total_cost, payment_arrangement_set_at FROM enrollments WHERE id = $1 AND tenant_id = $2`,
    [enrollmentId, tenantId]
  );
  if (enrollmentResult.rows.length === 0) {
    throw new Error('Enrollment not found');
  }
  const enrollmentRow = enrollmentResult.rows[0];

  const { lessons, netPaid } = await fetchLessonsAndNetPaid(query, tenantId, enrollmentId);

  return evaluateBookingEligibility(
    { totalCost: enrollmentRow.total_cost === null ? null : parseFloat(enrollmentRow.total_cost), paymentArrangementSetAt: enrollmentRow.payment_arrangement_set_at },
    lessons,
    netPaid,
    newLessonCost
  );
}

/**
 * Row-locked variant for the actual create path (lessonService.createLesson).
 * Locks the enrollment row (SELECT ... FOR UPDATE) for the duration of the
 * CALLER's transaction - the same race-safe pattern adjustmentService.ts's
 * createAdjustment already uses for a different "concurrent writers must
 * not exceed a cap" problem. Without this lock, two simultaneous booking
 * requests against the same enrollment could each read "credit: $100,
 * enough for this $80 lesson" and both pass, overbooking $60 past the
 * family's actual credit. Takes the caller's own transactional `client`
 * (not the module-level `query`) so the lock and the lesson INSERT that
 * follows it happen inside the SAME transaction/connection - a lock taken
 * on a different connection than the one that later inserts would not
 * actually serialize anything.
 *
 * Throws if the enrollment row doesn't exist for this tenant (should be
 * unreachable - the caller already resolved this exact enrollment moments
 * earlier via getActiveDriverTrainingEnrollment).
 */
export async function checkBookingEligibilityLocked(
  client: PoolClient,
  tenantId: string,
  enrollmentId: string,
  newLessonCost: number
): Promise<BookingEligibilityResult> {
  const enrollmentResult = await client.query(
    `SELECT total_cost, payment_arrangement_set_at
     FROM enrollments
     WHERE id = $1 AND tenant_id = $2
     FOR UPDATE`,
    [enrollmentId, tenantId]
  );
  if (enrollmentResult.rows.length === 0) {
    throw new Error('Enrollment not found for booking-eligibility lock');
  }
  const enrollmentRow = enrollmentResult.rows[0];

  const { lessons, netPaid } = await fetchLessonsAndNetPaid(
    (text: string, params: unknown[]) => client.query(text, params),
    tenantId,
    enrollmentId
  );

  const result = evaluateBookingEligibility(
    { totalCost: enrollmentRow.total_cost === null ? null : parseFloat(enrollmentRow.total_cost), paymentArrangementSetAt: enrollmentRow.payment_arrangement_set_at },
    lessons,
    netPaid,
    newLessonCost
  );

  logger.debug('Booking eligibility evaluated (locked)', {
    tenantId,
    enrollmentId,
    allowed: result.allowed,
    hasPaymentArrangement: result.hasPaymentArrangement,
  });

  return result;
}

// Shared by both the locked and unlocked variants - takes a query function
// (either the module-level `query` or a transactional client's own
// `.query`, wrapped to the same (text, params) shape) so neither caller
// duplicates this SQL.
async function fetchLessonsAndNetPaid(
  runQuery: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  tenantId: string,
  enrollmentId: string
): Promise<{ lessons: { status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'; cost: number }[]; netPaid: number }> {
  const lessonsResult = await runQuery(
    `SELECT status, cost FROM lessons WHERE tenant_id = $1 AND enrollment_id = $2`,
    [tenantId, enrollmentId]
  );
  const lessons = lessonsResult.rows.map((row) => ({
    status: row.status as 'scheduled' | 'completed' | 'cancelled' | 'no_show',
    cost: parseFloat(row.cost as string),
  }));

  // Same net-paid SQL as enrollmentService.ts's attachProgressAndPayments -
  // a confirmed payment's own amount minus the sum of its append-only
  // adjustments (refund/void), floored at 0 per payment, summed across the
  // enrollment. Legacy status='refunded' payments are excluded from the
  // `p.status = 'confirmed'` filter the same way they already are
  // everywhere else net-paid is computed (migration 007's own comment: a
  // pre-existing status='refunded' row is already fully accounted for as
  // $0 net paid, never backfilled with a matching adjustment row).
  const paidResult = await runQuery(
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
  const netPaid = parseFloat(paidResult.rows[0].total_paid as string);

  return { lessons, netPaid };
}

/**
 * Safety-report preview (Settings page, owner/admin, read-only, works even
 * while the setting is OFF): every active student with an open
 * driver_training enrollment that the check would currently block, so an
 * owner can review real names/numbers before turning the toggle on.
 * Intentionally tenant-wide and read-only - never mutates anything, never
 * itself gated on the setting's own value (the whole point is to preview
 * BEFORE enabling it).
 *
 * "A scheduled lesson cost" - this report has no single hypothetical new
 * lesson to check against, unlike the real-time banner/create-path check.
 * Reports each blocked student's current credit figure and, separately,
 * the cost of their MOST RECENTLY SCHEDULED upcoming lesson (if any) as a
 * concrete "the next lesson they'd try to book would look like this"
 * reference point - not a promise that exact lesson is what would be
 * blocked (a real check always runs against whatever lesson is actually
 * being booked at the time).
 */
export interface BookingEligibilityPreviewRow {
  studentId: string;
  studentName: string;
  enrollmentId: string;
  netPaid: number;
  nextScheduledLessonCost: number | null;
}

export async function getBookingEligibilityPreview(tenantId: string): Promise<BookingEligibilityPreviewRow[]> {
  const enrollmentsResult = await query(
    `SELECT e.id AS enrollment_id, e.total_cost, e.payment_arrangement_set_at,
            s.id AS student_id, s.full_name AS student_name
     FROM enrollments e
     JOIN students s ON s.id = e.student_id AND s.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1 AND e.program_type = 'driver_training' AND e.status = 'active'
       AND e.payment_arrangement_set_at IS NULL`,
    [tenantId]
  );

  const rows: BookingEligibilityPreviewRow[] = [];

  for (const enrollmentRow of enrollmentsResult.rows) {
    const { lessons, netPaid } = await fetchLessonsAndNetPaid(query, tenantId, enrollmentRow.enrollment_id);

    const nextLessonResult = await query(
      `SELECT cost FROM lessons
       WHERE tenant_id = $1 AND enrollment_id = $2 AND status = 'scheduled' AND date >= CURRENT_DATE
       ORDER BY date ASC, start_time ASC
       LIMIT 1`,
      [tenantId, enrollmentRow.enrollment_id]
    );
    const nextScheduledLessonCost = nextLessonResult.rows.length > 0
      ? parseFloat(nextLessonResult.rows[0].cost)
      : null;

    // Use the next scheduled lesson's own cost as the hypothetical "lesson
    // about to be booked" when one exists; otherwise fall back to 0.01 (the
    // smallest possible positive cost) so a student with zero credit and
    // no upcoming lesson still shows up as blocked for ANY future booking,
    // not silently excluded just because they have nothing scheduled yet.
    const probeCost = nextScheduledLessonCost ?? 0.01;
    const result = evaluateBookingEligibility(
      { totalCost: enrollmentRow.total_cost === null ? null : parseFloat(enrollmentRow.total_cost), paymentArrangementSetAt: enrollmentRow.payment_arrangement_set_at },
      lessons,
      netPaid,
      probeCost
    );

    if (!result.allowed) {
      rows.push({
        studentId: enrollmentRow.student_id,
        studentName: enrollmentRow.student_name,
        enrollmentId: enrollmentRow.enrollment_id,
        netPaid,
        nextScheduledLessonCost,
      });
    }
  }

  return rows;
}
