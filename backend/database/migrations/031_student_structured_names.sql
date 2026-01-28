-- =====================================================
-- BUDGET DRIVING SCHOOL - STUDENT STRUCTURED NAMES
-- Migration: 031_student_structured_names.sql
-- Description: Add first_name, last_name, middle_name columns to students table
-- Features: Better search performance and data consistency
-- =====================================================

-- Add structured name fields to students table
ALTER TABLE students
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);

-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_students_first_name ON students(first_name);
CREATE INDEX IF NOT EXISTS idx_students_last_name ON students(last_name);
CREATE INDEX IF NOT EXISTS idx_students_full_name ON students(full_name);

-- Populate structured name fields from existing full_name data
-- This is a best-effort parsing that can be corrected manually if needed
UPDATE students
SET
  first_name = CASE
    WHEN full_name IS NOT NULL AND full_name != '' THEN
      SPLIT_PART(TRIM(full_name), ' ', 1)
    ELSE NULL
  END,
  last_name = CASE
    WHEN full_name IS NOT NULL AND full_name != '' THEN
      CASE
        WHEN array_length(string_to_array(TRIM(full_name), ' '), 1) >= 2 THEN
          SPLIT_PART(TRIM(full_name), ' ', array_length(string_to_array(TRIM(full_name), ' '), 1))
        ELSE NULL
      END
    ELSE NULL
  END,
  middle_name = CASE
    WHEN full_name IS NOT NULL AND full_name != '' THEN
      CASE
        WHEN array_length(string_to_array(TRIM(full_name), ' '), 1) > 2 THEN
          array_to_string((string_to_array(TRIM(full_name), ' '))[2:array_length(string_to_array(TRIM(full_name), ' '), 1)-1], ' ')
        ELSE NULL
      END
    ELSE NULL
  END
WHERE first_name IS NULL OR last_name IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN students.first_name IS 'First name for improved search and sorting performance';
COMMENT ON COLUMN students.last_name IS 'Last name for improved search and sorting performance';
COMMENT ON COLUMN students.middle_name IS 'Middle name(s) for complete name structure';