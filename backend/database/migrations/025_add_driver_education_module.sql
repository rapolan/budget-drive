-- Phase 3 of the compliance-records arc (docs/compliance-records-build-plan.md):
-- the driver-education classroom tracking module. Builds the classroom
-- delivery (DL 400B) properly - cohorts of 4 scheduled class days, each
-- tagged with a curriculum day (1-4), with per-student per-curriculum-day
-- attendance as the completion source of truth (never a per-cohort flag -
-- a student's completion is the union of attended days across ANY cohort,
-- which is what makes cross-cohort make-ups representable at all). Online
-- DE (DL 400C) stays exactly as minimal as driver_education already is
-- (manual_completed_hours, untouched by this migration) - no new schema
-- for it beyond the delivery-mode column below.
--
-- external_de_completed/external_de_completed_date/external_de_provider
-- (migration 018, on driver_training enrollments) are NOT touched here -
-- they record DE completed elsewhere, a different question from what this
-- migration tracks (DE completed in THIS system, day-by-day, for a real
-- DL 400B). manual_completed_hours (also 018, on driver_education
-- enrollments) is not removed either - it remains the completion signal
-- for online DE and any classroom DE enrollment created before this
-- feature existed.

-- A classroom class: 4 scheduled sessions + a teacher + a capacity.
-- status is a light, cosmetic bookkeeping field only (upcoming/in
-- progress/completed/cancelled, admin-settable) - it never gates
-- completion logic, which is entirely attendance-derived below. Not tied
-- to any one student (no enrollment_id here) - a scheduling container.
CREATE TABLE public.de_cohorts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    teacher_instructor_id uuid,
    capacity integer NOT NULL,
    status text NOT NULL DEFAULT 'scheduled',
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT de_cohorts_capacity_check CHECK (capacity > 0),
    CONSTRAINT de_cohorts_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

ALTER TABLE public.de_cohorts
    ADD CONSTRAINT de_cohorts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.de_cohorts
    ADD CONSTRAINT de_cohorts_teacher_instructor_id_fkey FOREIGN KEY (teacher_instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;
ALTER TABLE public.de_cohorts
    ADD CONSTRAINT de_cohorts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_de_cohorts_tenant ON public.de_cohorts (tenant_id);
CREATE INDEX idx_de_cohorts_status ON public.de_cohorts (status);

-- The 4 specific class dates for one cohort, each covering DISTINCT
-- material (curriculum_day 1-4 are not interchangeable). UNIQUE
-- (cohort_id, curriculum_day) makes "each day exactly once per cohort"
-- structural, not just a convention the app has to enforce by hand.
CREATE TABLE public.de_cohort_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    cohort_id uuid NOT NULL,
    curriculum_day smallint NOT NULL,
    session_date date NOT NULL,
    start_time time NOT NULL DEFAULT '08:00',
    end_time time NOT NULL DEFAULT '14:00',
    CONSTRAINT de_cohort_sessions_curriculum_day_check CHECK (curriculum_day BETWEEN 1 AND 4),
    CONSTRAINT de_cohort_sessions_one_day_per_cohort UNIQUE (cohort_id, curriculum_day)
);

ALTER TABLE public.de_cohort_sessions
    ADD CONSTRAINT de_cohort_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.de_cohort_sessions
    ADD CONSTRAINT de_cohort_sessions_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.de_cohorts(id) ON DELETE CASCADE;

CREATE INDEX idx_de_cohort_sessions_cohort ON public.de_cohort_sessions (cohort_id);
CREATE INDEX idx_de_cohort_sessions_date ON public.de_cohort_sessions (session_date);
CREATE INDEX idx_de_cohort_sessions_tenant ON public.de_cohort_sessions (tenant_id);

-- A student's HOME cohort - where they're enrolled for the roster view and
-- make-up bookkeeping. One driver_education enrollment joins at most one
-- cohort (UNIQUE on enrollment_id alone, not just the pair) - a student
-- doesn't "join" two cohorts; they join one and make up individual missed
-- days elsewhere via de_attendance rows that reference a DIFFERENT
-- cohort's session, tracked independently of this table.
CREATE TABLE public.de_cohort_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    cohort_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    joined_at timestamp without time zone DEFAULT now(),
    CONSTRAINT de_cohort_enrollments_unique_enrollment UNIQUE (enrollment_id)
);

