-- "Require payment before booking" (payment-before-booking) - a per-tenant
-- toggle, OFF by default, that blocks creating a new lesson unless the
-- student's active driver_training enrollment has enough credit (net paid
-- minus the cost of its existing non-cancelled lessons) to cover the new
-- lesson's own cost. Defaulted to false so nothing changes for any
-- existing tenant until the owner/admin explicitly turns it on from
-- Settings.
--
-- Deliberately does NOT touch fee_flags in any way - cancellation/no-show
-- fees are a notice only, collected by the instructor in cash, never a
-- payment, and the booking check this setting gates must never read
-- fee_flags at all (see lessonService.ts's bookingEligibilityService
-- integration and its own doc comment for the full reasoning). This
-- migration only adds the toggle itself; the enforcement logic lives
-- entirely in application code (bookingEligibilityService.ts), same
-- division of labor as cancellation_fee_amount/cancellation_fee_window_hours
-- above it in tenant_settings (001_baseline.sql) - the column just stores
-- the policy choice, a service function applies it.
ALTER TABLE tenant_settings
  ADD COLUMN require_payment_before_booking boolean NOT NULL DEFAULT false;

-- Rollback note (manual - this repo has no down-migration tooling):
--   ALTER TABLE tenant_settings
--     DROP COLUMN IF EXISTS require_payment_before_booking;
--   DELETE FROM schema_migrations WHERE filename = '008_require_payment_before_booking.sql';
-- Safe at any time - this column is read only at lesson-creation time to
-- decide whether to run an additional check; dropping it does not corrupt
-- or orphan any other row (no FK references it, nothing else is derived
-- from or stored alongside it).
