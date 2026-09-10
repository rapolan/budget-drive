-- ============================================================================
-- 001_baseline.sql
--
-- Baseline schema, squashed 2026-09-10.
-- Derived from migration chain 001_baseline.sql (itself a 2026-07-27
-- squash of an earlier chain) through 033_add_notification_queue.sql -
-- a schema-only pg_dump of a database built by running that full 33-file
-- chain, with pg_dump's ownership/session-config noise stripped, matching
-- exactly how the 2026-07-27 squash was itself produced.
--
-- Verified byte-for-byte equivalent to the old 33-migration chain's end
-- state before this file replaced it: a fresh database migrated with the
-- old chain and a fresh database migrated with only this file were both
-- schema-dumped and diffed - zero differences (same tables, columns,
-- types, defaults, constraints, indexes, foreign keys, triggers). See
-- docs/ARCHITECTURE.md for the verification record.
--
-- This squash was done before any real production data existed, per
-- docs/safe-updates-and-deployment.md's one-time squash allowance and
-- CLAUDE.md's append-only migration policy. From this point forward,
-- append-only applies with NO exceptions - see CLAUDE.md.
--
-- One deliberate deviation from a literal pg_dump copy: certificates_
-- status_check is written as CHECK (status IN (...)) rather than the
-- ((ARRAY[...])::text[]) form pg_dump itself would emit for it. Postgres
-- does not stably re-canonicalize that specific cast pattern when it is
-- fed back in as fresh SQL (confirmed empirically) - re-running this file
-- would silently drift that one constraint's stored form on every fresh
-- database otherwise, even though the enforced rule is identical either
-- way. Every other constraint below is pg_dump's literal, verified-stable
-- output.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: blockchain_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blockchain_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    transaction_type character varying(50),
    transaction_hash character varying(255) NOT NULL,
    blockchain character varying(50) DEFAULT 'bsv'::character varying,
    payment_id uuid,
    certificate_id uuid,
    lesson_id uuid,
    amount numeric(12,2),
    data_payload jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    confirmations integer DEFAULT 0,
    confirmed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT blockchain_records_blockchain_check CHECK (((blockchain)::text = ANY (ARRAY[('bsv'::character varying)::text, ('mnee'::character varying)::text]))),
    CONSTRAINT blockchain_records_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('confirmed'::character varying)::text, ('failed'::character varying)::text]))),
    CONSTRAINT blockchain_records_transaction_type_check CHECK (((transaction_type)::text = ANY (ARRAY[('payment'::character varying)::text, ('certificate'::character varying)::text, ('lesson_record'::character varying)::text])))
);


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    serial_number character varying(50) NOT NULL,
    issue_date date NOT NULL,
    issued_by_instructor_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    enrollment_id uuid,
    form_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'issued'::character varying NOT NULL,
    void_reason text,
    recorded_by uuid,
    completion_hash text,
    ledger_txid character varying(255),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT certificates_status_check CHECK (status IN ('issued', 'void'))
);


--
-- Name: de_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.de_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    session_id uuid NOT NULL,
    present boolean DEFAULT true NOT NULL,
    recorded_by uuid,
    recorded_at timestamp without time zone DEFAULT now()
);


--
-- Name: de_cohort_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.de_cohort_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    cohort_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    joined_at timestamp without time zone DEFAULT now()
);


--
-- Name: de_cohort_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.de_cohort_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    cohort_id uuid NOT NULL,
    curriculum_day smallint NOT NULL,
    session_date date NOT NULL,
    start_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    end_time time without time zone DEFAULT '14:00:00'::time without time zone NOT NULL,
    CONSTRAINT de_cohort_sessions_curriculum_day_check CHECK (((curriculum_day >= 1) AND (curriculum_day <= 4)))
);


--
-- Name: de_cohorts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.de_cohorts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    teacher_instructor_id uuid,
    capacity integer NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT de_cohorts_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT de_cohorts_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    program_type text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    enrollment_date date DEFAULT CURRENT_DATE NOT NULL,
    hours_required numeric(8,2) NOT NULL,
    track_override text,
    assigned_instructor_id uuid,
    license_type text DEFAULT 'car'::text NOT NULL,
    total_cost numeric(12,2),
    completed boolean DEFAULT false,
    completed_at timestamp without time zone,
    completed_by uuid,
    completion_reason text,
    reopened_at timestamp without time zone,
    reopened_by uuid,
    reopened_reason text,
    external_de_completed boolean DEFAULT false,
    external_de_completed_date date,
    external_de_provider text,
    manual_completed_hours numeric(8,2),
    completion_hash text,
    ledger_txid character varying(255),
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    withdrawn_at timestamp without time zone,
    withdrawn_reason text,
    withdrawn_by uuid,
    de_delivery_mode text,
    CONSTRAINT enrollments_de_delivery_mode_check CHECK (((de_delivery_mode IS NULL) OR (de_delivery_mode = ANY (ARRAY['classroom'::text, 'online'::text])))),
    CONSTRAINT enrollments_license_type_check CHECK ((license_type = ANY (ARRAY['car'::text, 'motorcycle'::text, 'commercial'::text]))),
    CONSTRAINT enrollments_program_type_check CHECK ((program_type = ANY (ARRAY['driver_education'::text, 'driver_training'::text]))),
    CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'inactive'::text, 'suspended'::text, 'withdrawn'::text]))),
    CONSTRAINT enrollments_track_override_check CHECK (((track_override IS NULL) OR (track_override = ANY (ARRAY['hours'::text, 'lessons'::text]))))
);


--
-- Name: fee_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'outstanding'::text NOT NULL,
    waived_by uuid,
    waived_reason text,
    waived_at timestamp without time zone,
    paid_payment_id uuid,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    enrollment_id uuid NOT NULL,
    CONSTRAINT fee_flags_status_check CHECK ((status = ANY (ARRAY['outstanding'::text, 'cleared'::text, 'waived'::text, 'paid'::text])))
);


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    entity_type character varying(50) NOT NULL,
    lead_id uuid,
    student_id uuid,
    assigned_to uuid,
    follow_up_type character varying(50),
    status character varying(50) DEFAULT 'pending'::character varying,
    scheduled_date date NOT NULL,
    completed_date date,
    next_follow_up_date date,
    outcome character varying(100),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT follow_ups_entity_type_check CHECK (((entity_type)::text = ANY (ARRAY[('lead'::character varying)::text, ('student'::character varying)::text, ('inactive_student'::character varying)::text]))),
    CONSTRAINT follow_ups_follow_up_type_check CHECK (((follow_up_type)::text = ANY (ARRAY[('call'::character varying)::text, ('email'::character varying)::text, ('sms'::character varying)::text, ('in_person'::character varying)::text]))),
    CONSTRAINT follow_ups_outcome_check CHECK (((outcome)::text = ANY (ARRAY[('enrolled'::character varying)::text, ('still_interested'::character varying)::text, ('not_interested'::character varying)::text, ('no_response'::character varying)::text, ('callback_requested'::character varying)::text]))),
    CONSTRAINT follow_ups_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('completed'::character varying)::text, ('skipped'::character varying)::text, ('rescheduled'::character varying)::text])))
);


--
-- Name: guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    email character varying(255),
    phone character varying(50),
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT guardians_email_or_phone_check CHECK (((email IS NOT NULL) OR (phone IS NOT NULL)))
);


--
-- Name: installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_plan_id uuid NOT NULL,
    installment_number integer NOT NULL,
    due_date date NOT NULL,
    amount_due numeric(12,2) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    paid_date date,
    payment_id uuid,
    late_fee numeric(10,2) DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT installments_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('paid'::character varying)::text, ('late'::character varying)::text, ('waived'::character varying)::text])))
);


--
-- Name: instructor_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean DEFAULT true,
    effective_from date,
    effective_until date,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    max_students integer,
    CONSTRAINT instructor_availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: instructor_calendar_auth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_calendar_auth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    token_expiry timestamp without time zone,
    calendar_provider character varying(50) DEFAULT 'google'::character varying,
    calendar_id text,
    is_active boolean DEFAULT true,
    last_sync_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT instructor_calendar_auth_calendar_provider_check CHECK (((calendar_provider)::text = ANY (ARRAY[('google'::character varying)::text, ('apple'::character varying)::text, ('outlook'::character varying)::text])))
);


