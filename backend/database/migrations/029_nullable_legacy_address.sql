-- Migration: Make address nullable (legacy field)
-- Purpose: Allow new students to be created with only structured address fields

ALTER TABLE students
  ALTER COLUMN address DROP NOT NULL;

COMMENT ON COLUMN students.address IS 'Legacy combined address (nullable, replaced by address_line1, city, etc.)';