ALTER TABLE public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.de_cohorts(id) ON DELETE CASCADE;
ALTER TABLE public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

CREATE INDEX idx_de_cohort_enrollments_cohort ON public.de_cohort_enrollments (cohort_id);
CREATE INDEX idx_de_cohort_enrollments_tenant ON public.de_cohort_enrollments (tenant_id);

-- THE completion source of truth. A row is a fact about (enrollment_id,
-- session_id) - which specific session (any cohort's) a student attended.
-- Completion is never a per-cohort flag: it's derived by counting DISTINCT
-- curriculum_day values across every present=true row for an enrollment,
-- regardless of which cohort each session belongs to - this is what makes
-- a cross-cohort make-up (attend Day 2 at a different cohort than your
-- home one) correctly count toward completion. The "a student can only be
-- present at one curriculum_day once, ever, across all cohorts" rule spans
-- sessions via curriculum_day and so is NOT expressible as a single-table
-- SQL constraint - it's enforced at the service layer (de_attendance.ts)
-- before every insert. UNIQUE (enrollment_id, session_id) below only
-- prevents a duplicate write for the exact same session (e.g. a
-- double-click), not the cross-session rule.
CREATE TABLE public.de_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    session_id uuid NOT NULL,
    present boolean NOT NULL DEFAULT true,
    recorded_by uuid,
    recorded_at timestamp without time zone DEFAULT now(),
    CONSTRAINT de_attendance_one_record_per_session UNIQUE (enrollment_id, session_id)
);

ALTER TABLE public.de_attendance
    ADD CONSTRAINT de_attendance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.de_attendance
    ADD CONSTRAINT de_attendance_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;
ALTER TABLE public.de_attendance
    ADD CONSTRAINT de_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.de_cohort_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.de_attendance
    ADD CONSTRAINT de_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_de_attendance_enrollment ON public.de_attendance (enrollment_id);
CREATE INDEX idx_de_attendance_session ON public.de_attendance (session_id);
CREATE INDEX idx_de_attendance_tenant ON public.de_attendance (tenant_id);

-- The missing Phase-2 signal: which DMV form a driver_education
-- enrollment resolves to. Nullable (irrelevant for driver_training rows;
-- also lets pre-existing driver_education rows, created before this
-- column existed, remain valid without a backfill guess), required at
-- creation time for any NEW driver_education enrollment via service-layer
-- validation, not a DB NOT NULL.
ALTER TABLE public.enrollments
    ADD COLUMN de_delivery_mode text;
ALTER TABLE public.enrollments
    ADD CONSTRAINT enrollments_de_delivery_mode_check
    CHECK (de_delivery_mode IS NULL OR de_delivery_mode IN ('classroom', 'online'));

-- The classroom-teacher capability flag, plus a credential pair kept
-- deliberately SEPARATE from instructor_license_number/_expiration (the
-- Driving School Instructor License / BTW credential, tied to the
-- existing instructor_license_notifications expiry-reminder system). An
-- instructor who teaches both classroom DE and BTW holds two distinct
-- credentials that can't share one pair of columns, and the DL 400B must
-- name the DE credential specifically. No expiry-notification pipeline
-- for de_credential_expiration this phase - these are plain recorded
-- fields only (see docs/ARCHITECTURE.md for the reasoning).
ALTER TABLE public.instructors
    ADD COLUMN is_de_teacher boolean NOT NULL DEFAULT false,
    ADD COLUMN de_credential_number text,
    ADD COLUMN de_credential_expiration date;

-- Feature flag (off by default per tenant) and the editable BTW discount
-- amount for students who complete the school's own internal DE.
ALTER TABLE public.tenant_settings
    ADD COLUMN enable_driver_education boolean NOT NULL DEFAULT false,
    ADD COLUMN de_discount_amount numeric(6,2) NOT NULL DEFAULT 5.00;

-- Auditability for the BTW discount: a nullable per-lesson record of how
-- much (if any) was subtracted for a completed-internal-DE student, so the
-- discount is visible on the lesson itself, never a silent price change.
ALTER TABLE public.lessons
    ADD COLUMN de_discount_applied numeric(6,2);
