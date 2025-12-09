-- Migration 017: Rollback tags, add last_contacted_at
-- Description: Remove tags feature and replace with last_contacted_at timestamp for better follow-up tracking
-- Date: November 28, 2025

-- Remove tags feature
DROP INDEX IF EXISTS idx_students_tags;
DROP FUNCTION IF EXISTS student_has_tag(TEXT[], TEXT);
ALTER TABLE students DROP COLUMN IF EXISTS tags;

-- Add last_contacted_at timestamp
ALTER TABLE students
ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP;

-- Add index for faster queries on last_contacted_at
CREATE INDEX IF NOT EXISTS idx_students_last_contacted ON students(last_contacted_at);

-- Add comment
COMMENT ON COLUMN students.last_contacted_at IS 'Timestamp of last contact attempt for follow-up tracking';
