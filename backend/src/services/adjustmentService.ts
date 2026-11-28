/**
 * Payment Adjustment Service
 *
 * Append-only refunds and voids against a payment, plus the "payment
 * arrangement" marker on an enrollment. Replaces the old
 * paymentService.refundPayment (flipped payments.status in place) and
 * paymentService.deletePayment (hard DELETE) - the original payments row
 * is NEVER edited or deleted by anything in this file. A correction is
 * always a new row in payment_adjustments (see migration
 * 007_payment_adjustments.sql for the full schema/trigger rationale).
 *
 * payments.status is deliberately left untouched by every function here -
 * "Paid" / "Partly refunded" / "Refunded" / "Voided" is a DERIVED display
 * status (see derivePaymentAdjustmentStatus below), computed fresh from
 * the payment amount and its adjustments every time, never stored.
 */

import crypto from 'crypto';
import { query, getClient } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';
import { keysToCamel } from '../utils/caseConversion';
import { PaymentAdjustment } from '../types';
import { computeReceiptNumber, computeAdjustmentLedgerHash } from './receiptService';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone, tenantLocalDateSql } from '../utils/tenantTime';

const logger = createLogger('AdjustmentService');

export type AdjustmentType = 'refund' | 'void';

export type AdjustmentReasonCode =
  | 'duplicate_payment'
  | 'entered_in_error'
  | 'wrong_student'
  | 'lesson_cancelled'
  | 'overpaid'
  | 'student_withdrew'
  | 'other';

const VALID_REASON_CODES: AdjustmentReasonCode[] = [
  'duplicate_payment',
  'entered_in_error',
  'wrong_student',
  'lesson_cancelled',
  'overpaid',
  'student_withdrew',
  'other',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * "Paid" / "Partly refunded" / "Refunded" / "Voided" - a DERIVED status
 * per payment, never stored. A void always covers the full remaining
 * amount (enforced at creation time below), so any void present means the
 * net is 0 and the status is 'voided' - checked first so a void can never
 * be shadowed by a 'refunded' label. "Refunded" means net paid is exactly
 * 0 via refund adjustments alone (no void). "Partly refunded" means some
 * but not all has been refunded. "Paid" is the default when there are no
 * adjustments at all, or only a zero-sum rounding edge (impossible given
 * the amount > 0 CHECK constraint, included only for completeness).
 */
export function derivePaymentAdjustmentStatus(
  paymentAmount: number,
  adjustments: Pick<PaymentAdjustment, 'adjustmentType' | 'amount'>[],
  // The payment's own legacy `status` column value. A row the OLD
  // flip-status-in-place flow already marked 'refunded' before this
  // migration has no adjustment rows at all (never backfilled - see
  // migration 007's own comment) but must still derive as fully
  // 'refunded', not 'paid' - checked first, before looking at
  // adjustments, specifically for this legacy case.
  legacyStatus?: string
): 'paid' | 'partly_refunded' | 'refunded' | 'voided' {
  if (legacyStatus === 'refunded' && adjustments.length === 0) {
    return 'refunded';
  }
  if (adjustments.some((a) => a.adjustmentType === 'void')) {
    return 'voided';
  }
  const totalAdjusted = round2(adjustments.reduce((sum, a) => sum + a.amount, 0));
  if (totalAdjusted <= 0) {
    return 'paid';
  }
  if (totalAdjusted >= paymentAmount) {
    return 'refunded';
  }
  return 'partly_refunded';
}

/**
 * Net paid for one payment: its own amount minus the sum of its
 * adjustments (refund or void - both reduce net paid identically; the
 * distinction is about WHY and HOW the money moved, not about the net
 * figure). Every balance/credit/reporting computation in this codebase
 * that used to read a confirmed payment's raw `amount` now reads this
 * instead - see paymentAdjustmentSql.ts for the shared SQL fragment.
 */
export function computeNetPaid(
  paymentAmount: number,
  adjustments: Pick<PaymentAdjustment, 'amount'>[],
  // Same legacy-status reasoning as derivePaymentAdjustmentStatus above -
  // a pre-migration status='refunded' row has no adjustment rows to sum,
  // but its net paid is still 0, not its full original amount.
  legacyStatus?: string
): number {
  if (legacyStatus === 'refunded' && adjustments.length === 0) {
    return 0;
  }
  const totalAdjusted = adjustments.reduce((sum, a) => sum + a.amount, 0);
  return round2(Math.max(0, paymentAmount - totalAdjusted));
}

export async function getAdjustmentsForPayment(paymentId: string, tenantId: string): Promise<PaymentAdjustment[]> {
  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);

  const result = await query(
    `SELECT pa.*, u.full_name AS created_by_name, ${tenantLocalDateSql('pa.created_at', 3)} AS created_at_date_local
     FROM payment_adjustments pa
     LEFT JOIN users u ON u.id = pa.created_by
     WHERE pa.payment_id = $1 AND pa.tenant_id = $2
     ORDER BY pa.created_at ASC`,
    [paymentId, tenantId, timezone]
  );
  return result.rows.map((row) => ({
    ...(keysToCamel(row) as PaymentAdjustment),
    amount: round2(parseFloat(row.amount)),
    createdAtDateLocal: row.created_at_date_local,
  }));
}

