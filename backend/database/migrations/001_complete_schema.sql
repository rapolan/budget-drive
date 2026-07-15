-- =====================================================
-- BUDGET DRIVING SCHOOL
-- COMPLETE DATABASE SCHEMA — SINGLE SOURCE OF TRUTH
-- =====================================================
-- Migration:   001_complete_schema.sql
-- Description: The authoritative, complete schema for a
--              fresh database installation. Every table,
--              column, index, trigger, constraint and view
--              is defined here. This file is idempotent
--              (safe to re-run on an existing database).
--
-- After changes to ANY table, update THIS file.
-- Do NOT create new patch/additive migration files unless
-- targeting a production database that cannot be reset.
-- =====================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- UTILITY: Auto-update updated_at timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. AUTH & USERS
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email             VARCHAR(255) NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    full_name         VARCHAR(255) NOT NULL,
    phone             VARCHAR(20),
    profile_photo_url TEXT,
    email_verified    BOOLEAN DEFAULT FALSE,
    status            VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at     TIMESTAMP,
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW(),

    -- Data integrity: bcrypt hashes are always 60 chars
    CONSTRAINT check_password_hash_length CHECK (length(password_hash) = 60)
);

-- =====================================================
-- 2. TENANTS (Multi-tenant white-label system)
-- =====================================================

CREATE TABLE IF NOT EXISTS tenants (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   VARCHAR(255) NOT NULL,
    slug                   VARCHAR(100) NOT NULL UNIQUE,
    domain                 VARCHAR(255),
    email                  VARCHAR(255) NOT NULL,
    phone                  VARCHAR(50),
    status                 VARCHAR(50) DEFAULT 'active'
                             CHECK (status IN ('active', 'suspended', 'cancelled', 'trial')),
    plan_tier              VARCHAR(50) DEFAULT 'enterprise'
                             CHECK (plan_tier IN ('basic', 'professional', 'enterprise')),
    trial_ends_at          TIMESTAMP,
    subscription_starts_at TIMESTAMP,
    subscription_ends_at   TIMESTAMP,
    created_at             TIMESTAMP DEFAULT NOW(),
    updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. TENANT SETTINGS (White-label customization)
-- =====================================================

CREATE TABLE IF NOT EXISTS tenant_settings (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

    -- Branding
    business_name            VARCHAR(255) NOT NULL,
    business_tagline         VARCHAR(500),
    logo_url                 TEXT,
    favicon_url              TEXT,
    primary_color            VARCHAR(7) DEFAULT '#3B82F6',
    secondary_color          VARCHAR(7) DEFAULT '#8B5CF6',
    accent_color             VARCHAR(7) DEFAULT '#10B981',

    -- Address
    address_line1            VARCHAR(255),
    address_line2            VARCHAR(255),
    city                     VARCHAR(100),
    state                    VARCHAR(100),
    zip_code                 VARCHAR(20),
    country                  VARCHAR(100) DEFAULT 'USA',

    -- Contact
    support_email            VARCHAR(255),
    support_phone            VARCHAR(50),
    website_url              VARCHAR(255),
    business_hours           JSONB DEFAULT '{
        "monday":    {"open": "08:00", "close": "18:00", "closed": false},
        "tuesday":   {"open": "08:00", "close": "18:00", "closed": false},
        "wednesday": {"open": "08:00", "close": "18:00", "closed": false},
        "thursday":  {"open": "08:00", "close": "18:00", "closed": false},
        "friday":    {"open": "08:00", "close": "18:00", "closed": false},
        "saturday":  {"open": "09:00", "close": "15:00", "closed": false},
        "sunday":    {"open": "10:00", "close": "14:00", "closed": true}
    }'::jsonb,

    -- Feature flags
    enable_blockchain          BOOLEAN DEFAULT true,
    enable_google_calendar     BOOLEAN DEFAULT true,
    enable_apple_calendar      BOOLEAN DEFAULT true,
    enable_certificates        BOOLEAN DEFAULT true,
    enable_multi_payment       BOOLEAN DEFAULT true,
    enable_follow_up_tracker   BOOLEAN DEFAULT true,
    enable_student_portal      BOOLEAN DEFAULT true,
    enable_instructor_portal   BOOLEAN DEFAULT true,
    enable_sms_notifications   BOOLEAN DEFAULT false,
    enable_email_notifications BOOLEAN DEFAULT true,

    -- Localization
    timezone        VARCHAR(100) DEFAULT 'America/Los_Angeles',
    date_format     VARCHAR(50)  DEFAULT 'MM/DD/YYYY',
    time_format     VARCHAR(50)  DEFAULT '12h',
    currency_code   VARCHAR(3)   DEFAULT 'USD',
    currency_symbol VARCHAR(5)   DEFAULT '$',
    language        VARCHAR(10)  DEFAULT 'en',

    -- UI
    dashboard_widgets JSONB DEFAULT '[
        {"id": "students",    "order": 1, "enabled": true},
        {"id": "lessons",     "order": 2, "enabled": true},
        {"id": "revenue",     "order": 3, "enabled": true},
        {"id": "blockchain",  "order": 4, "enabled": true},
        {"id": "certificates","order": 5, "enabled": true},
        {"id": "conversion",  "order": 6, "enabled": true}
    ]'::jsonb,

    -- Student defaults
    default_hours_required   NUMERIC(5,2) DEFAULT 6,

    -- Feature flags (extended)
    enable_blockchain_payments BOOLEAN DEFAULT false,

    -- Legal
    terms_of_service_url TEXT,
    privacy_policy_url   TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