--
-- Name: instructor_certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_certifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    certification_type character varying(100),
    certification_number character varying(100),
    issue_date date NOT NULL,
    expiration_date date NOT NULL,
    issuing_authority character varying(255),
    document_url text,
    status character varying(50) DEFAULT 'valid'::character varying,
    reminder_sent boolean DEFAULT false,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT instructor_certifications_certification_type_check CHECK (((certification_type)::text = ANY (ARRAY[('drivers_license'::character varying)::text, ('instructor_license'::character varying)::text, ('cpr'::character varying)::text, ('first_aid'::character varying)::text, ('defensive_driving'::character varying)::text, ('other'::character varying)::text]))),
    CONSTRAINT instructor_certifications_status_check CHECK (((status)::text = ANY (ARRAY[('valid'::character varying)::text, ('expired'::character varying)::text, ('pending_renewal'::character varying)::text, ('revoked'::character varying)::text])))
);


--
-- Name: instructor_ical_feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_ical_feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instructor_id uuid NOT NULL,
    feed_url text NOT NULL,
    feed_token character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    include_student_names boolean DEFAULT false,
    include_student_phones boolean DEFAULT false,
    last_accessed_at timestamp without time zone,
    access_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: instructor_license_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_license_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    expiration_date date NOT NULL,
    threshold integer NOT NULL,
    notified_at timestamp without time zone DEFAULT now()
);


--
-- Name: instructor_service_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_service_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    zip_code character varying(5) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT instructor_service_areas_zip_format_check CHECK (((zip_code)::text ~ '^\d{5}$'::text))
);


--
-- Name: instructor_time_off; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_time_off (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    reason character varying(100) NOT NULL,
    notes text,
    is_approved boolean DEFAULT true,
    approved_by uuid,
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT instructor_time_off_reason_check CHECK (((reason)::text = ANY (ARRAY[('vacation'::character varying)::text, ('sick'::character varying)::text, ('personal'::character varying)::text, ('training'::character varying)::text, ('maintenance'::character varying)::text, ('holiday'::character varying)::text, ('other'::character varying)::text])))
);


--
-- Name: instructor_vehicle_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructor_vehicle_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    is_primary_vehicle boolean DEFAULT false,
    can_use boolean DEFAULT true,
    assigned_date date DEFAULT CURRENT_DATE NOT NULL,
    unassigned_date date,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: instructors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instructors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(255) NOT NULL,
    date_of_birth date,
    address text,
    employment_type character varying(50) DEFAULT 'w2_employee'::character varying,
    hire_date date NOT NULL,
    termination_date date,
    status character varying(50) DEFAULT 'active'::character varying,
    drivers_license_number character varying(50),
    drivers_license_expiration date,
    instructor_license_number character varying(50),
    instructor_license_expiration date,
    provides_own_vehicle boolean DEFAULT false,
    mileage_reimbursement_rate numeric(5,2) DEFAULT 0.67,
    availability jsonb,
    hourly_rate numeric(10,2),
    rating numeric(3,2),
    total_lessons_taught integer DEFAULT 0,
    google_calendar_connected boolean DEFAULT false,
    calendar_feed_token character varying(64),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(255),
    state character varying(50),
    zip_code character varying(20),
    created_by uuid,
    updated_by uuid,
    is_de_teacher boolean DEFAULT false NOT NULL,
    de_credential_number text,
    de_credential_expiration date,
    CONSTRAINT instructors_employment_type_check CHECK (((employment_type)::text = ANY (ARRAY[('w2_employee'::character varying)::text, ('independent_contractor'::character varying)::text]))),
    CONSTRAINT instructors_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('on_leave'::character varying)::text, ('terminated'::character varying)::text])))
);


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL,
    lesson_ids uuid[],
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    invoice_number character varying(50) NOT NULL,
    issue_date date NOT NULL,
    due_date date NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    discount_reason text,
    total_amount numeric(12,2) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0,
    balance_due numeric(12,2) NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying,
    payment_terms character varying(50) DEFAULT 'due_on_receipt'::character varying,
    sent_at timestamp without time zone,
    paid_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT invoices_payment_terms_check CHECK (((payment_terms)::text = ANY (ARRAY[('due_on_receipt'::character varying)::text, ('net_15'::character varying)::text, ('net_30'::character varying)::text, ('net_60'::character varying)::text]))),
    CONSTRAINT invoices_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('sent'::character varying)::text, ('paid'::character varying)::text, ('overdue'::character varying)::text, ('cancelled'::character varying)::text, ('refunded'::character varying)::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    full_name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(255) NOT NULL,
    source character varying(100),
    status character varying(50) DEFAULT 'new'::character varying,
    interest_level character varying(50),
    preferred_contact_method character varying(50),
    assigned_to_instructor_id uuid,
    first_contact_date date,
    last_contact_date date,
    next_follow_up_date date,
    converted_to_student_id uuid,
    conversion_date date,
    lost_reason text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT leads_interest_level_check CHECK (((interest_level)::text = ANY (ARRAY[('hot'::character varying)::text, ('warm'::character varying)::text, ('cold'::character varying)::text]))),
    CONSTRAINT leads_preferred_contact_method_check CHECK (((preferred_contact_method)::text = ANY (ARRAY[('email'::character varying)::text, ('phone'::character varying)::text, ('sms'::character varying)::text, ('any'::character varying)::text]))),
    CONSTRAINT leads_source_check CHECK (((source)::text = ANY (ARRAY[('website'::character varying)::text, ('referral'::character varying)::text, ('google_ads'::character varying)::text, ('facebook'::character varying)::text, ('instagram'::character varying)::text, ('walk_in'::character varying)::text, ('phone'::character varying)::text, ('other'::character varying)::text]))),
    CONSTRAINT leads_status_check CHECK (((status)::text = ANY (ARRAY[('new'::character varying)::text, ('contacted'::character varying)::text, ('interested'::character varying)::text, ('enrolled'::character varying)::text, ('lost'::character varying)::text])))
);


--
-- Name: lesson_calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    calendar_provider character varying(50),
    external_event_id text,
    sync_status character varying(50) DEFAULT 'pending'::character varying,
    last_synced_at timestamp without time zone,
    sync_error text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT lesson_calendar_events_calendar_provider_check CHECK (((calendar_provider)::text = ANY (ARRAY[('google'::character varying)::text, ('apple'::character varying)::text, ('outlook'::character varying)::text]))),
    CONSTRAINT lesson_calendar_events_sync_status_check CHECK (((sync_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('synced'::character varying)::text, ('failed'::character varying)::text, ('deleted'::character varying)::text])))
);


--
-- Name: lesson_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    student_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    responded_at timestamp without time zone,
    message text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT lesson_invites_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('accepted'::character varying)::text, ('declined'::character varying)::text, ('expired'::character varying)::text])))
);


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    duration numeric(5,2) NOT NULL,
    lesson_number integer,
    pickup_address text,
    status text DEFAULT 'scheduled'::text,
    lesson_type text NOT NULL,
    skills_practiced text[],
    student_performance text,
    instructor_rating integer,
    notes text,
    completion_verified boolean DEFAULT false,
    cost numeric(10,2) NOT NULL,
    bsv_record_hash character varying(255),
    coda_row_id character varying(255),
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    reviewed_by uuid,
    reviewed_at timestamp without time zone,
    enrollment_id uuid NOT NULL,
    de_discount_applied numeric(6,2),
    CONSTRAINT lessons_instructor_rating_check CHECK (((instructor_rating >= 1) AND (instructor_rating <= 5))),
    CONSTRAINT lessons_lesson_type_check CHECK ((lesson_type = ANY (ARRAY['behind_wheel'::text, 'classroom'::text, 'road_test_prep'::text]))),
    CONSTRAINT lessons_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]))),
    CONSTRAINT lessons_student_performance_check CHECK ((student_performance = ANY (ARRAY['excellent'::text, 'good'::text, 'needs_improvement'::text, 'poor'::text])))
);


