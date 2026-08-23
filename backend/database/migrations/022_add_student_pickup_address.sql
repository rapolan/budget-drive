-- Distinct pickup address for a student, for the case where lessons should
-- be picked up somewhere other than home (a parent's workplace, a relative's
-- house, etc). Students had no column to express this at all before this
-- migration - address_line1/city/state/zip_code (added in the baseline
-- schema) are HOME address only, consumed by SmartBookingForm as the
-- pickup-location default.
--
-- Mirrors the home-address columns' exact structured shape (not a single
-- free-text blob) so the booking wizard's existing
-- extractZipCode(joinedAddressString) pattern keeps working unchanged for
-- pickup too - proximity/service-area ranking needs a real zip out of
-- whichever address is actually in play, and a free-text blob next to a
-- structured home address would leave that zip unreliable to extract.
--
-- pickup_address_different_from_home is the toggle's persisted state: when
-- false (the default), pickup continues to fall back to home address exactly
-- as before this migration; when true, the pickup_* columns are read
-- instead. The pickup_* columns themselves stay nullable regardless of the
-- toggle - they're simply unused when the toggle is off, not enforced empty.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS pickup_address_different_from_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_address_line1 character varying,
  ADD COLUMN IF NOT EXISTS pickup_address_line2 character varying,
  ADD COLUMN IF NOT EXISTS pickup_city character varying,
  ADD COLUMN IF NOT EXISTS pickup_state character varying,
  ADD COLUMN IF NOT EXISTS pickup_zip_code character varying;
