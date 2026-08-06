-- Data-only migration: backfill every existing student's hours_required to
-- their tenant's current default_hours_required. Per the task, this is an
-- unconditional overwrite of every row (including the seeded/hardcoded 30s)
-- since there is no production data - there is no reliable way to
-- distinguish a deliberate override from stale seed data anyway.

UPDATE public.students s
SET hours_required = ts.default_hours_required
FROM public.tenant_settings ts
WHERE s.tenant_id = ts.tenant_id;