export async function getAdjustmentsForPayments(paymentIds: string[], tenantId: string): Promise<Map<string, PaymentAdjustment[]>> {
  const map = new Map<string, PaymentAdjustment[]>();
  if (paymentIds.length === 0) return map;

  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);

  const result = await query(
    `SELECT pa.*, u.full_name AS created_by_name, ${tenantLocalDateSql('pa.created_at', 3)} AS created_at_date_local
     FROM payment_adjustments pa
     LEFT JOIN users u ON u.id = pa.created_by
     WHERE pa.payment_id = ANY($1::uuid[]) AND pa.tenant_id = $2
     ORDER BY pa.created_at ASC`,
    [paymentIds, tenantId, timezone]
  );
  for (const row of result.rows) {
    const adjustment = {
      ...(keysToCamel(row) as PaymentAdjustment),
      amount: round2(parseFloat(row.amount)),
      createdAtDateLocal: row.created_at_date_local,
    };
    const list = map.get(adjustment.paymentId) ?? [];
    list.push(adjustment);
    map.set(adjustment.paymentId, list);
  }
  return map;
}

interface CreateAdjustmentInput {
  adjustmentType: AdjustmentType;
  // Required for 'refund'; ignored (the full remaining amount is used
  // instead) for 'void' - the task's own rule ("a void always covers the
  // full remaining unadjusted amount").
  amount?: number;
  reasonCode: AdjustmentReasonCode;
  note?: string | null;
}

/**
 * Creates a refund or void adjustment against a payment, inside a
 * transaction that row-locks the payment itself (SELECT ... FOR UPDATE)
 * for its duration - the same race-safe pattern classroomService.joinCohort
 * already uses for a different "concurrent writers must not exceed a cap"
 * problem. Without this lock, two simultaneous refund requests against the
 * same payment could each read "amount still available: $50" and both
 * insert a $50 refund, adjusting $100 off a $50 payment - the lock makes
 * the second request wait until the first's transaction commits, so its
 * own remaining-amount check sees the first refund's effect.
 *
 * Rules enforced here, not just at the HTTP layer:
 * - Only a 'confirmed' payment can be adjusted (pending/failed/refunded-
 *   by-the-old-flow payments are not valid adjustment targets - a legacy
 *   status='refunded' row is already fully accounted for, see migration
 *   007's own comment; adjusting it further would double-count).
 * - The sum of a payment's adjustments can never exceed its amount.
 * - A void always adjusts exactly the full remaining (unadjusted) amount,
 *   computed server-side - the caller's `amount` is ignored for a void.
 * - A refund's amount must be > 0 and <= the remaining amount.
 */
