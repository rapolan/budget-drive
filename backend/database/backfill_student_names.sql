-- Backfill script to populate the newly added split fields from legacy fields

-- Backfill first_name and last_name from full_name
UPDATE students
SET 
  first_name = split_part(full_name, ' ', 1),
  last_name = CASE 
                WHEN position(' ' in full_name) > 0 
                THEN substring(full_name from position(' ' in full_name) + 1)
                ELSE ''
              END
WHERE full_name IS NOT NULL AND (first_name IS NULL OR first_name = '');

-- Backfill address_line1 from address
UPDATE students
SET address_line1 = address
WHERE address IS NOT NULL AND (address_line1 IS NULL OR address_line1 = '');

-- Backfill emergency contacts
UPDATE students
SET 
  emergency_contact_name = split_part(emergency_contact, ' - ', 1),
  emergency_contact_phone = split_part(emergency_contact, ' - ', 2)
WHERE emergency_contact IS NOT NULL AND position(' - ' in emergency_contact) > 0 AND (emergency_contact_name IS NULL OR emergency_contact_name = '');
