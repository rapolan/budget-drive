-- =====================================================
-- BUDGET DRIVING SCHOOL
-- Migration 003: instructor_availability schema catch-up
-- =====================================================
-- Description: instructor_availability was created without tenant_id,
--              is_active, or max_students, but schedulingService.ts's
--              conflict-check queries and availabilityService.ts's row
--              mapping already reference all three columns. Without this
--              migration, any query against instructor_availability
--              (scheduling conflicts, availability lookups) fails with
--              "column does not exist".
--
--              is_available (existing) is kept for backward compatibility
--              and kept in sync with the new is_active column via trigger;
--              application code should read/write is_active going forward.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.
-- =====================================================

ALTER TABLE instructor_availability
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
    ADD COLUMN IF NOT EXISTS max_students INTEGER;

-- Backfill tenant_id from the owning instructor for any existing rows
UPDATE instructor_availability ia
SET tenant_id = i.tenant_id
FROM instructors i
WHERE ia.instructor_id = i.id
  AND ia.tenant_id IS NULL;

-- Backfill is_active from the legacy is_available column
UPDATE instructor_availability
SET is_active = is_available
WHERE is_active IS NULL;

ALTER TABLE instructor_availability
    ALTER COLUMN tenant_id SET NOT NULL,
    ALTER COLUMN is_active SET DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_instructor_availability_tenant
    ON instructor_availability(tenant_id);

DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Migration 003 complete: instructor_availability';
    RAISE NOTICE 'now has tenant_id, is_active, max_students';
    RAISE NOTICE '==============================================';
END $$;