DROP TRIGGER IF EXISTS update_tenant_settings_updated_at ON tenant_settings;
CREATE TRIGGER update_tenant_settings_updated_at
    BEFORE UPDATE ON tenant_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. USER-TENANT MEMBERSHIPS (RBAC)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_tenant_memberships (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL
                    CHECK (role IN ('admin', 'instructor', 'staff', 'student')),
    status        VARCHAR(20) DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'pending', 'invited')),
    accepted_at   TIMESTAMP,
    invited_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at    TIMESTAMP,
    instructor_id UUID,     -- links to instructors.id when role = 'instructor'
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user   ON user_tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON user_tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role   ON user_tenant_memberships(role);

-- =====================================================
-- 5. INSTRUCTORS
-- =====================================================

CREATE TABLE IF NOT EXISTS instructors (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Identity
    full_name         VARCHAR(255) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    phone             VARCHAR(255) NOT NULL,
    date_of_birth     DATE,
    address           TEXT,

    -- Employment
    employment_type   VARCHAR(50) DEFAULT 'w2_employee'
                        CHECK (employment_type IN ('w2_employee', 'independent_contractor')),
    hire_date         DATE NOT NULL,
    termination_date  DATE,
    status            VARCHAR(50) DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),

    -- Licenses
    drivers_license_number     VARCHAR(50),
    drivers_license_expiration DATE,
    instructor_license_number  VARCHAR(50),
    instructor_license_expiration DATE,

    -- Vehicle & Mileage
    provides_own_vehicle      BOOLEAN DEFAULT false,
    mileage_reimbursement_rate NUMERIC(5,2) DEFAULT 0.67,

    -- Schedule
    availability JSONB,
    hourly_rate  NUMERIC(10,2),

    -- Performance
    rating              NUMERIC(3,2),
    total_lessons_taught INTEGER DEFAULT 0,

    -- Calendar integration
    google_calendar_connected BOOLEAN DEFAULT false,
    -- Secure token for public ICS feed subscription (no auth required)
    calendar_feed_token       VARCHAR(64) UNIQUE,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructors_tenant ON instructors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instructors_email  ON instructors(email);