--
-- Name: mileage_reimbursement_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mileage_reimbursement_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_trips integer NOT NULL,
    total_miles integer NOT NULL,
    average_rate numeric(5,2) NOT NULL,
    total_reimbursement numeric(10,2) NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying,
    submitted_by_instructor_at timestamp without time zone,
    reviewed_by_admin_id uuid,
    approved_at timestamp without time zone,
    paid_date date,
    paid_in_payroll_id uuid,
    report_pdf_url text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT mileage_reimbursement_reports_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('submitted'::character varying)::text, ('approved'::character varying)::text, ('paid'::character varying)::text, ('disputed'::character varying)::text])))
);


--
-- Name: notification_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    notification_type text NOT NULL,
    recipient_email text NOT NULL,
    recipient_type text NOT NULL,
    scheduled_send_time timestamp without time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp without time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp without time zone,
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT notification_queue_notification_type_check CHECK ((notification_type = ANY (ARRAY['booking_confirmation'::text, 'reminder_24h'::text, 'reminder_1h'::text, 'cancellation'::text]))),
    CONSTRAINT notification_queue_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['student'::text, 'instructor'::text]))),
    CONSTRAINT notification_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    template_key character varying(100) NOT NULL,
    channel character varying(20) NOT NULL,
    name character varying(255) NOT NULL,
    subject character varying(255),
    body text NOT NULL,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT notification_templates_channel_check CHECK (((channel)::text = ANY (ARRAY[('email'::character varying)::text, ('sms'::character varying)::text, ('in_app'::character varying)::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    action_url text,
    action_label character varying(100),
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    related_entity_type character varying(50),
    related_entity_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY (ARRAY[('lesson_reminder'::character varying)::text, ('lesson_cancelled'::character varying)::text, ('lesson_rescheduled'::character varying)::text, ('payment_received'::character varying)::text, ('payment_overdue'::character varying)::text, ('certificate_issued'::character varying)::text, ('instructor_assigned'::character varying)::text, ('time_off_approved'::character varying)::text, ('follow_up_due'::character varying)::text, ('system'::character varying)::text, ('general'::character varying)::text, ('license_expiring'::character varying)::text])))
);


--
-- Name: payment_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    down_payment numeric(12,2) DEFAULT 0 NOT NULL,
    num_installments integer NOT NULL,
    installment_amount numeric(12,2) NOT NULL,
    frequency character varying(50) NOT NULL,
    start_date date NOT NULL,
    next_due_date date,
    status character varying(50) DEFAULT 'active'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT payment_plans_frequency_check CHECK (((frequency)::text = ANY (ARRAY[('weekly'::character varying)::text, ('bi_weekly'::character varying)::text, ('monthly'::character varying)::text]))),
    CONSTRAINT payment_plans_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('completed'::character varying)::text, ('defaulted'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_method text NOT NULL,
    payment_type character varying(255) NOT NULL,
    status text DEFAULT 'pending'::text,
    confirmation_date timestamp without time zone,
    related_lesson_ids uuid[],
    invoice_id uuid,
    bsv_transaction_id character varying(255),
    receipt_sent boolean DEFAULT false,
    receipt_url text,
    notes text,
    coda_row_id character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    enrollment_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    reference_number text,
    CONSTRAINT payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['bsv'::text, 'mnee'::text, 'stripe_card'::text, 'paypal'::text, 'cash'::text, 'check'::text, 'debit'::text, 'credit'::text, 'venmo'::text, 'zelle'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: recurring_lesson_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_lesson_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    vehicle_id uuid,
    frequency character varying(20) NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    duration integer DEFAULT 120 NOT NULL,
    pattern_start_date date NOT NULL,
    pattern_end_date date,
    lesson_type character varying(50) DEFAULT 'behind_wheel'::character varying,
    cost numeric(10,2),
    notes text,
    status character varying(20) DEFAULT 'active'::character varying,
    total_lessons_generated integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT recurring_lesson_patterns_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT recurring_lesson_patterns_frequency_check CHECK (((frequency)::text = ANY (ARRAY[('weekly'::character varying)::text, ('bi_weekly'::character varying)::text, ('monthly'::character varying)::text]))),
    CONSTRAINT recurring_lesson_patterns_lesson_type_check CHECK (((lesson_type)::text = ANY (ARRAY[('behind_wheel'::character varying)::text, ('classroom'::character varying)::text, ('road_test_prep'::character varying)::text]))),
    CONSTRAINT recurring_lesson_patterns_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('paused'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: scheduling_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduling_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    default_lesson_duration integer DEFAULT 120 NOT NULL,
    lesson_duration_templates jsonb DEFAULT '[{"name": "Quick (1 hour)", "minutes": 60}, {"name": "Standard (2 hours)", "minutes": 120}, {"name": "Extended (2.5 hours)", "minutes": 150}, {"name": "Intensive (3 hours)", "minutes": 180}]'::jsonb,
    buffer_time_between_lessons integer DEFAULT 15 NOT NULL,
    buffer_time_before_first_lesson integer DEFAULT 0 NOT NULL,
    buffer_time_after_last_lesson integer DEFAULT 0 NOT NULL,
    min_hours_advance_booking integer DEFAULT 24 NOT NULL,
    max_days_advance_booking integer DEFAULT 60 NOT NULL,
    allow_back_to_back_lessons boolean DEFAULT false,
    default_work_start_time time without time zone DEFAULT '07:00:00'::time without time zone,
    default_work_end_time time without time zone DEFAULT '20:00:00'::time without time zone,
    default_max_students_per_day integer DEFAULT 3 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: student_guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_guardians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    guardian_id uuid NOT NULL,
    relationship text,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT student_guardians_relationship_check CHECK ((relationship = ANY (ARRAY['mother'::text, 'father'::text, 'grandparent'::text, 'legal_guardian'::text, 'other'::text])))
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    full_name character varying(255),
    first_name character varying(255),
    last_name character varying(255),
    middle_name character varying(255),
    email character varying(255),
    phone character varying(255),
    date_of_birth date,
    address text,
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(255),
    state character varying(50),
    zip_code character varying(20),
    emergency_contact_phone character varying(50),
    emergency_contact_2_phone character varying(50),
    learner_permit_number character varying(100),
    learner_permit_issue_date date,
    learner_permit_expiration date,
    coda_row_id character varying(255),
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    emergency_contact_first_name character varying(255),
    emergency_contact_last_name character varying(255),
    emergency_contact_2_first_name character varying(255),
    emergency_contact_2_last_name character varying(255),
    pickup_address_different_from_home boolean DEFAULT false NOT NULL,
    pickup_address_line1 character varying,
    pickup_address_line2 character varying,
    pickup_city character varying,
    pickup_state character varying,
    pickup_zip_code character varying,
    archived_at timestamp without time zone,
    archived_by uuid,
    archive_hash text,
    archive_ledger_txid character varying(255),
    archive_held boolean DEFAULT false NOT NULL,
    archive_hold_reason text,
    archive_held_at timestamp without time zone,
    archive_held_by uuid,
    last_contacted_at timestamp without time zone
);


--
-- Name: tenant_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    business_name character varying(255) NOT NULL,
    business_tagline character varying(500),
    logo_url text,
    favicon_url text,
    primary_color character varying(7) DEFAULT '#3B82F6'::character varying,
    secondary_color character varying(7) DEFAULT '#8B5CF6'::character varying,
    accent_color character varying(7) DEFAULT '#10B981'::character varying,
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    state character varying(100),
    zip_code character varying(20),
    country character varying(100) DEFAULT 'USA'::character varying,
    support_email character varying(255),
    support_phone character varying(50),
    website_url character varying(255),
    business_hours jsonb DEFAULT '{"friday": {"open": "08:00", "close": "18:00", "closed": false}, "monday": {"open": "08:00", "close": "18:00", "closed": false}, "sunday": {"open": "10:00", "close": "14:00", "closed": true}, "tuesday": {"open": "08:00", "close": "18:00", "closed": false}, "saturday": {"open": "09:00", "close": "15:00", "closed": false}, "thursday": {"open": "08:00", "close": "18:00", "closed": false}, "wednesday": {"open": "08:00", "close": "18:00", "closed": false}}'::jsonb,
    enable_blockchain boolean DEFAULT true,
    enable_google_calendar boolean DEFAULT true,
    enable_apple_calendar boolean DEFAULT true,
    enable_certificates boolean DEFAULT true,
    enable_multi_payment boolean DEFAULT true,
    enable_follow_up_tracker boolean DEFAULT true,
    enable_student_portal boolean DEFAULT true,
    enable_instructor_portal boolean DEFAULT true,
    enable_sms_notifications boolean DEFAULT false,
    enable_email_notifications boolean DEFAULT true,
    timezone character varying(100),
    date_format character varying(50) DEFAULT 'MM/DD/YYYY'::character varying,
    time_format character varying(50) DEFAULT '12h'::character varying,
    currency_code character varying(3) DEFAULT 'USD'::character varying,
    currency_symbol character varying(5) DEFAULT '$'::character varying,
    language character varying(10) DEFAULT 'en'::character varying,
    dashboard_widgets jsonb DEFAULT '[{"id": "students", "order": 1, "enabled": true}, {"id": "lessons", "order": 2, "enabled": true}, {"id": "revenue", "order": 3, "enabled": true}, {"id": "blockchain", "order": 4, "enabled": true}, {"id": "certificates", "order": 5, "enabled": true}, {"id": "conversion", "order": 6, "enabled": true}]'::jsonb,
    default_hours_required numeric(5,2) DEFAULT 6,
    enable_blockchain_payments boolean DEFAULT false,
    terms_of_service_url text,
    privacy_policy_url text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    standard_lesson_length_minutes integer DEFAULT 120,
    default_lesson_cost numeric(10,2) DEFAULT 150 NOT NULL,
    max_lessons_per_student_per_day integer DEFAULT 1 NOT NULL,
    lesson_completion_mode text DEFAULT 'manual'::text NOT NULL,
    cancellation_fee_amount numeric(10,2) DEFAULT 50 NOT NULL,
    cancellation_fee_window_hours integer DEFAULT 24 NOT NULL,
    cancellation_fee_payee text DEFAULT 'instructor'::text NOT NULL,
    license_number character varying(50),
    enable_driver_education boolean DEFAULT false NOT NULL,
    de_discount_amount numeric(6,2) DEFAULT 5.00 NOT NULL,
    default_de_hours_required numeric(5,2) DEFAULT 30 NOT NULL,
    archive_inactivity_grace_days integer DEFAULT 90 NOT NULL,
    default_de_classroom_cost numeric(10,2) DEFAULT 150.00 NOT NULL,
    default_de_online_cost numeric(10,2) DEFAULT 150.00 NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    domain character varying(255),
    email character varying(255) NOT NULL,
    phone character varying(50),
    status character varying(50) DEFAULT 'active'::character varying,
    plan_tier character varying(50) DEFAULT 'enterprise'::character varying,
    trial_ends_at timestamp without time zone,
    subscription_starts_at timestamp without time zone,
    subscription_ends_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT tenants_plan_tier_check CHECK (((plan_tier)::text = ANY (ARRAY[('basic'::character varying)::text, ('professional'::character varying)::text, ('enterprise'::character varying)::text]))),
    CONSTRAINT tenants_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('suspended'::character varying)::text, ('cancelled'::character varying)::text, ('trial'::character varying)::text])))
);


