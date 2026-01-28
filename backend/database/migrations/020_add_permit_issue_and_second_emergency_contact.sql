-- Migration: Add permit issue date and second emergency contact
-- Purpose: Support permit issue date tracking and optional second contact (Parent/Guardian secondary)

-- Add permit issue date
ALTER TABLE students
  ADD COLUMN learner_permit_issue_date DATE;

-- Add second emergency contact fields (secondary Parent/Guardian)
ALTER TABLE students
  ADD COLUMN emergency_contact_2_name VARCHAR(255),
  ADD COLUMN emergency_contact_2_phone VARCHAR(20);

-- Add comments for documentation
COMMENT ON COLUMN students.learner_permit_issue_date IS 'Date when learner permit was issued';
COMMENT ON COLUMN students.emergency_contact_2_name IS 'Secondary Parent/Guardian contact name (optional)';
COMMENT ON COLUMN students.emergency_contact_2_phone IS 'Secondary Parent/Guardian contact phone (optional)';