CREATE INDEX IF NOT EXISTS idx_instructors_status ON instructors(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_instructors_email_tenant
    ON instructors(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_instructors_calendar_feed_token
    ON instructors(calendar_feed_token) WHERE calendar_feed_token IS NOT NULL;

DROP TRIGGER IF EXISTS update_instructors_updated_at ON instructors;
CREATE TRIGGER update_instructors_updated_at
    BEFORE UPDATE ON instructors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. STUDENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS students (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Identity (split fields for proper CRM)
    full_name   VARCHAR(255),   -- legacy / display
    first_name  VARCHAR(255),
    last_name   VARCHAR(255),
    middle_name VARCHAR(255),
    email       VARCHAR(255) NOT NULL,
    phone       VARCHAR(255),
    date_of_birth DATE,

    -- Address (split fields)
    address      TEXT,          -- legacy
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city          VARCHAR(255),
    state         VARCHAR(50),
    zip_code      VARCHAR(20),

    -- Emergency contacts
    emergency_contact    VARCHAR(255),     -- legacy
    emergency_contact_name  VARCHAR(255),
    emergency_contact_phone VARCHAR(50),
    emergency_contact_2_name  VARCHAR(255),
    emergency_contact_2_phone VARCHAR(50),

    -- Permit
    learner_permit_number     VARCHAR(100),
    learner_permit_issue_date DATE,
    learner_permit_expiration DATE,

    -- Program
    license_type    TEXT NOT NULL CHECK (license_type IN ('car', 'motorcycle', 'commercial')),
    enrollment_date DATE NOT NULL,
    status          TEXT DEFAULT 'active'
                      CHECK (status IN ('active', 'completed', 'inactive', 'suspended')),

    -- Progress
    total_hours_completed   NUMERIC(8,2) DEFAULT 0,
    hours_required          NUMERIC(8,2) NOT NULL,
    assigned_instructor_id  UUID REFERENCES instructors(id),

    -- Financial
    payment_status    TEXT DEFAULT 'unpaid'
                        CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'overdue')),
    total_paid        NUMERIC(12,2) DEFAULT 0,
    outstanding_balance NUMERIC(12,2) DEFAULT 0,

    -- Blockchain & integration
    bsv_certificate_hash VARCHAR(255),
    coda_row_id          VARCHAR(255),

    notes      TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_tenant              ON students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_email               ON students(email);
CREATE INDEX IF NOT EXISTS idx_students_status              ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_assigned_instructor ON students(assigned_instructor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email_tenant ON students(tenant_id, email);

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. VEHICLES
-- =====================================================

CREATE TABLE IF NOT EXISTS vehicles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Ownership
    ownership_type    VARCHAR(50) NOT NULL
                        CHECK (ownership_type IN ('school_owned', 'instructor_owned', 'leased')),
    owner_instructor_id UUID REFERENCES instructors(id),

    -- Details
    make          VARCHAR(100) NOT NULL,
    model         VARCHAR(100) NOT NULL,
    year          INTEGER NOT NULL,
    color         VARCHAR(50),
    license_plate VARCHAR(20) NOT NULL,
    vin           VARCHAR(50),

    -- Registration & Insurance
    registration_expiration  DATE NOT NULL,
    insurance_provider       VARCHAR(255),
    insurance_policy_number  VARCHAR(100),
    insurance_expiration     DATE NOT NULL,

    -- DMV
    dmv_inspection_date       DATE,
    dmv_inspection_expiration DATE,
    has_dual_controls         BOOLEAN DEFAULT false,

    -- Operational
    current_mileage INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(50) DEFAULT 'active'
                      CHECK (status IN ('active', 'maintenance', 'inactive', 'retired')),

    -- Maintenance
    last_oil_change_mileage INTEGER,
    next_oil_change_mileage INTEGER,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant    ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_ownership ON vehicles(ownership_type, owner_instructor_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status    ON vehicles(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_license_plate_tenant
    ON vehicles(tenant_id, license_plate);

DROP TRIGGER IF EXISTS update_vehicles_updated_at ON vehicles;
CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. LESSONS
-- =====================================================

CREATE TABLE IF NOT EXISTS lessons (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES students(id)    ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
    vehicle_id    UUID NOT NULL REFERENCES vehicles(id)    ON DELETE RESTRICT,

    -- Scheduling
    date       DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time   TIME NOT NULL,
    duration   NUMERIC(5,2) NOT NULL,

    -- Details
    lesson_number INTEGER,
    pickup_address TEXT,
    status        TEXT DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    lesson_type   TEXT NOT NULL
                    CHECK (lesson_type IN ('behind_wheel', 'classroom', 'road_test_prep')),
    skills_practiced TEXT[],

    -- Performance
    student_performance TEXT CHECK (student_performance IN ('excellent', 'good', 'needs_improvement', 'poor')),
    instructor_rating   INTEGER CHECK (instructor_rating BETWEEN 1 AND 5),
    notes               TEXT,
    completion_verified BOOLEAN DEFAULT false,

    -- Financial
    cost NUMERIC(10,2) NOT NULL,

    -- Blockchain & integration
    bsv_record_hash VARCHAR(255),
    coda_row_id     VARCHAR(255),

    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_tenant     ON lessons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lessons_student    ON lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_instructor ON lessons(instructor_id);
CREATE INDEX IF NOT EXISTS idx_lessons_vehicle    ON lessons(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_lessons_date       ON lessons(date);
CREATE INDEX IF NOT EXISTS idx_lessons_status     ON lessons(status);
CREATE INDEX IF NOT EXISTS idx_lessons_lesson_number
    ON lessons(student_id, lesson_number);

DROP TRIGGER IF EXISTS update_lessons_updated_at ON lessons;
CREATE TRIGGER update_lessons_updated_at
    BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 9. LEADS & FOLLOW-UPS
-- =====================================================

CREATE TABLE IF NOT EXISTS leads (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Contact
    full_name  VARCHAR(255) NOT NULL,
    email      VARCHAR(255),
    phone      VARCHAR(255) NOT NULL,

    -- Qualification
    source   VARCHAR(100) CHECK (source IN (
                 'website', 'referral', 'google_ads', 'facebook',
                 'instagram', 'walk_in', 'phone', 'other')),
    status   VARCHAR(50) DEFAULT 'new'
               CHECK (status IN ('new', 'contacted', 'interested', 'enrolled', 'lost')),
    interest_level          VARCHAR(50) CHECK (interest_level IN ('hot', 'warm', 'cold')),
    preferred_contact_method VARCHAR(50) CHECK (preferred_contact_method IN ('email', 'phone', 'sms', 'any')),

    -- Assignment & follow-up
    assigned_to_instructor_id UUID REFERENCES instructors(id),
    first_contact_date        DATE,
    last_contact_date         DATE,
    next_follow_up_date       DATE,

    -- Conversion
    converted_to_student_id UUID REFERENCES students(id),
    conversion_date         DATE,
    lost_reason             TEXT,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_tenant         ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status         ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to    ON leads(assigned_to_instructor_id);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up_date);

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS follow_ups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Polymorphic
    entity_type VARCHAR(50) NOT NULL
                  CHECK (entity_type IN ('lead', 'student', 'inactive_student')),
    lead_id     UUID REFERENCES leads(id)    ON DELETE CASCADE,
    student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES instructors(id),

    -- Details
    follow_up_type VARCHAR(50) CHECK (follow_up_type IN ('call', 'email', 'sms', 'in_person')),
    status         VARCHAR(50) DEFAULT 'pending'
                     CHECK (status IN ('pending', 'completed', 'skipped', 'rescheduled')),

    -- Scheduling
    scheduled_date   DATE NOT NULL,
    completed_date   DATE,
    next_follow_up_date DATE,

    -- Outcome
    outcome VARCHAR(100) CHECK (outcome IN (
                'enrolled', 'still_interested', 'not_interested',
                'no_response', 'callback_requested')),
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant         ON follow_ups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_lead           ON follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_student        ON follow_ups(student_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned_to    ON follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status         ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled_date ON follow_ups(scheduled_date);

DROP TRIGGER IF EXISTS update_follow_ups_updated_at ON follow_ups;
CREATE TRIGGER update_follow_ups_updated_at
    BEFORE UPDATE ON follow_ups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. FINANCIAL — PAYMENTS, INVOICES, PLANS
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    date           DATE NOT NULL,
    amount         NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN (
                       'bsv', 'mnee', 'stripe_card', 'paypal',
                       'cash', 'check', 'debit', 'credit')),
    payment_type   VARCHAR(255) NOT NULL,
    status         TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    confirmation_date TIMESTAMP,

    related_lesson_ids UUID[],
    invoice_id         UUID,
    bsv_transaction_id VARCHAR(255),

    receipt_sent BOOLEAN DEFAULT false,
    receipt_url  TEXT,
    notes        TEXT,
    coda_row_id  VARCHAR(255),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant  ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date    ON payments(date);
CREATE INDEX IF NOT EXISTS idx_payments_status  ON payments(status);

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS invoices (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    invoice_number VARCHAR(50) NOT NULL,
    issue_date     DATE NOT NULL,
    due_date       DATE NOT NULL,

    subtotal        NUMERIC(12,2) NOT NULL,
    tax_rate        NUMERIC(5,2)  DEFAULT 0,
    tax_amount      NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    discount_reason TEXT,
    total_amount    NUMERIC(12,2) NOT NULL,
    amount_paid     NUMERIC(12,2) DEFAULT 0,
    balance_due     NUMERIC(12,2) NOT NULL,

    status        VARCHAR(50) DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded')),
    payment_terms VARCHAR(50) DEFAULT 'due_on_receipt'
                    CHECK (payment_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_60')),

    sent_at TIMESTAMP,
    paid_at TIMESTAMP,
    notes   TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant   ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student  ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number   ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_tenant ON invoices(tenant_id, invoice_number);

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

    description TEXT           NOT NULL,
    quantity    NUMERIC(10,2)  NOT NULL DEFAULT 1,
    unit_price  NUMERIC(12,2)  NOT NULL,
    total       NUMERIC(12,2)  NOT NULL,
    lesson_ids  UUID[],

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

CREATE TABLE IF NOT EXISTS payment_plans (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    total_amount       NUMERIC(12,2) NOT NULL,
    down_payment       NUMERIC(12,2) NOT NULL DEFAULT 0,
    num_installments   INTEGER       NOT NULL,
    installment_amount NUMERIC(12,2) NOT NULL,
    frequency          VARCHAR(50)   NOT NULL CHECK (frequency IN ('weekly', 'bi_weekly', 'monthly')),

    start_date    DATE NOT NULL,
    next_due_date DATE,
    status        VARCHAR(50) DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'defaulted', 'cancelled')),

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_tenant  ON payment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_student ON payment_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_status  ON payment_plans(status);

DROP TRIGGER IF EXISTS update_payment_plans_updated_at ON payment_plans;
CREATE TRIGGER update_payment_plans_updated_at
    BEFORE UPDATE ON payment_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS installments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_plan_id UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,

    installment_number INTEGER       NOT NULL,
    due_date           DATE          NOT NULL,
    amount_due         NUMERIC(12,2) NOT NULL,
    amount_paid        NUMERIC(12,2) DEFAULT 0,
    status             VARCHAR(50)   DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid', 'late', 'waived')),
    paid_date          DATE,
    payment_id         UUID REFERENCES payments(id),
    late_fee           NUMERIC(10,2) DEFAULT 0,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installments_payment_plan ON installments(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date     ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_status       ON installments(status);

DROP TRIGGER IF EXISTS update_installments_updated_at ON installments;
CREATE TRIGGER update_installments_updated_at
    BEFORE UPDATE ON installments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 11. VEHICLE & INSTRUCTOR MANAGEMENT
-- =====================================================

CREATE TABLE IF NOT EXISTS instructor_vehicle_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    vehicle_id    UUID NOT NULL REFERENCES vehicles(id)    ON DELETE CASCADE,

    is_primary_vehicle BOOLEAN DEFAULT false,
    can_use            BOOLEAN DEFAULT true,
    assigned_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    unassigned_date    DATE,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_vehicle_assignments_instructor
    ON instructor_vehicle_assignments(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_vehicle_assignments_vehicle
    ON instructor_vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_instructor_vehicle_assignments_active
    ON instructor_vehicle_assignments(instructor_id, vehicle_id)
    WHERE unassigned_date IS NULL;

DROP TRIGGER IF EXISTS update_instructor_vehicle_assignments_updated_at
    ON instructor_vehicle_assignments;
CREATE TRIGGER update_instructor_vehicle_assignments_updated_at
    BEFORE UPDATE ON instructor_vehicle_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS vehicle_mileage_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
    vehicle_id    UUID NOT NULL REFERENCES vehicles(id)    ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    trip_date  DATE NOT NULL,
    start_time TIME,
    end_time   TIME,

    starting_odometer INTEGER NOT NULL,
    ending_odometer   INTEGER NOT NULL,
    total_miles INTEGER GENERATED ALWAYS AS (ending_odometer - starting_odometer) STORED,

    lesson_id UUID REFERENCES lessons(id),
    purpose   VARCHAR(50) CHECK (purpose IN (
                  'lesson', 'pickup_student', 'vehicle_maintenance',
                  'administrative', 'other')),

    reimbursement_rate   NUMERIC(5,2),
    reimbursement_amount NUMERIC(8,2) GENERATED ALWAYS AS (
        (ending_odometer - starting_odometer) * COALESCE(reimbursement_rate, 0)
    ) STORED,
    reimbursement_status VARCHAR(50) DEFAULT 'pending'
                           CHECK (reimbursement_status IN ('pending', 'approved', 'paid', 'not_applicable')),
    paid_in_payroll_id   UUID,

    start_location_address TEXT,
    end_location_address   TEXT,
    route_notes            TEXT,

    odometer_photo_start_url TEXT,
    odometer_photo_end_url   TEXT,

    submitted_by_instructor_at TIMESTAMP,
    approved_by_admin_id       UUID,
    approved_at                TIMESTAMP,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_log_vehicle       ON vehicle_mileage_log(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_log_instructor    ON vehicle_mileage_log(instructor_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_log_date          ON vehicle_mileage_log(trip_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_log_reimbursement ON vehicle_mileage_log(reimbursement_status);

DROP TRIGGER IF EXISTS update_vehicle_mileage_log_updated_at ON vehicle_mileage_log;
CREATE TRIGGER update_vehicle_mileage_log_updated_at
    BEFORE UPDATE ON vehicle_mileage_log
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS mileage_reimbursement_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,

    total_trips         INTEGER       NOT NULL,
    total_miles         INTEGER       NOT NULL,
    average_rate        NUMERIC(5,2)  NOT NULL,
    total_reimbursement NUMERIC(10,2) NOT NULL,

    status VARCHAR(50) DEFAULT 'draft'
             CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'disputed')),

    submitted_by_instructor_at TIMESTAMP,
    reviewed_by_admin_id       UUID,
    approved_at                TIMESTAMP,
    paid_date                  DATE,
    paid_in_payroll_id         UUID,
    report_pdf_url             TEXT,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mileage_reimbursement_reports_instructor
    ON mileage_reimbursement_reports(instructor_id, period_start);
CREATE INDEX IF NOT EXISTS idx_mileage_reimbursement_reports_status
    ON mileage_reimbursement_reports(status);

DROP TRIGGER IF EXISTS update_mileage_reimbursement_reports_updated_at
    ON mileage_reimbursement_reports;
CREATE TRIGGER update_mileage_reimbursement_reports_updated_at
    BEFORE UPDATE ON mileage_reimbursement_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,

    maintenance_type  VARCHAR(100) CHECK (maintenance_type IN (
                          'oil_change', 'tire_rotation', 'brake_service',
                          'inspection', 'repair', 'other')),
    service_date      DATE    NOT NULL,
    mileage_at_service INTEGER NOT NULL,
    cost              NUMERIC(10,2) NOT NULL,
    vendor            VARCHAR(255),

    next_service_date    DATE,
    next_service_mileage INTEGER,
    description          TEXT,
    receipt_url          TEXT,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_vehicle ON vehicle_maintenance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_date    ON vehicle_maintenance(service_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_type    ON vehicle_maintenance(maintenance_type);

DROP TRIGGER IF EXISTS update_vehicle_maintenance_updated_at ON vehicle_maintenance;
CREATE TRIGGER update_vehicle_maintenance_updated_at
    BEFORE UPDATE ON vehicle_maintenance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS instructor_certifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    certification_type VARCHAR(100) CHECK (certification_type IN (
                           'drivers_license', 'instructor_license', 'cpr',
                           'first_aid', 'defensive_driving', 'other')),
    certification_number VARCHAR(100),
    issue_date           DATE NOT NULL,
    expiration_date      DATE NOT NULL,
    issuing_authority    VARCHAR(255),
    document_url         TEXT,
    status               VARCHAR(50) DEFAULT 'valid'
                           CHECK (status IN ('valid', 'expired', 'pending_renewal', 'revoked')),
    reminder_sent        BOOLEAN DEFAULT false,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_certifications_instructor
    ON instructor_certifications(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_certifications_expiration
    ON instructor_certifications(expiration_date);
CREATE INDEX IF NOT EXISTS idx_instructor_certifications_status
    ON instructor_certifications(status);

DROP TRIGGER IF EXISTS update_instructor_certifications_updated_at ON instructor_certifications;
CREATE TRIGGER update_instructor_certifications_updated_at
    BEFORE UPDATE ON instructor_certifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 12. BLOCKCHAIN & CERTIFICATES
-- =====================================================

CREATE TABLE IF NOT EXISTS blockchain_records (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    transaction_type VARCHAR(50) CHECK (transaction_type IN ('payment', 'certificate', 'lesson_record')),
    transaction_hash VARCHAR(255) NOT NULL,
    blockchain       VARCHAR(50) DEFAULT 'bsv' CHECK (blockchain IN ('bsv', 'mnee')),

    payment_id     UUID REFERENCES payments(id),
    certificate_id UUID,
    lesson_id      UUID REFERENCES lessons(id),

    amount       NUMERIC(12,2),
    data_payload JSONB,

    status        VARCHAR(50) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'failed')),
    confirmations INTEGER DEFAULT 0,
    confirmed_at  TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blockchain_records_tenant  ON blockchain_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_records_hash    ON blockchain_records(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_blockchain_records_type    ON blockchain_records(transaction_type);
CREATE INDEX IF NOT EXISTS idx_blockchain_records_payment ON blockchain_records(payment_id);

CREATE TABLE IF NOT EXISTS certificates (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    certificate_number VARCHAR(100) NOT NULL,
    issue_date         DATE NOT NULL,
    certificate_type   VARCHAR(100) CHECK (certificate_type IN (
                           'completion', 'achievement', 'hours_milestone', 'test_passed')),

    title             TEXT NOT NULL,
    description       TEXT,
    hours_completed   NUMERIC(8,2),
    pdf_url           TEXT,
    image_url         TEXT,
    blockchain_hash   VARCHAR(255),
    blockchain_verified BOOLEAN DEFAULT false,

    issued_by       UUID REFERENCES instructors(id),
    sent_to_student BOOLEAN DEFAULT false,
    sent_at         TIMESTAMP,

    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_tenant  ON certificates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_number  ON certificates(certificate_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_number_tenant
    ON certificates(tenant_id, certificate_number);

-- =====================================================
-- 13. SCHEDULING & AVAILABILITY
-- =====================================================

CREATE TABLE IF NOT EXISTS scheduling_settings (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

    default_lesson_duration    INTEGER NOT NULL DEFAULT 120,
    lesson_duration_templates  JSONB DEFAULT '[
        {"name": "Quick (1 hour)",       "minutes": 60},
        {"name": "Standard (2 hours)",   "minutes": 120},
        {"name": "Extended (2.5 hours)", "minutes": 150},
        {"name": "Intensive (3 hours)",  "minutes": 180}
    ]'::jsonb,

    buffer_time_between_lessons       INTEGER NOT NULL DEFAULT 15,
    buffer_time_before_first_lesson   INTEGER NOT NULL DEFAULT 0,
    buffer_time_after_last_lesson     INTEGER NOT NULL DEFAULT 0,

    min_hours_advance_booking  INTEGER NOT NULL DEFAULT 24,
    max_days_advance_booking   INTEGER NOT NULL DEFAULT 60,
    allow_back_to_back_lessons BOOLEAN DEFAULT false,

    default_work_start_time TIME DEFAULT '07:00',
    default_work_end_time   TIME DEFAULT '20:00',

    default_max_students_per_day INTEGER NOT NULL DEFAULT 3,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduling_settings_tenant ON scheduling_settings(tenant_id);

DROP TRIGGER IF EXISTS update_scheduling_settings_updated_at ON scheduling_settings;
CREATE TRIGGER update_scheduling_settings_updated_at
    BEFORE UPDATE ON scheduling_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS instructor_availability (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,

    effective_from  DATE,
    effective_until DATE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_availability_instructor
    ON instructor_availability(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_availability_day
    ON instructor_availability(day_of_week);

DROP TRIGGER IF EXISTS update_instructor_availability_updated_at ON instructor_availability;
CREATE TRIGGER update_instructor_availability_updated_at
    BEFORE UPDATE ON instructor_availability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS instructor_time_off (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    start_time TIME,
    end_time   TIME,

    reason VARCHAR(100) NOT NULL CHECK (reason IN (
                'vacation', 'sick', 'personal', 'training',
                'maintenance', 'holiday', 'other')),
    notes TEXT,

    is_approved  BOOLEAN DEFAULT true,
    approved_by  UUID REFERENCES users(id),
    approved_at  TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_time_off_instructor ON instructor_time_off(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_tenant     ON instructor_time_off(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_dates      ON instructor_time_off(start_date, end_date);

DROP TRIGGER IF EXISTS update_instructor_time_off_updated_at ON instructor_time_off;
CREATE TRIGGER update_instructor_time_off_updated_at
    BEFORE UPDATE ON instructor_time_off
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS recurring_lesson_patterns (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES students(id)    ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
    vehicle_id    UUID REFERENCES vehicles(id)             ON DELETE SET NULL,

    frequency    VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'bi_weekly', 'monthly')),
    day_of_week  INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time   TIME        NOT NULL,
    duration     INTEGER     NOT NULL DEFAULT 120,

    pattern_start_date DATE NOT NULL,
    pattern_end_date   DATE,

    lesson_type VARCHAR(50) DEFAULT 'behind_wheel'
                  CHECK (lesson_type IN ('behind_wheel', 'classroom', 'road_test_prep')),
    cost        NUMERIC(10,2),
    notes       TEXT,

    status                  VARCHAR(20) DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    total_lessons_generated INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_patterns_tenant     ON recurring_lesson_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_student    ON recurring_lesson_patterns(student_id);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_instructor ON recurring_lesson_patterns(instructor_id);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_status     ON recurring_lesson_patterns(status);

DROP TRIGGER IF EXISTS update_recurring_patterns_updated_at ON recurring_lesson_patterns;
CREATE TRIGGER update_recurring_patterns_updated_at
    BEFORE UPDATE ON recurring_lesson_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 14. NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,

    type    VARCHAR(50) NOT NULL CHECK (type IN (
                'lesson_reminder', 'lesson_cancelled', 'lesson_rescheduled',
                'payment_received', 'payment_overdue', 'certificate_issued',
                'instructor_assigned', 'time_off_approved', 'follow_up_due',
                'system', 'general')),
    title   VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    action_url   TEXT,
    action_label VARCHAR(100),

    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,

    related_entity_type VARCHAR(50),
    related_entity_id   UUID,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant  ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_templates (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    template_key VARCHAR(100) NOT NULL,
    channel      VARCHAR(20)  NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
    name         VARCHAR(255) NOT NULL,

    subject    VARCHAR(255),
    body       TEXT NOT NULL,
    is_active  BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_key
    ON notification_templates(tenant_id, template_key, channel);
CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant
    ON notification_templates(tenant_id);

DROP TRIGGER IF EXISTS update_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER update_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 15. LESSON INVITES
-- =====================================================

CREATE TABLE IF NOT EXISTS lesson_invites (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    lesson_id  UUID NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    token      VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,

    status       VARCHAR(20) DEFAULT 'pending'
                   CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    responded_at TIMESTAMP,
    message      TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_invites_lesson  ON lesson_invites(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_invites_student ON lesson_invites(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_invites_token   ON lesson_invites(token);
CREATE INDEX IF NOT EXISTS idx_lesson_invites_status  ON lesson_invites(status);

DROP TRIGGER IF EXISTS update_lesson_invites_updated_at ON lesson_invites;
CREATE TRIGGER update_lesson_invites_updated_at
    BEFORE UPDATE ON lesson_invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 16. CALENDAR INTEGRATION TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS instructor_calendar_auth (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL UNIQUE REFERENCES instructors(id) ON DELETE CASCADE,

    access_token   TEXT,
    refresh_token  TEXT,
    token_expiry   TIMESTAMP,

    calendar_provider VARCHAR(50) DEFAULT 'google'
                        CHECK (calendar_provider IN ('google', 'apple', 'outlook')),
    calendar_id TEXT,

    is_active    BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_calendar_auth_instructor
    ON instructor_calendar_auth(instructor_id);

DROP TRIGGER IF EXISTS update_instructor_calendar_auth_updated_at ON instructor_calendar_auth;
CREATE TRIGGER update_instructor_calendar_auth_updated_at
    BEFORE UPDATE ON instructor_calendar_auth
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS instructor_ical_feeds (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL UNIQUE REFERENCES instructors(id) ON DELETE CASCADE,

    feed_url   TEXT          NOT NULL,
    feed_token VARCHAR(255)  NOT NULL UNIQUE,

    is_active               BOOLEAN DEFAULT true,
    include_student_names   BOOLEAN DEFAULT false,
    include_student_phones  BOOLEAN DEFAULT false,

    last_accessed_at TIMESTAMP,
    access_count     INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_ical_feeds_instructor
    ON instructor_ical_feeds(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_ical_feeds_token
    ON instructor_ical_feeds(feed_token);

DROP TRIGGER IF EXISTS update_instructor_ical_feeds_updated_at ON instructor_ical_feeds;
CREATE TRIGGER update_instructor_ical_feeds_updated_at
    BEFORE UPDATE ON instructor_ical_feeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS lesson_calendar_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id     UUID NOT NULL REFERENCES lessons(id)     ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    calendar_provider VARCHAR(50) CHECK (calendar_provider IN ('google', 'apple', 'outlook')),
    external_event_id TEXT,

    sync_status  VARCHAR(50) DEFAULT 'pending'
                   CHECK (sync_status IN ('pending', 'synced', 'failed', 'deleted')),
    last_synced_at TIMESTAMP,
    sync_error     TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_calendar_events_lesson
    ON lesson_calendar_events(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_calendar_events_instructor
    ON lesson_calendar_events(instructor_id);

DROP TRIGGER IF EXISTS update_lesson_calendar_events_updated_at ON lesson_calendar_events;
CREATE TRIGGER update_lesson_calendar_events_updated_at
    BEFORE UPDATE ON lesson_calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 17. VIEWS
-- =====================================================

DROP VIEW IF EXISTS tenant_full_info;
CREATE OR REPLACE VIEW tenant_full_info AS
SELECT
    t.*,
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
FROM tenants t
LEFT JOIN tenant_settings ts ON t.id = ts.tenant_id;

-- =====================================================
-- COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Budget Driving School — Schema Installation Complete';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Tables: users, tenants, tenant_settings,';
    RAISE NOTICE '        user_tenant_memberships, instructors, students,';
    RAISE NOTICE '        vehicles, lessons, leads, follow_ups,';
    RAISE NOTICE '        payments, invoices, invoice_line_items,';
    RAISE NOTICE '        payment_plans, installments,';
    RAISE NOTICE '        instructor_vehicle_assignments, vehicle_mileage_log,';
    RAISE NOTICE '        mileage_reimbursement_reports, vehicle_maintenance,';
    RAISE NOTICE '        instructor_certifications, blockchain_records,';
    RAISE NOTICE '        certificates, scheduling_settings,';
    RAISE NOTICE '        instructor_availability, instructor_time_off,';
    RAISE NOTICE '        recurring_lesson_patterns, notifications,';
    RAISE NOTICE '        notification_templates, lesson_invites,';
    RAISE NOTICE '        instructor_calendar_auth, instructor_ical_feeds,';
    RAISE NOTICE '        lesson_calendar_events';
    RAISE NOTICE 'Views:  tenant_full_info';
    RAISE NOTICE '====================================================';
END $$;
