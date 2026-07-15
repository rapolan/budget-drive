-- =====================================================
-- BUDGET DRIVING SCHOOL
-- IDEMPOTENT UPDATES — EXISTING DATABASE CATCH-UP
-- =====================================================
-- Migration:   002_idempotent_updates.sql
-- Description: Safe catch-up migration for databases that
--              were created before 001_complete_schema.sql
--              was updated. Every statement uses
--              IF NOT EXISTS or ADD COLUMN IF NOT EXISTS,
--              so this is safe to re-run at any time.
--
-- DO NOT add new feature columns here.
-- Add them to 001_complete_schema.sql instead.
-- This file exists solely to keep existing databases in sync.
-- =====================================================

-- Extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- tenant_settings table
-- =====================================================

ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS default_hours_required    NUMERIC(5,2) DEFAULT 6,
    ADD COLUMN IF NOT EXISTS enable_blockchain_payments BOOLEAN DEFAULT false;

-- =====================================================
-- users table
-- =====================================================

-- Password hash integrity constraint (was in 004_user_constraints.sql)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'users'
          AND constraint_name = 'check_password_hash_length'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT check_password_hash_length
            CHECK (length(password_hash) = 60);
        RAISE NOTICE 'Added constraint: check_password_hash_length';
    ELSE
        RAISE NOTICE 'Constraint check_password_hash_length already exists — skipped';
    END IF;
END $$;

-- =====================================================
-- user_tenant_memberships table
-- (was in 000_core_auth.sql, now in 001)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_tenant_memberships (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'instructor', 'staff', 'student')),
    status        VARCHAR(20) DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'pending', 'invited')),
    accepted_at   TIMESTAMP,
    invited_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at    TIMESTAMP,
    instructor_id UUID,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

-- Add invited_by and invited_at to existing installs
ALTER TABLE user_tenant_memberships
    ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;

-- Fix status constraint to include 'invited'
DO $$
BEGIN
    ALTER TABLE user_tenant_memberships DROP CONSTRAINT IF EXISTS user_tenant_memberships_status_check;
    ALTER TABLE user_tenant_memberships
        ADD CONSTRAINT user_tenant_memberships_status_check
        CHECK (status IN ('active', 'inactive', 'pending', 'invited'));
    RAISE NOTICE 'Fixed user_tenant_memberships status constraint';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Status constraint update skipped: %', SQLERRM;
END $$;


CREATE INDEX IF NOT EXISTS idx_memberships_user   ON user_tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON user_tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role   ON user_tenant_memberships(role);

-- =====================================================
-- instructors table
-- =====================================================

-- calendar_feed_token (was in 005_instructor_calendar_token.sql)
ALTER TABLE instructors
    ADD COLUMN IF NOT EXISTS calendar_feed_token VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_instructors_calendar_feed_token
    ON instructors(calendar_feed_token)
    WHERE calendar_feed_token IS NOT NULL;

-- =====================================================
-- students table
-- (columns were added in 003_student_columns.sql)
-- =====================================================

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS first_name  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS last_name   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS middle_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS city         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS state        VARCHAR(50),
    ADD COLUMN IF NOT EXISTS zip_code     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS emergency_contact_name   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS emergency_contact_phone  VARCHAR(50),
    ADD COLUMN IF NOT EXISTS emergency_contact_2_name  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS emergency_contact_2_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS learner_permit_number     VARCHAR(100),
    ADD COLUMN IF NOT EXISTS learner_permit_issue_date DATE,
    ADD COLUMN IF NOT EXISTS learner_permit_expiration DATE,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Relax legacy NOT NULL constraints that conflict with split-field model
ALTER TABLE students ALTER COLUMN full_name       DROP NOT NULL;
ALTER TABLE students ALTER COLUMN phone           DROP NOT NULL;
ALTER TABLE students ALTER COLUMN date_of_birth   DROP NOT NULL;
ALTER TABLE students ALTER COLUMN address         DROP NOT NULL;
ALTER TABLE students ALTER COLUMN emergency_contact DROP NOT NULL;

-- =====================================================
-- lessons table
-- (columns were added in 002_lesson_columns.sql)
-- =====================================================

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS lesson_number  INTEGER,
    ADD COLUMN IF NOT EXISTS pickup_address TEXT,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_lesson_number
    ON lessons(student_id, lesson_number);

-- =====================================================
-- Scheduling & availability tables
-- (were in 002_missing_tables.sql)
-- =====================================================

CREATE TABLE IF NOT EXISTS scheduling_settings (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

    default_lesson_duration   INTEGER NOT NULL DEFAULT 120,
    lesson_duration_templates JSONB DEFAULT '[
        {"name": "Quick (1 hour)",       "minutes": 60},
        {"name": "Standard (2 hours)",   "minutes": 120},
        {"name": "Extended (2.5 hours)", "minutes": 150},
        {"name": "Intensive (3 hours)",  "minutes": 180}
    ]'::jsonb,

    buffer_time_between_lessons     INTEGER NOT NULL DEFAULT 15,
    buffer_time_before_first_lesson INTEGER NOT NULL DEFAULT 0,
    buffer_time_after_last_lesson   INTEGER NOT NULL DEFAULT 0,

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

    is_approved BOOLEAN DEFAULT true,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,

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

    frequency   VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'bi_weekly', 'monthly')),
    day_of_week INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time  TIME        NOT NULL,
    duration    INTEGER     NOT NULL DEFAULT 120,

    pattern_start_date DATE NOT NULL,
    pattern_end_date   DATE,

    lesson_type VARCHAR(50) DEFAULT 'behind_wheel'
                  CHECK (lesson_type IN ('behind_wheel', 'classroom', 'road_test_prep')),
    cost   NUMERIC(10,2),
    notes  TEXT,

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
-- COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Budget Driving School — Idempotent Update Complete';
    RAISE NOTICE 'Existing database is now fully up to date.';
    RAISE NOTICE '====================================================';
END $$;