--
-- Name: tenant_full_info; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tenant_full_info AS
 SELECT t.id,
    t.name,
    t.slug,
    t.domain,
    t.email,
    t.phone,
    t.status,
    t.plan_tier,
    t.trial_ends_at,
    t.subscription_starts_at,
    t.subscription_ends_at,
    t.created_at,
    t.updated_at,
    ts.business_name,
    ts.business_tagline,
    ts.logo_url,
    ts.primary_color,
    ts.secondary_color,
    ts.accent_color,
    ts.support_email,
    ts.support_phone,
    ts.website_url,
    ts.city,
    ts.state,
    ts.timezone,
    ts.currency_code,
    ts.currency_symbol,
    ts.enable_blockchain,
    ts.enable_google_calendar,
    ts.enable_certificates,
    ts.enable_multi_payment,
    ts.enable_follow_up_tracker,
    ts.enable_student_portal,
    ts.enable_instructor_portal,
    ts.dashboard_widgets
   FROM (public.tenants t
     LEFT JOIN public.tenant_settings ts ON ((t.id = ts.tenant_id)));


--
-- Name: user_tenant_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tenant_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    accepted_at timestamp without time zone,
    invited_by uuid,
    invited_at timestamp without time zone,
    instructor_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    invite_token_hash character varying(255),
    invite_token_expires_at timestamp without time zone,
    CONSTRAINT user_tenant_memberships_role_check CHECK (((role)::text = ANY (ARRAY[('owner'::character varying)::text, ('admin'::character varying)::text, ('instructor'::character varying)::text, ('staff'::character varying)::text, ('viewer'::character varying)::text]))),
    CONSTRAINT user_tenant_memberships_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('invited'::character varying)::text, ('suspended'::character varying)::text, ('declined'::character varying)::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(20),
    profile_photo_url text,
    email_verified boolean DEFAULT false,
    status character varying(20) DEFAULT 'active'::character varying,
    last_login_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT check_password_hash_length CHECK ((length((password_hash)::text) = 60)),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('suspended'::character varying)::text])))
);


--
-- Name: vehicle_maintenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_maintenance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    maintenance_type character varying(100),
    service_date date NOT NULL,
    mileage_at_service integer NOT NULL,
    cost numeric(10,2) NOT NULL,
    vendor character varying(255),
    next_service_date date,
    next_service_mileage integer,
    description text,
    receipt_url text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT vehicle_maintenance_maintenance_type_check CHECK (((maintenance_type)::text = ANY (ARRAY[('oil_change'::character varying)::text, ('tire_rotation'::character varying)::text, ('brake_service'::character varying)::text, ('inspection'::character varying)::text, ('repair'::character varying)::text, ('other'::character varying)::text])))
);


--
-- Name: vehicle_mileage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_mileage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    trip_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    starting_odometer integer NOT NULL,
    ending_odometer integer NOT NULL,
    total_miles integer GENERATED ALWAYS AS ((ending_odometer - starting_odometer)) STORED,
    lesson_id uuid,
    purpose character varying(50),
    reimbursement_rate numeric(5,2),
    reimbursement_amount numeric(8,2) GENERATED ALWAYS AS ((((ending_odometer - starting_odometer))::numeric * COALESCE(reimbursement_rate, (0)::numeric))) STORED,
    reimbursement_status character varying(50) DEFAULT 'pending'::character varying,
    paid_in_payroll_id uuid,
    start_location_address text,
    end_location_address text,
    route_notes text,
    odometer_photo_start_url text,
    odometer_photo_end_url text,
    submitted_by_instructor_at timestamp without time zone,
    approved_by_admin_id uuid,
    approved_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT vehicle_mileage_log_purpose_check CHECK (((purpose)::text = ANY (ARRAY[('lesson'::character varying)::text, ('pickup_student'::character varying)::text, ('vehicle_maintenance'::character varying)::text, ('administrative'::character varying)::text, ('other'::character varying)::text]))),
    CONSTRAINT vehicle_mileage_log_reimbursement_status_check CHECK (((reimbursement_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('paid'::character varying)::text, ('not_applicable'::character varying)::text])))
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    ownership_type character varying(50) NOT NULL,
    owner_instructor_id uuid,
    make character varying(100) NOT NULL,
    model character varying(100) NOT NULL,
    year integer NOT NULL,
    color character varying(50),
    license_plate character varying(20) NOT NULL,
    vin character varying(50),
    registration_expiration date NOT NULL,
    insurance_provider character varying(255),
    insurance_policy_number character varying(100),
    insurance_expiration date NOT NULL,
    dmv_inspection_date date,
    dmv_inspection_expiration date,
    has_dual_controls boolean DEFAULT false,
    current_mileage integer DEFAULT 0 NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    last_oil_change_mileage integer,
    next_oil_change_mileage integer,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT vehicles_ownership_type_check CHECK (((ownership_type)::text = ANY (ARRAY[('school_owned'::character varying)::text, ('instructor_owned'::character varying)::text, ('leased'::character varying)::text]))),
    CONSTRAINT vehicles_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('maintenance'::character varying)::text, ('inactive'::character varying)::text, ('retired'::character varying)::text])))
);


