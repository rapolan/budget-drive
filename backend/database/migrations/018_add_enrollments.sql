-- Introduces the enrollments table, splitting "student" into a person
-- (identity, address, DOB, guardians, permit) plus one-or-more program
-- enrollments (driver_education or driver_training). Previously students
-- carried hours_required/status/completed*/track_override/license_type
-- directly, which assumed one program per person - false: a school offers
-- driver education (30hrs classroom/online) and driver training (6hrs
-- behind-the-wheel) as separate, separately-priced programs a person may
-- take one, both, or repeat (e.g. car training in 2026, motorcycle
-- training in 2028 - see the partial unique index below).
--
-- Scope this migration: build driver_training enrollments fully (hours,
-- progress, completion, lessons, fee flags). driver_education enrollments
-- exist as a type with manually entered completion date/hours only - no
-- lesson tracking, no scheduling, no curriculum (that is later work).
-- Certificates remain student_id-scoped this migration; certificates
-- becoming enrollment-scoped is deferred to a future session.
--
-- license_type and total_cost move here from students because they are
-- program attributes, not person attributes - a returning student's second
-- enrollment can be a different license_type and a different price.
-- total_paid/outstanding_balance/payment_status are NOT recreated here:
-- they were confirmed stale, uncached columns on students (only written by
-- a generic PATCH path, never kept in sync with payments) and are instead
-- computed at read time from payments.amount, the same derive-don't-cache
-- pattern computeStudentProgress already established for progress.
-- bsv_certificate_hash is dropped, not carried forward - confirmed dead
-- (nothing writes it) and will be reintroduced properly once certificates
-- become enrollment-scoped.

CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    program_type text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    enrollment_date date NOT NULL DEFAULT CURRENT_DATE,
    hours_required numeric(8,2) NOT NULL,
    track_override text,
    assigned_instructor_id uuid,
    license_type text NOT NULL DEFAULT 'car',
    -- Total charge for this enrollment. Nullable: when unset, the
    -- application derives it from this enrollment's lessons.cost; an
    -- explicit value here overrides that as a quoted package price.
    total_cost numeric(12,2),
    completed boolean DEFAULT false,
    completed_at timestamp without time zone,
    completed_by uuid,
    completion_reason text,
    -- Reopen audit trail, separate from the completion columns above -
    -- reopening is a new event, not an erasure of the completion record.
    reopened_at timestamp without time zone,
    reopened_by uuid,
    reopened_reason text,
    -- driver_training only: external driver_education prerequisite.
    external_de_completed boolean DEFAULT false,
    external_de_completed_date date,
    external_de_provider text,
    -- driver_education only: manually entered, no lesson tracking this session.
    manual_completed_hours numeric(8,2),
    -- BSV forward-compatibility: completion_hash is computed and stored at
    -- completion time (application code, Node's built-in crypto - no
    -- blockchain write). ledger_txid stays NULL until a future session wires
    -- actual anchoring through the LedgerService seam.
    completion_hash text,
    ledger_txid character varying(255),
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT enrollments_program_type_check CHECK (program_type IN ('driver_education','driver_training')),
    CONSTRAINT enrollments_status_check CHECK (status IN ('active','completed','inactive','suspended')),
    CONSTRAINT enrollments_track_override_check CHECK (track_override IS NULL OR track_override IN ('hours','lessons')),
    CONSTRAINT enrollments_license_type_check CHECK (license_type IN ('car','motorcycle','commercial'))
);

ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_assigned_instructor_id_fkey FOREIGN KEY (assigned_instructor_id) REFERENCES public.instructors(id);
ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_reopened_by_fkey FOREIGN KEY (reopened_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Exactly one ACTIVE driver_training enrollment per student at a time - not
-- "ever," since a person can complete driver_training, leave, and return
-- years later for a second driver_training enrollment under a different
-- license_type. A completed/inactive/suspended enrollment does not block a
-- new active one for the same program type.
CREATE UNIQUE INDEX idx_enrollments_one_active_driver_training
    ON public.enrollments (student_id) WHERE (program_type = 'driver_training' AND status = 'active');

CREATE INDEX idx_enrollments_student ON public.enrollments (student_id);
CREATE INDEX idx_enrollments_tenant ON public.enrollments (tenant_id);
CREATE INDEX idx_enrollments_status ON public.enrollments (status);

-- Backfill: exactly one driver_training enrollment per existing student,
-- carrying current program state (inherits the student's current status,
-- so a pre-refactor 'completed' student correctly backfills to a completed,
-- non-active enrollment - satisfying the one-ACTIVE-at-a-time invariant
-- without special-casing). Naturally a no-op against zero students.
INSERT INTO public.enrollments (
    tenant_id, student_id, program_type, status, enrollment_date, hours_required,
    track_override, assigned_instructor_id, license_type,
    completed, completed_at, completed_by, completion_reason
)
SELECT tenant_id, id, 'driver_training', status, enrollment_date, hours_required,
       track_override, assigned_instructor_id, license_type,
       completed, completed_at, completed_by, completion_reason
FROM public.students;

-- Repoint lessons, fee_flags, and payments at the driver_training enrollment.
-- student_id columns are left in place on all three tables - application
-- code still reads them until the service-layer commit repoints it; a
-- later, separate migration drops them once nothing references them.

ALTER TABLE public.lessons ADD COLUMN enrollment_id uuid;
UPDATE public.lessons l SET enrollment_id = e.id
FROM public.enrollments e
WHERE e.student_id = l.student_id AND e.program_type = 'driver_training';
ALTER TABLE public.lessons ALTER COLUMN enrollment_id SET NOT NULL;
ALTER TABLE public.lessons
    ADD CONSTRAINT lessons_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;
CREATE INDEX idx_lessons_enrollment ON public.lessons (enrollment_id);

ALTER TABLE public.fee_flags ADD COLUMN enrollment_id uuid;
UPDATE public.fee_flags f SET enrollment_id = e.id
FROM public.enrollments e
WHERE e.student_id = f.student_id AND e.program_type = 'driver_training';
ALTER TABLE public.fee_flags ALTER COLUMN enrollment_id SET NOT NULL;
ALTER TABLE public.fee_flags
    ADD CONSTRAINT fee_flags_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;
CREATE INDEX idx_fee_flags_enrollment ON public.fee_flags (enrollment_id);

ALTER TABLE public.payments ADD COLUMN enrollment_id uuid;
UPDATE public.payments p SET enrollment_id = e.id
FROM public.enrollments e
WHERE e.student_id = p.student_id AND e.program_type = 'driver_training';
ALTER TABLE public.payments ALTER COLUMN enrollment_id SET NOT NULL;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;
CREATE INDEX idx_payments_enrollment ON public.payments (enrollment_id);
