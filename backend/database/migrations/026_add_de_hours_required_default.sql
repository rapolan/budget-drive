-- driver_education enrollments have been getting hours_required set from
-- tenant_settings.default_hours_required (the driver_training/BTW 6-hour
-- default) since the DE program type was introduced - a data-honesty bug,
-- not a behavior bug: nothing reads a DE enrollment's hours_required
-- (classroom DE completion is attendance-driven via de_attendance/
-- de_cohort_sessions; online DE uses manual_completed_hours), so this has
-- never been visibly wrong, only silently wrong. California classroom DE
-- is a 30-hour course. Mirrors default_hours_required's existing
-- tenant-configurable pattern rather than hardcoding 30, matching
-- de_discount_amount's own precedent from migration 025.
ALTER TABLE public.tenant_settings
    ADD COLUMN default_de_hours_required numeric(5,2) NOT NULL DEFAULT 30;

-- Correct existing driver_education enrollment rows that were backfilled
-- with the BTW default instead - each tenant's own configured DE default
-- (or 30 if that tenant hasn't set one, matching the column default above).
UPDATE public.enrollments e
SET hours_required = COALESCE(ts.default_de_hours_required, 30)
FROM public.tenant_settings ts
WHERE e.tenant_id = ts.tenant_id
  AND e.program_type = 'driver_education';
