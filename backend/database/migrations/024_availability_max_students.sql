-- =====================================================
-- AVAILABILITY MAX STUDENTS OVERRIDE
-- =====================================================
-- Migration: 024_availability_max_students.sql
-- Description: Add max_students field to availability slots
--              allowing per-slot capacity override
-- =====================================================

-- Add max_students column to instructor_availability table
-- NULL means use the tenant default (usually 3)
-- Set to 1, 2, etc. to override for that specific slot
ALTER TABLE instructor_availability 
ADD COLUMN IF NOT EXISTS max_students INTEGER DEFAULT NULL;

-- Add constraint to ensure valid values (1-10 range or NULL)
ALTER TABLE instructor_availability
ADD CONSTRAINT check_max_students_range 
CHECK (max_students IS NULL OR (max_students >= 1 AND max_students <= 10));

-- Add comment explaining the field
COMMENT ON COLUMN instructor_availability.max_students IS 
  'Override for max students during this availability slot. NULL = use tenant default. Set to 1 for single-lesson availability.';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