--
-- Name: blockchain_records blockchain_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blockchain_records
    ADD CONSTRAINT blockchain_records_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: de_attendance de_attendance_one_record_per_session; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_attendance
    ADD CONSTRAINT de_attendance_one_record_per_session UNIQUE (enrollment_id, session_id);


--
-- Name: de_attendance de_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_attendance
    ADD CONSTRAINT de_attendance_pkey PRIMARY KEY (id);


--
-- Name: de_cohort_enrollments de_cohort_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_pkey PRIMARY KEY (id);


--
-- Name: de_cohort_enrollments de_cohort_enrollments_unique_enrollment; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_unique_enrollment UNIQUE (enrollment_id);


--
-- Name: de_cohort_sessions de_cohort_sessions_one_day_per_cohort; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_sessions
    ADD CONSTRAINT de_cohort_sessions_one_day_per_cohort UNIQUE (cohort_id, curriculum_day);


--
-- Name: de_cohort_sessions de_cohort_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_sessions
    ADD CONSTRAINT de_cohort_sessions_pkey PRIMARY KEY (id);


--
-- Name: de_cohorts de_cohorts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohorts
    ADD CONSTRAINT de_cohorts_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: fee_flags fee_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_flags
    ADD CONSTRAINT fee_flags_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: guardians guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);


--
-- Name: installments installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installments
    ADD CONSTRAINT installments_pkey PRIMARY KEY (id);


--
-- Name: instructor_availability instructor_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_availability
    ADD CONSTRAINT instructor_availability_pkey PRIMARY KEY (id);


--
-- Name: instructor_calendar_auth instructor_calendar_auth_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_calendar_auth
    ADD CONSTRAINT instructor_calendar_auth_instructor_id_key UNIQUE (instructor_id);


--
-- Name: instructor_calendar_auth instructor_calendar_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_calendar_auth
    ADD CONSTRAINT instructor_calendar_auth_pkey PRIMARY KEY (id);


--
-- Name: instructor_certifications instructor_certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_certifications
    ADD CONSTRAINT instructor_certifications_pkey PRIMARY KEY (id);


--
-- Name: instructor_ical_feeds instructor_ical_feeds_feed_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_ical_feeds
    ADD CONSTRAINT instructor_ical_feeds_feed_token_key UNIQUE (feed_token);


--
-- Name: instructor_ical_feeds instructor_ical_feeds_instructor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_ical_feeds
    ADD CONSTRAINT instructor_ical_feeds_instructor_id_key UNIQUE (instructor_id);


--
-- Name: instructor_ical_feeds instructor_ical_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_ical_feeds
    ADD CONSTRAINT instructor_ical_feeds_pkey PRIMARY KEY (id);


--
-- Name: instructor_license_notifications instructor_license_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_license_notifications
    ADD CONSTRAINT instructor_license_notifications_pkey PRIMARY KEY (id);


--
-- Name: instructor_license_notifications instructor_license_notifications_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_license_notifications
    ADD CONSTRAINT instructor_license_notifications_unique UNIQUE (instructor_id, expiration_date, threshold);


--
-- Name: instructor_service_areas instructor_service_areas_instructor_id_zip_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_service_areas
    ADD CONSTRAINT instructor_service_areas_instructor_id_zip_code_key UNIQUE (instructor_id, zip_code);


--
-- Name: instructor_service_areas instructor_service_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_service_areas
    ADD CONSTRAINT instructor_service_areas_pkey PRIMARY KEY (id);


--
-- Name: instructor_time_off instructor_time_off_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_time_off
    ADD CONSTRAINT instructor_time_off_pkey PRIMARY KEY (id);


--
-- Name: instructor_vehicle_assignments instructor_vehicle_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_vehicle_assignments
    ADD CONSTRAINT instructor_vehicle_assignments_pkey PRIMARY KEY (id);


--
-- Name: instructors instructors_calendar_feed_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_calendar_feed_token_key UNIQUE (calendar_feed_token);


--
-- Name: instructors instructors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: lesson_calendar_events lesson_calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_calendar_events
    ADD CONSTRAINT lesson_calendar_events_pkey PRIMARY KEY (id);


--
-- Name: lesson_invites lesson_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_invites
    ADD CONSTRAINT lesson_invites_pkey PRIMARY KEY (id);


--
-- Name: lesson_invites lesson_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_invites
    ADD CONSTRAINT lesson_invites_token_key UNIQUE (token);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: mileage_reimbursement_reports mileage_reimbursement_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_reimbursement_reports
    ADD CONSTRAINT mileage_reimbursement_reports_pkey PRIMARY KEY (id);


--
-- Name: notification_queue notification_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payment_plans payment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: recurring_lesson_patterns recurring_lesson_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_lesson_patterns
    ADD CONSTRAINT recurring_lesson_patterns_pkey PRIMARY KEY (id);


--
-- Name: scheduling_settings scheduling_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_settings
    ADD CONSTRAINT scheduling_settings_pkey PRIMARY KEY (id);


--
-- Name: scheduling_settings scheduling_settings_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_settings
    ADD CONSTRAINT scheduling_settings_tenant_id_key UNIQUE (tenant_id);


--
-- Name: student_guardians student_guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_pkey PRIMARY KEY (id);


