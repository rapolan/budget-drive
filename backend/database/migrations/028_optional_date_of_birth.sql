-- Migration: Make date_of_birth nullable
-- Purpose: Allow student creation without requiring date of birth immediately

-- Make date_of_birth column nullable
ALTER TABLE students
  ALTER COLUMN date_of_birth DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN students.date_of_birth IS 'Student date of birth (optional during initial entry)';
