-- =====================================================
-- BUDGET DRIVING SCHOOL
-- Migration 005: instructor structured address columns
-- =====================================================
-- Description: instructorService.ts's createInstructor/updateInstructor
--              already read/write address_line1, address_line2, city,
--              state, and zip_code on the instructors table, and the
--              scheduling engine's ranked-slots endpoint needs
--              instructors.zip_code to compute proximity - but these
--              columns were only ever added to the students table
--              (migration 002_idempotent_updates.sql), never to
--              instructors. Any instructor create/update touching an
--              address, and the ranked-slots search, currently fail with
--              "column does not exist".
--
--              Mirrors the equivalent students-table columns added in
--              002_idempotent_updates.sql.
--
-- Safe to re-run: uses IF NOT EXISTS.
-- =====================================================

ALTER TABLE instructors
    ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS city          VARCHAR(255),
    ADD COLUMN IF NOT EXISTS state         VARCHAR(50),
    ADD COLUMN IF NOT EXISTS zip_code      VARCHAR(20);

DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Migration 005 complete: instructors table now has';
    RAISE NOTICE 'address_line1/address_line2/city/state/zip_code';
    RAISE NOTICE '==============================================';
END $$;
