-- Migration 016: Student Tags
-- Description: Add tags field to students table for categorization and filtering
-- Date: November 28, 2025

-- Add tags column as JSONB array (allows flexible tagging)
ALTER TABLE students
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add index for faster tag queries
CREATE INDEX IF NOT EXISTS idx_students_tags ON students USING GIN(tags);

-- Create helper function to check if student has specific tag
CREATE OR REPLACE FUNCTION student_has_tag(student_tags TEXT[], search_tag TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN search_tag = ANY(student_tags);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add comment
COMMENT ON COLUMN students.tags IS 'Array of tags for categorizing students (e.g., needs_followup, vip, at_risk)';
