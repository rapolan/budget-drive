-- Migration: Make student phone optional
-- Purpose: Allow parents to opt out of providing student phone number
-- Business rule: At least one contact method required (Parent/Guardian OR student phone)

-- Make phone column nullable
ALTER TABLE students
  ALTER COLUMN phone DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN students.phone IS 'Student phone number (optional - Parent/Guardian can be primary contact)';

-- Note: Application-level validation ensures at least one contact method exists:
-- Either student phone OR Parent/Guardian contact must be provided