--
-- Name: student_guardians student_guardians_student_id_guardian_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_student_id_guardian_id_key UNIQUE (student_id, guardian_id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: tenant_settings tenant_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_pkey PRIMARY KEY (id);


--
-- Name: tenant_settings tenant_settings_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_tenant_id_key UNIQUE (tenant_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: user_tenant_memberships user_tenant_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_pkey PRIMARY KEY (id);


--
-- Name: user_tenant_memberships user_tenant_memberships_user_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_user_id_tenant_id_key UNIQUE (user_id, tenant_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vehicle_maintenance vehicle_maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_maintenance
    ADD CONSTRAINT vehicle_maintenance_pkey PRIMARY KEY (id);


--
-- Name: vehicle_mileage_log vehicle_mileage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_mileage_log
    ADD CONSTRAINT vehicle_mileage_log_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: idx_blockchain_records_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blockchain_records_hash ON public.blockchain_records USING btree (transaction_hash);


--
-- Name: idx_blockchain_records_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blockchain_records_payment ON public.blockchain_records USING btree (payment_id);


--
-- Name: idx_blockchain_records_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blockchain_records_tenant ON public.blockchain_records USING btree (tenant_id);


--
-- Name: idx_blockchain_records_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blockchain_records_type ON public.blockchain_records USING btree (transaction_type);


--
-- Name: idx_certificates_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certificates_enrollment ON public.certificates USING btree (enrollment_id);


--
-- Name: idx_certificates_serial_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_certificates_serial_tenant ON public.certificates USING btree (tenant_id, serial_number);


--
-- Name: idx_certificates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certificates_status ON public.certificates USING btree (tenant_id, status);


--
-- Name: idx_certificates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certificates_tenant ON public.certificates USING btree (tenant_id);


--
-- Name: idx_de_attendance_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_attendance_enrollment ON public.de_attendance USING btree (enrollment_id);


--
-- Name: idx_de_attendance_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_attendance_session ON public.de_attendance USING btree (session_id);


--
-- Name: idx_de_attendance_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_attendance_tenant ON public.de_attendance USING btree (tenant_id);


--
-- Name: idx_de_cohort_enrollments_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_cohort_enrollments_cohort ON public.de_cohort_enrollments USING btree (cohort_id);


--
-- Name: idx_de_cohort_enrollments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_cohort_enrollments_tenant ON public.de_cohort_enrollments USING btree (tenant_id);


--
-- Name: idx_de_cohort_sessions_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_cohort_sessions_cohort ON public.de_cohort_sessions USING btree (cohort_id);


--
-- Name: idx_de_cohort_sessions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_cohort_sessions_date ON public.de_cohort_sessions USING btree (session_date);


--
-- Name: idx_de_cohort_sessions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_cohort_sessions_tenant ON public.de_cohort_sessions USING btree (tenant_id);


--
-- Name: idx_de_cohorts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_cohorts_status ON public.de_cohorts USING btree (status);


--
-- Name: idx_de_cohorts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_de_cohorts_tenant ON public.de_cohorts USING btree (tenant_id);


--
-- Name: idx_enrollments_one_active_driver_training; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_enrollments_one_active_driver_training ON public.enrollments USING btree (student_id) WHERE ((program_type = 'driver_training'::text) AND (status = 'active'::text));


--
-- Name: idx_enrollments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_status ON public.enrollments USING btree (status);


--
-- Name: idx_enrollments_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_student ON public.enrollments USING btree (student_id);


--
-- Name: idx_enrollments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrollments_tenant ON public.enrollments USING btree (tenant_id);


--
-- Name: idx_fee_flags_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_flags_enrollment ON public.fee_flags USING btree (enrollment_id);


--
-- Name: idx_fee_flags_outstanding_by_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_flags_outstanding_by_student ON public.fee_flags USING btree (student_id) WHERE (status = 'outstanding'::text);


--
-- Name: idx_fee_flags_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_flags_student ON public.fee_flags USING btree (student_id);


--
-- Name: idx_fee_flags_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_flags_tenant ON public.fee_flags USING btree (tenant_id);


--
-- Name: idx_follow_ups_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_assigned_to ON public.follow_ups USING btree (assigned_to);


--
-- Name: idx_follow_ups_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_lead ON public.follow_ups USING btree (lead_id);


--
-- Name: idx_follow_ups_scheduled_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_scheduled_date ON public.follow_ups USING btree (scheduled_date);


--
-- Name: idx_follow_ups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_status ON public.follow_ups USING btree (status);


--
-- Name: idx_follow_ups_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_student ON public.follow_ups USING btree (student_id);


--
-- Name: idx_follow_ups_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_tenant ON public.follow_ups USING btree (tenant_id);


--
-- Name: idx_guardians_tenant_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guardians_tenant_email ON public.guardians USING btree (tenant_id, email);


--
-- Name: idx_guardians_tenant_last_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guardians_tenant_last_name ON public.guardians USING btree (tenant_id, last_name);


--
-- Name: idx_guardians_tenant_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guardians_tenant_phone ON public.guardians USING btree (tenant_id, phone);


--
-- Name: idx_installments_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_due_date ON public.installments USING btree (due_date);


--
-- Name: idx_installments_payment_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_payment_plan ON public.installments USING btree (payment_plan_id);


--
-- Name: idx_installments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_status ON public.installments USING btree (status);


--
-- Name: idx_instructor_availability_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_availability_day ON public.instructor_availability USING btree (day_of_week);


--
-- Name: idx_instructor_availability_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_availability_instructor ON public.instructor_availability USING btree (instructor_id);


--
-- Name: idx_instructor_availability_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_availability_tenant ON public.instructor_availability USING btree (tenant_id);


--
-- Name: idx_instructor_calendar_auth_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_calendar_auth_instructor ON public.instructor_calendar_auth USING btree (instructor_id);


--
-- Name: idx_instructor_certifications_expiration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_certifications_expiration ON public.instructor_certifications USING btree (expiration_date);


--
-- Name: idx_instructor_certifications_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_certifications_instructor ON public.instructor_certifications USING btree (instructor_id);


--
-- Name: idx_instructor_certifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_certifications_status ON public.instructor_certifications USING btree (status);


--
-- Name: idx_instructor_ical_feeds_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_ical_feeds_instructor ON public.instructor_ical_feeds USING btree (instructor_id);


--
-- Name: idx_instructor_ical_feeds_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_ical_feeds_token ON public.instructor_ical_feeds USING btree (feed_token);


--
-- Name: idx_instructor_license_notifications_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_license_notifications_instructor ON public.instructor_license_notifications USING btree (instructor_id, expiration_date);


--
-- Name: idx_instructor_license_notifications_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_license_notifications_tenant ON public.instructor_license_notifications USING btree (tenant_id);


--
-- Name: idx_instructor_service_areas_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_service_areas_instructor ON public.instructor_service_areas USING btree (instructor_id);


--
-- Name: idx_instructor_service_areas_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_service_areas_tenant ON public.instructor_service_areas USING btree (tenant_id);


--
-- Name: idx_instructor_service_areas_zip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_service_areas_zip ON public.instructor_service_areas USING btree (zip_code);


--
-- Name: idx_instructor_time_off_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_time_off_dates ON public.instructor_time_off USING btree (start_date, end_date);


--
-- Name: idx_instructor_time_off_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_time_off_instructor ON public.instructor_time_off USING btree (instructor_id);


--
-- Name: idx_instructor_time_off_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_time_off_tenant ON public.instructor_time_off USING btree (tenant_id);


--
-- Name: idx_instructor_vehicle_assignments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_vehicle_assignments_active ON public.instructor_vehicle_assignments USING btree (instructor_id, vehicle_id) WHERE (unassigned_date IS NULL);


--
-- Name: idx_instructor_vehicle_assignments_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_vehicle_assignments_instructor ON public.instructor_vehicle_assignments USING btree (instructor_id);


--
-- Name: idx_instructor_vehicle_assignments_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructor_vehicle_assignments_vehicle ON public.instructor_vehicle_assignments USING btree (vehicle_id);


--
-- Name: idx_instructors_calendar_feed_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructors_calendar_feed_token ON public.instructors USING btree (calendar_feed_token) WHERE (calendar_feed_token IS NOT NULL);


--
-- Name: idx_instructors_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructors_email ON public.instructors USING btree (email);


--
-- Name: idx_instructors_email_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_instructors_email_tenant ON public.instructors USING btree (tenant_id, email);


--
-- Name: idx_instructors_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructors_status ON public.instructors USING btree (status);


--
-- Name: idx_instructors_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instructors_tenant ON public.instructors USING btree (tenant_id);


--
-- Name: idx_invoice_line_items_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items USING btree (invoice_id);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_invoices_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_number ON public.invoices USING btree (invoice_number);


--
-- Name: idx_invoices_number_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invoices_number_tenant ON public.invoices USING btree (tenant_id, invoice_number);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_invoices_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_student ON public.invoices USING btree (student_id);


--
-- Name: idx_invoices_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_tenant ON public.invoices USING btree (tenant_id);


--
-- Name: idx_leads_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned_to ON public.leads USING btree (assigned_to_instructor_id);


--
-- Name: idx_leads_next_follow_up; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_next_follow_up ON public.leads USING btree (next_follow_up_date);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status ON public.leads USING btree (status);


--
-- Name: idx_leads_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_tenant ON public.leads USING btree (tenant_id);


--
-- Name: idx_lesson_calendar_events_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_calendar_events_instructor ON public.lesson_calendar_events USING btree (instructor_id);


--
-- Name: idx_lesson_calendar_events_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_calendar_events_lesson ON public.lesson_calendar_events USING btree (lesson_id);


--
-- Name: idx_lesson_invites_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_invites_lesson ON public.lesson_invites USING btree (lesson_id);


--
-- Name: idx_lesson_invites_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_invites_status ON public.lesson_invites USING btree (status);


--
-- Name: idx_lesson_invites_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_invites_student ON public.lesson_invites USING btree (student_id);


--
-- Name: idx_lesson_invites_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_invites_token ON public.lesson_invites USING btree (token);


--
-- Name: idx_lessons_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_date ON public.lessons USING btree (date);


--
-- Name: idx_lessons_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_enrollment ON public.lessons USING btree (enrollment_id);


--
-- Name: idx_lessons_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_instructor ON public.lessons USING btree (instructor_id);


--
-- Name: idx_lessons_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_status ON public.lessons USING btree (status);


--
-- Name: idx_lessons_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_tenant ON public.lessons USING btree (tenant_id);


--
-- Name: idx_lessons_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_vehicle ON public.lessons USING btree (vehicle_id);


--
-- Name: idx_memberships_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_role ON public.user_tenant_memberships USING btree (role);


--
-- Name: idx_memberships_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_tenant ON public.user_tenant_memberships USING btree (tenant_id);


--
-- Name: idx_memberships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_user ON public.user_tenant_memberships USING btree (user_id);


--
-- Name: idx_mileage_reimbursement_reports_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mileage_reimbursement_reports_instructor ON public.mileage_reimbursement_reports USING btree (instructor_id, period_start);


--
-- Name: idx_mileage_reimbursement_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mileage_reimbursement_reports_status ON public.mileage_reimbursement_reports USING btree (status);


--
-- Name: idx_notification_queue_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_lesson ON public.notification_queue USING btree (lesson_id);


--
-- Name: idx_notification_queue_pending_by_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_pending_by_lesson ON public.notification_queue USING btree (lesson_id) WHERE (status = 'pending'::text);


--
-- Name: idx_notification_queue_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_tenant ON public.notification_queue USING btree (tenant_id);


--
-- Name: idx_notification_templates_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_notification_templates_key ON public.notification_templates USING btree (tenant_id, template_key, channel);


--
-- Name: idx_notification_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_templates_tenant ON public.notification_templates USING btree (tenant_id);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_tenant ON public.notifications USING btree (tenant_id);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_payment_plans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_plans_status ON public.payment_plans USING btree (status);


--
-- Name: idx_payment_plans_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_plans_student ON public.payment_plans USING btree (student_id);


--
-- Name: idx_payment_plans_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_plans_tenant ON public.payment_plans USING btree (tenant_id);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.payments USING btree (date);


--
-- Name: idx_payments_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_enrollment ON public.payments USING btree (enrollment_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tenant ON public.payments USING btree (tenant_id);


--
-- Name: idx_recurring_patterns_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_patterns_instructor ON public.recurring_lesson_patterns USING btree (instructor_id);


--
-- Name: idx_recurring_patterns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_patterns_status ON public.recurring_lesson_patterns USING btree (status);


--
-- Name: idx_recurring_patterns_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_patterns_student ON public.recurring_lesson_patterns USING btree (student_id);


--
-- Name: idx_recurring_patterns_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_patterns_tenant ON public.recurring_lesson_patterns USING btree (tenant_id);


--
-- Name: idx_scheduling_settings_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduling_settings_tenant ON public.scheduling_settings USING btree (tenant_id);


--
-- Name: idx_student_guardians_guardian; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_guardians_guardian ON public.student_guardians USING btree (guardian_id);


--
-- Name: idx_student_guardians_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_student_guardians_one_primary ON public.student_guardians USING btree (student_id) WHERE (is_primary = true);


--
-- Name: idx_student_guardians_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_guardians_student ON public.student_guardians USING btree (student_id);


--
-- Name: idx_students_archive_held; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_archive_held ON public.students USING btree (tenant_id, archive_held) WHERE (archive_held = true);


--
-- Name: idx_students_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_archived_at ON public.students USING btree (tenant_id, archived_at);


--
-- Name: idx_students_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_email ON public.students USING btree (email);


--
-- Name: idx_students_email_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_students_email_tenant ON public.students USING btree (tenant_id, email) WHERE (email IS NOT NULL);


--
-- Name: idx_students_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_tenant ON public.students USING btree (tenant_id);


--
-- Name: idx_tenant_settings_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_settings_tenant_id ON public.tenant_settings USING btree (tenant_id);


--
-- Name: idx_tenants_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_slug ON public.tenants USING btree (slug);


--
-- Name: idx_tenants_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_status ON public.tenants USING btree (status);


--
-- Name: idx_user_tenant_memberships_invite_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_tenant_memberships_invite_token ON public.user_tenant_memberships USING btree (invite_token_hash) WHERE (invite_token_hash IS NOT NULL);


--
-- Name: idx_vehicle_maintenance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_maintenance_date ON public.vehicle_maintenance USING btree (service_date);


--
-- Name: idx_vehicle_maintenance_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_maintenance_type ON public.vehicle_maintenance USING btree (maintenance_type);


--
-- Name: idx_vehicle_maintenance_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_maintenance_vehicle ON public.vehicle_maintenance USING btree (vehicle_id);


--
-- Name: idx_vehicle_mileage_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_mileage_log_date ON public.vehicle_mileage_log USING btree (trip_date);


--
-- Name: idx_vehicle_mileage_log_instructor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_mileage_log_instructor ON public.vehicle_mileage_log USING btree (instructor_id);


--
-- Name: idx_vehicle_mileage_log_reimbursement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_mileage_log_reimbursement ON public.vehicle_mileage_log USING btree (reimbursement_status);


--
-- Name: idx_vehicle_mileage_log_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicle_mileage_log_vehicle ON public.vehicle_mileage_log USING btree (vehicle_id);


--
-- Name: idx_vehicles_license_plate_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_vehicles_license_plate_tenant ON public.vehicles USING btree (tenant_id, license_plate);


--
-- Name: idx_vehicles_ownership; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_ownership ON public.vehicles USING btree (ownership_type, owner_instructor_id);


--
-- Name: idx_vehicles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_status ON public.vehicles USING btree (status);


--
-- Name: idx_vehicles_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_tenant ON public.vehicles USING btree (tenant_id);


--
-- Name: follow_ups update_follow_ups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: installments update_installments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_installments_updated_at BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructor_availability update_instructor_availability_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instructor_availability_updated_at BEFORE UPDATE ON public.instructor_availability FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructor_calendar_auth update_instructor_calendar_auth_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instructor_calendar_auth_updated_at BEFORE UPDATE ON public.instructor_calendar_auth FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructor_certifications update_instructor_certifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instructor_certifications_updated_at BEFORE UPDATE ON public.instructor_certifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructor_ical_feeds update_instructor_ical_feeds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instructor_ical_feeds_updated_at BEFORE UPDATE ON public.instructor_ical_feeds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructor_time_off update_instructor_time_off_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instructor_time_off_updated_at BEFORE UPDATE ON public.instructor_time_off FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructor_vehicle_assignments update_instructor_vehicle_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instructor_vehicle_assignments_updated_at BEFORE UPDATE ON public.instructor_vehicle_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instructors update_instructors_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instructors_updated_at BEFORE UPDATE ON public.instructors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: invoices update_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lesson_calendar_events update_lesson_calendar_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lesson_calendar_events_updated_at BEFORE UPDATE ON public.lesson_calendar_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lesson_invites update_lesson_invites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lesson_invites_updated_at BEFORE UPDATE ON public.lesson_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lessons update_lessons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: mileage_reimbursement_reports update_mileage_reimbursement_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_mileage_reimbursement_reports_updated_at BEFORE UPDATE ON public.mileage_reimbursement_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_templates update_notification_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_plans update_payment_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payment_plans_updated_at BEFORE UPDATE ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments update_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recurring_lesson_patterns update_recurring_patterns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_recurring_patterns_updated_at BEFORE UPDATE ON public.recurring_lesson_patterns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scheduling_settings update_scheduling_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scheduling_settings_updated_at BEFORE UPDATE ON public.scheduling_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: students update_students_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenant_settings update_tenant_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenant_settings_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vehicle_maintenance update_vehicle_maintenance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vehicle_maintenance_updated_at BEFORE UPDATE ON public.vehicle_maintenance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vehicle_mileage_log update_vehicle_mileage_log_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vehicle_mileage_log_updated_at BEFORE UPDATE ON public.vehicle_mileage_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vehicles update_vehicles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: blockchain_records blockchain_records_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blockchain_records
    ADD CONSTRAINT blockchain_records_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id);


--
-- Name: blockchain_records blockchain_records_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blockchain_records
    ADD CONSTRAINT blockchain_records_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: blockchain_records blockchain_records_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blockchain_records
    ADD CONSTRAINT blockchain_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: certificates certificates_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id);


--
-- Name: certificates certificates_issued_by_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_issued_by_instructor_id_fkey FOREIGN KEY (issued_by_instructor_id) REFERENCES public.instructors(id);


--
-- Name: certificates certificates_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: certificates certificates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: de_attendance de_attendance_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_attendance
    ADD CONSTRAINT de_attendance_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;


--
-- Name: de_attendance de_attendance_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_attendance
    ADD CONSTRAINT de_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: de_attendance de_attendance_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_attendance
    ADD CONSTRAINT de_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.de_cohort_sessions(id) ON DELETE CASCADE;


--
-- Name: de_attendance de_attendance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_attendance
    ADD CONSTRAINT de_attendance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: de_cohort_enrollments de_cohort_enrollments_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.de_cohorts(id) ON DELETE CASCADE;


--
-- Name: de_cohort_enrollments de_cohort_enrollments_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;


--
-- Name: de_cohort_enrollments de_cohort_enrollments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_enrollments
    ADD CONSTRAINT de_cohort_enrollments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: de_cohort_sessions de_cohort_sessions_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_sessions
    ADD CONSTRAINT de_cohort_sessions_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.de_cohorts(id) ON DELETE CASCADE;


--
-- Name: de_cohort_sessions de_cohort_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohort_sessions
    ADD CONSTRAINT de_cohort_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: de_cohorts de_cohorts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohorts
    ADD CONSTRAINT de_cohorts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: de_cohorts de_cohorts_teacher_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohorts
    ADD CONSTRAINT de_cohorts_teacher_instructor_id_fkey FOREIGN KEY (teacher_instructor_id) REFERENCES public.instructors(id) ON DELETE SET NULL;


--
-- Name: de_cohorts de_cohorts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.de_cohorts
    ADD CONSTRAINT de_cohorts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_assigned_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_assigned_instructor_id_fkey FOREIGN KEY (assigned_instructor_id) REFERENCES public.instructors(id);


--
-- Name: enrollments enrollments_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_reopened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_reopened_by_fkey FOREIGN KEY (reopened_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_withdrawn_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_withdrawn_by_fkey FOREIGN KEY (withdrawn_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: fee_flags fee_flags_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_flags
    ADD CONSTRAINT fee_flags_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;


--
-- Name: fee_flags fee_flags_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_flags
    ADD CONSTRAINT fee_flags_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: fee_flags fee_flags_paid_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_flags
    ADD CONSTRAINT fee_flags_paid_payment_id_fkey FOREIGN KEY (paid_payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: fee_flags fee_flags_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_flags
    ADD CONSTRAINT fee_flags_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: fee_flags fee_flags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_flags
    ADD CONSTRAINT fee_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: fee_flags fee_flags_waived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_flags
    ADD CONSTRAINT fee_flags_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.instructors(id);


--
-- Name: follow_ups follow_ups_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: guardians guardians_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guardians guardians_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: guardians guardians_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: installments installments_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installments
    ADD CONSTRAINT installments_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);


--
-- Name: installments installments_payment_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installments
    ADD CONSTRAINT installments_payment_plan_id_fkey FOREIGN KEY (payment_plan_id) REFERENCES public.payment_plans(id) ON DELETE CASCADE;


--
-- Name: instructor_availability instructor_availability_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_availability
    ADD CONSTRAINT instructor_availability_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_availability instructor_availability_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_availability
    ADD CONSTRAINT instructor_availability_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instructor_calendar_auth instructor_calendar_auth_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_calendar_auth
    ADD CONSTRAINT instructor_calendar_auth_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_certifications instructor_certifications_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_certifications
    ADD CONSTRAINT instructor_certifications_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_ical_feeds instructor_ical_feeds_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_ical_feeds
    ADD CONSTRAINT instructor_ical_feeds_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_license_notifications instructor_license_notifications_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_license_notifications
    ADD CONSTRAINT instructor_license_notifications_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_license_notifications instructor_license_notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_license_notifications
    ADD CONSTRAINT instructor_license_notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instructor_service_areas instructor_service_areas_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_service_areas
    ADD CONSTRAINT instructor_service_areas_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_service_areas instructor_service_areas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_service_areas
    ADD CONSTRAINT instructor_service_areas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instructor_time_off instructor_time_off_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_time_off
    ADD CONSTRAINT instructor_time_off_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: instructor_time_off instructor_time_off_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_time_off
    ADD CONSTRAINT instructor_time_off_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_time_off instructor_time_off_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_time_off
    ADD CONSTRAINT instructor_time_off_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instructor_vehicle_assignments instructor_vehicle_assignments_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_vehicle_assignments
    ADD CONSTRAINT instructor_vehicle_assignments_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: instructor_vehicle_assignments instructor_vehicle_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_vehicle_assignments
    ADD CONSTRAINT instructor_vehicle_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instructor_vehicle_assignments instructor_vehicle_assignments_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructor_vehicle_assignments
    ADD CONSTRAINT instructor_vehicle_assignments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;


--
-- Name: instructors instructors_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: instructors instructors_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instructors instructors_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instructors
    ADD CONSTRAINT instructors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: leads leads_assigned_to_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_to_instructor_id_fkey FOREIGN KEY (assigned_to_instructor_id) REFERENCES public.instructors(id);


--
-- Name: leads leads_converted_to_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_to_student_id_fkey FOREIGN KEY (converted_to_student_id) REFERENCES public.students(id);


--
-- Name: leads leads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: lesson_calendar_events lesson_calendar_events_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_calendar_events
    ADD CONSTRAINT lesson_calendar_events_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: lesson_calendar_events lesson_calendar_events_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_calendar_events
    ADD CONSTRAINT lesson_calendar_events_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_invites lesson_invites_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_invites
    ADD CONSTRAINT lesson_invites_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_invites lesson_invites_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_invites
    ADD CONSTRAINT lesson_invites_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: lesson_invites lesson_invites_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_invites
    ADD CONSTRAINT lesson_invites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lessons lessons_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE RESTRICT;


--
-- Name: lessons lessons_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lessons lessons_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lessons lessons_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;


--
-- Name: mileage_reimbursement_reports mileage_reimbursement_reports_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_reimbursement_reports
    ADD CONSTRAINT mileage_reimbursement_reports_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: mileage_reimbursement_reports mileage_reimbursement_reports_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mileage_reimbursement_reports
    ADD CONSTRAINT mileage_reimbursement_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: notification_queue notification_queue_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: notification_queue notification_queue_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: notification_templates notification_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_plans payment_plans_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: payment_plans payment_plans_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_plans
    ADD CONSTRAINT payment_plans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: payments payments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: recurring_lesson_patterns recurring_lesson_patterns_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_lesson_patterns
    ADD CONSTRAINT recurring_lesson_patterns_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE RESTRICT;


--
-- Name: recurring_lesson_patterns recurring_lesson_patterns_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_lesson_patterns
    ADD CONSTRAINT recurring_lesson_patterns_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: recurring_lesson_patterns recurring_lesson_patterns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_lesson_patterns
    ADD CONSTRAINT recurring_lesson_patterns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: recurring_lesson_patterns recurring_lesson_patterns_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_lesson_patterns
    ADD CONSTRAINT recurring_lesson_patterns_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: scheduling_settings scheduling_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_settings
    ADD CONSTRAINT scheduling_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: student_guardians student_guardians_guardian_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES public.guardians(id) ON DELETE RESTRICT;


--
-- Name: student_guardians student_guardians_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_guardians student_guardians_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: students students_archive_held_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_archive_held_by_fkey FOREIGN KEY (archive_held_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: students students_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: students students_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: students students_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: students students_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tenant_settings tenant_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_tenant_memberships user_tenant_memberships_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_tenant_memberships user_tenant_memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_tenant_memberships user_tenant_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: vehicle_maintenance vehicle_maintenance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_maintenance
    ADD CONSTRAINT vehicle_maintenance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: vehicle_maintenance vehicle_maintenance_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_maintenance
    ADD CONSTRAINT vehicle_maintenance_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;


--
-- Name: vehicle_mileage_log vehicle_mileage_log_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_mileage_log
    ADD CONSTRAINT vehicle_mileage_log_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;


--
-- Name: vehicle_mileage_log vehicle_mileage_log_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_mileage_log
    ADD CONSTRAINT vehicle_mileage_log_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id);


--
-- Name: vehicle_mileage_log vehicle_mileage_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_mileage_log
    ADD CONSTRAINT vehicle_mileage_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: vehicle_mileage_log vehicle_mileage_log_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_mileage_log
    ADD CONSTRAINT vehicle_mileage_log_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;


--
-- Name: vehicles vehicles_owner_instructor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_owner_instructor_id_fkey FOREIGN KEY (owner_instructor_id) REFERENCES public.instructors(id);


--
-- Name: vehicles vehicles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


