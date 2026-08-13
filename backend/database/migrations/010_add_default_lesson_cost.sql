-- Tenant-configurable default cost for a new lesson booking, prefilled into
-- the booking wizard's Confirm step (still freely editable per lesson).
-- NOT NULL with a DEFAULT so every tenant - including ones created before
-- this migration - always has a concrete value to prefill from; no backfill
-- of existing lessons.cost is needed or performed, since this only affects
-- the prefill for lessons created from here on.

ALTER TABLE public.tenant_settings
    ADD COLUMN default_lesson_cost numeric(10,2) NOT NULL DEFAULT 150;
