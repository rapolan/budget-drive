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
