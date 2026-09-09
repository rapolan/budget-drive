-- Optional free-text reference for a manually-recorded payment (e.g. a
-- Square receipt number, a check number, the last 4 digits of a card) -
-- the Add Payment modal redesign's new "Reference # (optional)" field.
-- Nullable text, no default, no backfill needed for existing rows.
ALTER TABLE public.payments ADD COLUMN reference_number text;
