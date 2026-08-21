-- Certificate issuance tracking (13 CCR §340.27) + enrollment withdrawal.
-- Both ship in one migration because the withdrawal transcript feature
-- needs the withdrawal columns to exist, and both are the same
-- "enrollment lifecycle" surface.
--
-- The certificates table already existed (001_baseline.sql) but was never
-- wired to any real feature - zero rows in every environment, and exactly
-- one live reader (enrollmentService.reopenEnrollment's certificateExists
-- check). Reshaped in place rather than dropped/recreated: same table
-- identity, same tenant_id FK, same historical intent, just repointed at
-- enrollments instead of students (a person can hold a driver_education
-- and a driver_training certificate on two different DMV forms - an
-- enrollment-scoped certificate is the only model that can express that)
-- and reshaped for the real paper-reconciliation workflow (serial number,
-- issue/void status, no PDF/blockchain-hash columns that were never used).
--
-- issued_by_instructor_id and recorded_by are deliberately two different
-- columns, not one: the instructor issues the physical certificate at the
-- student's final lesson (the DMV-relevant party), the admin later
-- records that serial in the app from the student's returned paper sheet
-- (the data-entry audit trail) - often a different person, sometimes on a
-- different day.

ALTER TABLE public.certificates DROP CONSTRAINT certificates_student_id_fkey;
ALTER TABLE public.certificates DROP CONSTRAINT certificates_issued_by_fkey;
DROP INDEX IF EXISTS idx_certificates_student;
DROP INDEX IF EXISTS idx_certificates_number;
DROP INDEX IF EXISTS idx_certificates_number_tenant;

ALTER TABLE public.certificates DROP COLUMN student_id;
ALTER TABLE public.certificates DROP COLUMN certificate_type;
ALTER TABLE public.certificates DROP COLUMN title;
ALTER TABLE public.certificates DROP COLUMN description;
ALTER TABLE public.certificates DROP COLUMN hours_completed;
ALTER TABLE public.certificates DROP COLUMN pdf_url;
ALTER TABLE public.certificates DROP COLUMN image_url;
ALTER TABLE public.certificates DROP COLUMN blockchain_hash;
ALTER TABLE public.certificates DROP COLUMN blockchain_verified;
ALTER TABLE public.certificates DROP COLUMN sent_to_student;
ALTER TABLE public.certificates DROP COLUMN sent_at;
ALTER TABLE public.certificates DROP COLUMN notes;

ALTER TABLE public.certificates RENAME COLUMN certificate_number TO serial_number;
ALTER TABLE public.certificates RENAME COLUMN issued_by TO issued_by_instructor_id;

ALTER TABLE public.certificates ALTER COLUMN serial_number SET NOT NULL;
ALTER TABLE public.certificates ALTER COLUMN serial_number TYPE character varying(50);

ALTER TABLE public.certificates ADD COLUMN enrollment_id uuid;
ALTER TABLE public.certificates ADD COLUMN form_type character varying(50) NOT NULL DEFAULT 'DL_400C';
-- 'assigned'/'pending' are reserved for future physical-custody tracking
-- (an instructor holding an unused certificate before it's ever issued or
-- voided) - not built this session, kept in mind so this CHECK doesn't
-- need to be touched again just to add them.
ALTER TABLE public.certificates ADD COLUMN status character varying(20) NOT NULL DEFAULT 'issued';
ALTER TABLE public.certificates ADD CONSTRAINT certificates_status_check CHECK (status IN ('issued', 'void'));
ALTER TABLE public.certificates ADD COLUMN void_reason text;
ALTER TABLE public.certificates ADD COLUMN recorded_by uuid;
ALTER TABLE public.certificates ADD COLUMN completion_hash text;
ALTER TABLE public.certificates ADD COLUMN ledger_txid character varying(255);
ALTER TABLE public.certificates ADD COLUMN updated_at timestamp without time zone DEFAULT now();

ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id);
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_issued_by_instructor_id_fkey FOREIGN KEY (issued_by_instructor_id) REFERENCES public.instructors(id);
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_certificates_enrollment ON public.certificates USING btree (enrollment_id);
CREATE INDEX idx_certificates_status ON public.certificates USING btree (tenant_id, status);
CREATE UNIQUE INDEX idx_certificates_serial_tenant ON public.certificates USING btree (tenant_id, serial_number);

-- Enrollment withdrawal: a minor who leaves before completing is entitled
-- under §340.27 to a transcript of training received. 'withdrawn' is
-- distinct from 'inactive'/'suspended' - those don't mean "the student
-- left," this does, with its own audit trail mirroring completed_at/
-- completion_reason/completed_by exactly.
ALTER TABLE public.enrollments DROP CONSTRAINT enrollments_status_check;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_status_check
  CHECK (status IN ('active', 'completed', 'inactive', 'suspended', 'withdrawn'));

ALTER TABLE public.enrollments ADD COLUMN withdrawn_at timestamp without time zone;
ALTER TABLE public.enrollments ADD COLUMN withdrawn_reason text;
ALTER TABLE public.enrollments ADD COLUMN withdrawn_by uuid;
ALTER TABLE public.enrollments
  ADD CONSTRAINT enrollments_withdrawn_by_fkey FOREIGN KEY (withdrawn_by) REFERENCES public.users(id) ON DELETE SET NULL;