export async function createAdjustment(
  tenantId: string,
  paymentId: string,
  userId: string,
  input: CreateAdjustmentInput
): Promise<PaymentAdjustment> {
  if (!VALID_REASON_CODES.includes(input.reasonCode)) {
    throw new AppError('Invalid reason code', 400);
  }
  if (input.reasonCode === 'other' && (!input.note || input.note.trim().length === 0)) {
    throw new AppError('A note is required when the reason is "Other"', 400);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const lockedPayment = await client.query(
      `SELECT id, tenant_id, amount, status
       FROM payments
       WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [paymentId, tenantId]
    );
    if (lockedPayment.rows.length === 0) {
      throw new AppError('Payment not found', 404);
    }
    const payment = lockedPayment.rows[0];
    if (payment.status !== 'confirmed') {
      throw new AppError('Only a confirmed payment can be adjusted', 400);
    }

    const existingAdjustmentsResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_adjusted
       FROM payment_adjustments
       WHERE payment_id = $1 AND tenant_id = $2`,
      [paymentId, tenantId]
    );
    const paymentAmount = round2(parseFloat(payment.amount));
    const totalAdjusted = round2(parseFloat(existingAdjustmentsResult.rows[0].total_adjusted));
    const remaining = round2(paymentAmount - totalAdjusted);

    if (remaining <= 0) {
      throw new AppError('This payment has already been fully refunded or voided', 400);
    }

    let adjustmentAmount: number;
    if (input.adjustmentType === 'void') {
      adjustmentAmount = remaining;
    } else {
      if (input.amount === undefined || input.amount === null) {
        throw new AppError('An amount is required for a refund', 400);
      }
      adjustmentAmount = round2(input.amount);
      if (adjustmentAmount <= 0) {
        throw new AppError('Refund amount must be greater than 0', 400);
      }
      if (adjustmentAmount > remaining) {
        throw new AppError(
          `Refund amount exceeds the remaining unadjusted amount ($${remaining.toFixed(2)})`,
          400
        );
      }
    }

    // The adjustment's id is still generated in application code (not
    // left to the table's own DEFAULT) so the ledger hash can be computed
    // BEFORE the row is inserted and written in the same single INSERT -
    // migration 007's append-only trigger rejects UPDATE unconditionally,
    // including a same-transaction, same-row backfill of this row's own
    // hash right after inserting it, so a naive insert-then-UPDATE-with-
    // the-hash approach would fail.
    //
    // created_at is NO LONGER a JS `new Date()` passed as a bound
    // parameter (payments-dates-and-cards) - confirmed by direct probe
    // that pg's own JS-side type parser for a `timestamp without time
    // zone` value interprets the stored wall-clock string using the NODE
    // PROCESS's local TZ, not UTC. A `new Date()` instant is itself
    // always correct, but round-tripping it through that parser under a
    // hostile process TZ corrupts the wall-clock string actually written
    // to the column. Instead, Postgres's OWN now() is read here as a
    // plain UTC-wall-clock STRING (never parsed back into a JS Date),
    // used verbatim as the hash's createdAt input (same ISO-8601 shape
    // `.toISOString()` always produced, so this format is unchanged from
    // every existing row's hash - see computeAdjustmentLedgerHash's own
    // doc comment), and re-inserted as that same string (cast to
    // ::timestamp), never as a Date object - this relies on the
    // connection pool's own `options: '-c timezone=UTC'` (database.ts)
    // making every `timestamp without time zone DEFAULT now()` column's
    // stored convention unambiguously UTC, confirmed already true in
    // production.
    const adjustmentId = crypto.randomUUID();
    const nowResult = await client.query(
      `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at_iso`
    );
    const createdAtIso: string = nowResult.rows[0].created_at_iso;
    const receiptNumber = computeReceiptNumber(tenantId, paymentId);
    const ledgerHash = computeAdjustmentLedgerHash({
      adjustmentId,
      receiptNumber,
      adjustmentType: input.adjustmentType,
      amount: adjustmentAmount,
      reasonCode: input.reasonCode,
      createdAt: createdAtIso,
    });

    const tenantSettings = await getTenantSettings(tenantId);
    const timezone = resolveTenantTimezone(tenantSettings?.timezone);

    const insertResult = await client.query(
      `INSERT INTO payment_adjustments (id, tenant_id, payment_id, adjustment_type, amount, reason_code, note, created_by, created_at, ledger_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamp, $10)
       RETURNING *, ${tenantLocalDateSql('created_at', 11)} AS created_at_date_local`,
      [
        adjustmentId,
        tenantId,
        paymentId,
        input.adjustmentType,
        adjustmentAmount,
        input.reasonCode,
        input.note?.trim() || null,
        userId,
        createdAtIso,
        ledgerHash,
        timezone,
      ]
    );
    const adjustmentRow = insertResult.rows[0];

    await client.query('COMMIT');

    logger.info('Payment adjustment created', {
      tenantId,
      paymentId,
      adjustmentType: input.adjustmentType,
      amount: adjustmentAmount,
    });

    return {
      ...(keysToCamel(adjustmentRow) as PaymentAdjustment),
      amount: adjustmentAmount,
      createdAtDateLocal: adjustmentRow.created_at_date_local,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface PaymentArrangement {
  enrollmentId: string;
  setAt: Date;
  setBy: string | null;
  setByName: string | null;
  note: string | null;
}

/**
 * Sets (or overwrites) the "payment arrangement" marker on an enrollment.
 * No history is kept of prior settings - this is a single current-state
 * marker ("is this family on an agreed plan right now, and since when"),
 * not an append-only record like payment_adjustments; the task gave no
 * append-only requirement for this marker. No booking-rule behavior is
 * wired to this flag anywhere in this change - it is purely informational
 * (a badge in the UI), by explicit scope.
 */
export async function setPaymentArrangement(
  tenantId: string,
  enrollmentId: string,
  userId: string,
  note: string | null
): Promise<PaymentArrangement> {
  const result = await query(
    `UPDATE enrollments
     SET payment_arrangement_set_at = NOW(),
         payment_arrangement_set_by = $1,
         payment_arrangement_note = $2
     WHERE id = $3 AND tenant_id = $4
     RETURNING id, payment_arrangement_set_at, payment_arrangement_set_by, payment_arrangement_note`,
    [userId, note?.trim() || null, enrollmentId, tenantId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Enrollment not found', 404);
  }
  return mapArrangementRow(result.rows[0]);
}

export async function clearPaymentArrangement(
  tenantId: string,
  enrollmentId: string
): Promise<void> {
  const result = await query(
    `UPDATE enrollments
     SET payment_arrangement_set_at = NULL,
         payment_arrangement_set_by = NULL,
         payment_arrangement_note = NULL
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [enrollmentId, tenantId]
  );
  if (result.rows.length === 0) {
    throw new AppError('Enrollment not found', 404);
  }
}

export async function getPaymentArrangementsForEnrollments(
  enrollmentIds: string[],
  tenantId: string
): Promise<Map<string, PaymentArrangement>> {
  const map = new Map<string, PaymentArrangement>();
  if (enrollmentIds.length === 0) return map;

  const result = await query(
    `SELECT e.id, e.payment_arrangement_set_at, e.payment_arrangement_set_by, e.payment_arrangement_note,
            u.full_name AS set_by_name
     FROM enrollments e
     LEFT JOIN users u ON u.id = e.payment_arrangement_set_by
     WHERE e.id = ANY($1::uuid[]) AND e.tenant_id = $2 AND e.payment_arrangement_set_at IS NOT NULL`,
    [enrollmentIds, tenantId]
  );
  for (const row of result.rows) {
    map.set(row.id, mapArrangementRow(row));
  }
  return map;
}

function mapArrangementRow(row: {
  id: string;
  payment_arrangement_set_at: Date | null;
  payment_arrangement_set_by: string | null;
  payment_arrangement_note: string | null;
  set_by_name?: string | null;
}): PaymentArrangement {
  return {
    enrollmentId: row.id,
    setAt: row.payment_arrangement_set_at as Date,
    setBy: row.payment_arrangement_set_by,
    setByName: row.set_by_name ?? null,
    note: row.payment_arrangement_note,
  };
}
