-- Drop the legacy derived emergency_contact string column (superseded by
-- emergency_contact_name/_phone). Split emergency_contact_name and
-- emergency_contact_2_name into first/last pairs for consistency with the
-- rest of the schema's name handling (students.first_name/last_name,
-- guardians.first_name/last_name).

ALTER TABLE public.students ADD COLUMN emergency_contact_first_name character varying(255);
ALTER TABLE public.students ADD COLUMN emergency_contact_last_name character varying(255);
ALTER TABLE public.students ADD COLUMN emergency_contact_2_first_name character varying(255);
ALTER TABLE public.students ADD COLUMN emergency_contact_2_last_name character varying(255);

-- Best-effort backfill: split on the first space. Data with no space
-- (single-word names) lands entirely in first_name, last_name NULL - a
-- one-time backfill of legacy free-text data, not a new input path.
UPDATE public.students
SET emergency_contact_first_name = split_part(emergency_contact_name, ' ', 1),
    emergency_contact_last_name = NULLIF(substring(emergency_contact_name FROM position(' ' IN emergency_contact_name) + 1), '')
WHERE emergency_contact_name IS NOT NULL AND emergency_contact_name <> '';

UPDATE public.students
SET emergency_contact_2_first_name = split_part(emergency_contact_2_name, ' ', 1),
    emergency_contact_2_last_name = NULLIF(substring(emergency_contact_2_name FROM position(' ' IN emergency_contact_2_name) + 1), '')
WHERE emergency_contact_2_name IS NOT NULL AND emergency_contact_2_name <> '';

ALTER TABLE public.students DROP COLUMN emergency_contact_name;
ALTER TABLE public.students DROP COLUMN emergency_contact_2_name;
ALTER TABLE public.students DROP COLUMN emergency_contact;
