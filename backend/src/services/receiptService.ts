/**
 * Receipt Service
 *
 * Phase 1 is additive-only - no migration adds a persisted receipt number
 * column to `payments`. A receipt number is instead DERIVED at read time
 * from the payment's own immutable id, tenant-scoped so the same short
 * code can never collide across two different schools' payments. This is
 * a pure, deterministic function: the same (tenantId, paymentId) pair
 * always produces the same receipt number, and a hard-deleted payment
 * never causes a later payment's number to shift or be reused (unlike a
 * row-order sequential scheme would) - the task's own explicit constraint.
 *
 * Format: "BDP-" + the first 10 hex characters of
 * sha256(tenantId + ':' + paymentId), uppercased. Documented as an
 * interim format in docs/ARCHITECTURE.md - a real per-school sequential
 * number stored on the payment (via a migration) is a phase 2 candidate,
 * with these UUID-derived numbers staying valid for payments recorded
 * before that migration lands.
 *
 * Looked up by (tenantId, paymentId) together, never by the short code
 * alone - the short code is a display label, not a lookup key, and is
 * never unique across tenants on its own (astronomically unlikely to
 * collide within one tenant, but two different tenants' payment ids could
 * theoretically hash to the same 10 hex characters without the tenantId
 * mixed in).
 */

import crypto from 'crypto';

export function computeReceiptNumber(tenantId: string, paymentId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${tenantId}:${paymentId}`)
    .digest('hex');
  return `BDP-${hash.slice(0, 10).toUpperCase()}`;
}

/**
 * Groundwork-only BSV hash for a payment adjustment (refund/void) -
 * payments-adjustments phase. Matches the existing
 * enrollments.completion_hash / certificates.completion_hash pattern
 * exactly (see docs/BLOCKCHAIN.md): computed by ordinary application code
 * via Node's built-in crypto module, no @bsv/sdk, no wallet, no network
 * call. Stored in payment_adjustments.ledger_hash; the paired
 * ledger_txid column stays permanently NULL until a future session
 * actually anchors it on-chain.
 *
 * The hashed payload is deliberately narrow - the adjustment id, the
 * payment's own receipt number (itself already a deterministic,
 * non-PII-derived value - see computeReceiptNumber above), the
 * adjustment type, amount, reason code, and created_at. It explicitly
 * NEVER includes the free-text note or any name - the same "internal IDs
 * and non-PII scalars only" rule every other hash in this codebase
 * follows.
 *
 * `createdAt` format (payments-dates-and-cards): always the exact
 * `YYYY-MM-DDTHH:mm:ss.sssZ` shape `Date.prototype.toISOString()`
 * produces (3-digit, zero-padded milliseconds, trailing literal "Z") -
 * this is an invariant every caller must preserve, not just a
 * convention, since a byte-for-byte-identical string is required to
 * reproduce an EXISTING row's hash for verification. Every row created
 * before this comment was added built this string via
 * `new Date().toISOString()` directly. Every row created after it is
 * built via `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
 * in SQL instead (adjustmentService.createAdjustment) - same shape,
 * same UTC instant, but computed without ever passing a JS `Date`
 * through pg's write serializer for a `timestamp without time zone`
 * column, which (confirmed by direct probe) silently corrupts the
 * stored wall-clock value under a Node process TZ other than UTC. Both
 * forms verify identically against this function; this function itself
 * has no awareness of which one produced its input.
 */
export function computeAdjustmentLedgerHash(payload: {
  adjustmentId: string;
  receiptNumber: string;
  adjustmentType: 'refund' | 'void';
  amount: number;
  reasonCode: string;
  createdAt: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}
