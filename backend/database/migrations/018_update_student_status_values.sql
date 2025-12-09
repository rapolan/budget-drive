-- Migration 018: Update Student Status Values
-- Description: Add 'enrolled' and 'permit_expired' status values for automated status system
-- Date: November 28, 2025

-- Update the status check constraint to include new values
ALTER TABLE students
DROP CONSTRAINT IF EXISTS students_status_check;

ALTER TABLE students
ADD CONSTRAINT students_status_check
CHECK (status IN ('enrolled', 'active', 'completed', 'dropped', 'suspended', 'permit_expired'));

-- Update any existing 'inactive' students to 'active' (if any exist)
UPDATE students
SET status = 'active'
WHERE status = 'inactive';

-- Add comment explaining the automated status system
COMMENT ON COLUMN students.status IS 'Student status: enrolled (new, no lessons), active (learning), completed (finished hours), dropped (withdrawn), suspended (admin action), permit_expired (internal use only - auto-computed)';
