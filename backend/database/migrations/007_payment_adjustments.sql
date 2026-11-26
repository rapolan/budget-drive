-- Append-only corrections for payments (refunds and voids), plus a
-- "payment arrangement" marker on enrollments. Replaces the old flow of
-- flipping payments.status to 'refunded' in place and hard-deleting a
-- payment row outright - both destroyed the original record, which is
-- incompatible with this app's eventual move to an append-only,
-- BSV-anchored ledger (a blockchain entry can't be edited or deleted
-- after the fact, so the off-chain bookkeeping shouldn't be able to
-- either). From this migration forward: the original payments row is
-- NEVER edited or deleted for a refund/void - a correction is always a
-- new, separate row in payment_adjustments. payments.status itself is
-- left alone by the new code paths (service-layer rules enforce this);
-- any row the OLD code already flipped to status = 'refunded' before this
-- migration ran is left exactly as it is - not backfilled with a matching
-- adjustment row, not rewritten. It is still treated as "fully refunded"
-- by every balance/status calculation (see paymentService.ts's own
-- derivation), so no reporting figure changes for pre-existing data.
--
-- payment_adjustments: id/tenant_id/payment_id/adjustment_type/amount/
-- reason_code/note/created_by/created_at per the task's own schema.
-- ledger_hash and ledger_txid are the same groundwork-only BSV pattern as
-- enrollments.completion_hash/ledger_txid and
-- certificates.completion_hash/ledger_txid (see docs/BLOCKCHAIN.md) -
-- nullable, computed by ordinary application code with Node's built-in
-- crypto module (no network call, no wallet) at adjustment-creation time,
-- and ledger_txid stays permanently NULL until a future session actually
-- anchors it on-chain. The hash payload is documented in
-- receiptService.ts and covers only the adjustment id, the payment's
-- receipt number, type, amount, reason code, and created_at - never the
-- free-text note or any name (see docs/ARCHITECTURE.md's payments-
-- adjustments section for the exact field list and the rationale for
-- excluding the note).
--
-- A hard DB trigger (not just application-layer discipline) rejects any
-- UPDATE or DELETE on this table outright - append-only is enforced at
-- the database level, not merely by convention in the service code, so a
-- future bug or a direct psql session can't silently violate it.
--
-- reason_code is a fixed, closed set (CHECK constraint) rather than free
-- text, so reporting/filtering never has to deal with inconsistent
-- spellings of the same reason. note is free text, required only when
-- reason_code = 'other' (enforced by a CHECK referencing both columns
-- together, not just application-layer validation - the same
-- belt-and-suspenders reasoning as the append-only trigger above).
--
-- amount is NOT NULL and CHECK > 0 for both adjustment_type values - a
-- void always covers the full remaining unadjusted amount (enforced in
-- paymentService.ts, not in SQL, since "remaining" requires reading the
-- payment's own amount and any prior adjustments first), but the stored
-- amount itself is still a concrete positive number either way, never 0
-- or negative.
--
-- Index on (tenant_id, payment_id): every read of "this payment's
-- adjustments" and "this tenant's adjustments in a date range" goes
-- through this pair - the FK on payment_id alone does not imply this
-- composite is already covered by an index Postgres would otherwise pick
-- automatically.
CREATE TABLE payment_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL REFERENCES payments(id),
  adjustment_type text NOT NULL,
  amount numeric(10,2) NOT NULL,
  reason_code text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  ledger_hash text,
  ledger_txid character varying(255),
  CONSTRAINT payment_adjustments_adjustment_type_check
    CHECK (adjustment_type IN ('refund', 'void')),
  CONSTRAINT payment_adjustments_amount_positive_check
    CHECK (amount > 0),
  CONSTRAINT payment_adjustments_reason_code_check
    CHECK (reason_code IN (
      'duplicate_payment', 'entered_in_error', 'wrong_student',
      'lesson_cancelled', 'overpaid', 'student_withdrew', 'other'
    )),
  CONSTRAINT payment_adjustments_note_required_for_other_check
    CHECK (reason_code != 'other' OR (note IS NOT NULL AND length(trim(note)) > 0))
);

CREATE INDEX idx_payment_adjustments_tenant_payment
  ON payment_adjustments (tenant_id, payment_id);

-- Append-only enforcement at the database level - rejects UPDATE/DELETE
-- outright with a clear error, rather than relying solely on no service
-- code ever calling one. A hard failure here is the intended behavior: if
-- this trigger ever fires, something is trying to do exactly the thing
-- this table exists to prevent.
CREATE OR REPLACE FUNCTION reject_payment_adjustments_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment_adjustments is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_adjustments_no_update
  BEFORE UPDATE ON payment_adjustments
  FOR EACH ROW EXECUTE FUNCTION reject_payment_adjustments_mutation();

CREATE TRIGGER payment_adjustments_no_delete
  BEFORE DELETE ON payment_adjustments
  FOR EACH ROW EXECUTE FUNCTION reject_payment_adjustments_mutation();

-- "Payment arrangement" marker on enrollments - an owner/admin-set flag
-- (no booking-rule behavior is wired to it in this change; that is an
-- explicitly separate future task) meaning "this family has an agreed,
-- non-standard payment plan - don't treat them as delinquent." Nullable:
-- unset (NULL) is the default and overwhelmingly common state. Setting it
-- again while already set simply overwrites set_at/set_by/note (the
-- "when was this last set, and by whom, with what note" fact, not a
-- history of every time it was toggled - no append-only requirement was
-- given for this marker, unlike payment_adjustments itself).
ALTER TABLE enrollments
  ADD COLUMN payment_arrangement_set_at timestamp without time zone,
  ADD COLUMN payment_arrangement_set_by uuid,
  ADD COLUMN payment_arrangement_note text;

-- Rollback note (manual - this repo has no down-migration tooling):
--   DROP TRIGGER IF EXISTS payment_adjustments_no_update ON payment_adjustments;
--   DROP TRIGGER IF EXISTS payment_adjustments_no_delete ON payment_adjustments;
--   DROP FUNCTION IF EXISTS reject_payment_adjustments_mutation();
--   DROP TABLE IF EXISTS payment_adjustments;
--   ALTER TABLE enrollments
--     DROP COLUMN IF EXISTS payment_arrangement_set_at,
--     DROP COLUMN IF EXISTS payment_arrangement_set_by,
--     DROP COLUMN IF EXISTS payment_arrangement_note;
--   DELETE FROM schema_migrations WHERE filename = '007_payment_adjustments.sql';
-- Only safe before any adjustment has been recorded against production
-- data - once a refund/void exists, dropping this table destroys a
-- financial correction record that may already be relied on (a receipt
-- shown to a customer, a reconciliation already performed). Treat this as
-- an emergency-only rollback for a migration that failed or was found to
-- be wrong before any real adjustment was ever created, not a normal
-- revert path.
