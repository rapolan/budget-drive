-- Migration: Split emergency_contact into separate name and phone fields
-- Purpose: Better data structure for Parent/Guardian contact - validation, SMS notifications, and UI

-- Add new columns for Parent/Guardian contact
ALTER TABLE students
  ADD COLUMN emergency_contact_name VARCHAR(255),
  ADD COLUMN emergency_contact_phone VARCHAR(20);

-- Migrate existing data (format: "Name - Phone")
-- Split on ' - ' delimiter
UPDATE students
SET
  emergency_contact_name = SPLIT_PART(emergency_contact, ' - ', 1),
  emergency_contact_phone = SPLIT_PART(emergency_contact, ' - ', 2)
WHERE emergency_contact IS NOT NULL
  AND emergency_contact LIKE '%-%';

-- Handle cases where there's no delimiter (just phone or just name)
UPDATE students
SET emergency_contact_phone = emergency_contact
WHERE emergency_contact IS NOT NULL
  AND emergency_contact NOT LIKE '%-%'
  AND emergency_contact_name IS NULL;

-- Note: We're keeping the old emergency_contact column for now to support rollback
-- It can be dropped in a future migration after verifying the split worked correctly
