-- Phase 2 of the compliance-records arc (docs/compliance-records-build-plan.md):
-- certificates.form_type has defaulted to 'DL_400C' since it was added
-- (021_certificates_and_withdrawal.sql), so every certificate recorded via
-- recordCertificate silently inherited that default regardless of the
-- enrollment's actual program - wrong for every driver_training
-- certificate (the only kind this app records today), which belongs on
-- DL_400D. certificateService.ts now sets form_type explicitly on both
-- insert paths (resolveFormType() for recordCertificate, the
-- 'NOT_APPLICABLE' sentinel for recordVoid, which has no enrollment/program
-- to derive a form from), so the column no longer needs - and must not
-- keep - a default: a default here is exactly what let the original bug
-- recreate itself silently. Dropping it converts "silently wrong" into
-- "loudly missing" (a NOT NULL violation) if a future insert path ever
-- forgets to set it.

ALTER TABLE public.certificates
    ALTER COLUMN form_type DROP DEFAULT;

-- Backfill: correct existing issued certificates whose enrollment is
-- driver_training but were stamped with the wrong default. Certificates
-- on a driver_education enrollment are deliberately left untouched - the
-- classroom (DL_400B) vs online (DL_400C) split isn't derivable from
-- program_type alone yet (Phase 3), so there's no known-correct value to
-- backfill them to.
UPDATE public.certificates c
SET form_type = 'DL_400D'
FROM public.enrollments e
WHERE e.id = c.enrollment_id
  AND e.program_type = 'driver_training'
  AND c.form_type != 'DL_400D';

-- Backfill: any existing void certificates (no enrollment) also rode the
-- wrong default. A void was never issued to a student, so it gets the
-- explicit "not a real form" sentinel, not a guessed DMV form code.
UPDATE public.certificates
SET form_type = 'NOT_APPLICABLE'
WHERE enrollment_id IS NULL
  AND status = 'void'
  AND form_type != 'NOT_APPLICABLE';
