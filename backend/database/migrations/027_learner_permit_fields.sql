-- Migration: Add learner permit number and expiration columns
-- Purpose: Store learner permit details for student records

-- Add learner permit number column
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS learner_permit_number VARCHAR(50);

-- Add learner permit expiration column  
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS learner_permit_expiration DATE;

-- Add comments for documentation
COMMENT ON COLUMN students.learner_permit_number IS 'California learner permit number';
COMMENT ON COLUMN students.learner_permit_expiration IS 'Learner permit expiration date';
