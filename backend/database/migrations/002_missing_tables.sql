-- =====================================================
-- BUDGET DRIVING SCHOOL - MIGRATION 002
-- Missing Tables: Scheduling, Notifications, Recurring
-- =====================================================
-- Migration: 002_missing_tables.sql
-- Description: Creates tables referenced by services
--   that were missing from the live database.
--   All statements use CREATE TABLE IF NOT EXISTS
--   so this is safe to re-run.
-- =====================================================

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. SCHEDULING SETTINGS
-- Tenant-level scheduling configuration
-- Referenced by: availabilityService.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS scheduling_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

    -- Lesson Duration
    default_lesson_duration INTEGER NOT NULL DEFAULT 120,   -- minutes
    lesson_duration_templates JSONB DEFAULT '[
        {"name": "Quick (1 hour)", "minutes": 60},
        {"name": "Standard (2 hours)", "minutes": 120},
        {"name": "Extended (2.5 hours)", "minutes": 150},
        {"name": "Intensive (3 hours)", "minutes": 180}
    ]'::jsonb,

    -- Buffer Times (minutes)
    buffer_time_between_lessons INTEGER NOT NULL DEFAULT 15,
    buffer_time_before_first_lesson INTEGER NOT NULL DEFAULT 0,
    buffer_time_after_last_lesson INTEGER NOT NULL DEFAULT 0,

    -- Booking Rules
    min_hours_advance_booking INTEGER NOT NULL DEFAULT 24,
    max_days_advance_booking INTEGER NOT NULL DEFAULT 60,
    allow_back_to_back_lessons BOOLEAN DEFAULT false,

    -- Work Hours Defaults
    default_work_start_time TIME DEFAULT '07:00',
    default_work_end_time TIME DEFAULT '20:00',

    -- Capacity
    default_max_students_per_day INTEGER NOT NULL DEFAULT 3,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduling_settings_tenant ON scheduling_settings(tenant_id);

DROP TRIGGER IF EXISTS update_scheduling_settings_updated_at ON scheduling_settings;
CREATE TRIGGER update_scheduling_settings_updated_at BEFORE UPDATE ON scheduling_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. INSTRUCTOR TIME OFF
-- Vacation, sick days, unavailability blocks
-- Referenced by: availabilityService.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS instructor_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Date Range
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Optional Time Range (for partial-day blocks)
    start_time TIME,
    end_time TIME,

    -- Details
    reason VARCHAR(100) NOT NULL CHECK (reason IN (
        'vacation', 'sick', 'personal', 'training',
        'maintenance', 'holiday', 'other'
    )),
    notes TEXT,

    -- Approval Workflow
    is_approved BOOLEAN DEFAULT true,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructor_time_off_instructor ON instructor_time_off(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_tenant ON instructor_time_off(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_dates ON instructor_time_off(start_date, end_date);

DROP TRIGGER IF EXISTS update_instructor_time_off_updated_at ON instructor_time_off;
CREATE TRIGGER update_instructor_time_off_updated_at BEFORE UPDATE ON instructor_time_off
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. RECURRING LESSON PATTERNS
-- Templates for repeating/series lessons
-- Referenced by: recurringPatternService.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS recurring_lesson_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,

    -- Recurrence Schedule
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'bi_weekly', 'monthly')),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    duration INTEGER NOT NULL DEFAULT 120,  -- minutes

    -- Date Range
    pattern_start_date DATE NOT NULL,
    pattern_end_date DATE,

    -- Lesson Defaults
    lesson_type VARCHAR(50) DEFAULT 'behind_wheel' CHECK (lesson_type IN ('behind_wheel', 'classroom', 'road_test_prep')),
    cost NUMERIC(10,2),
    notes TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    total_lessons_generated INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_patterns_tenant ON recurring_lesson_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_student ON recurring_lesson_patterns(student_id);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_instructor ON recurring_lesson_patterns(instructor_id);
CREATE INDEX IF NOT EXISTS idx_recurring_patterns_status ON recurring_lesson_patterns(status);

DROP TRIGGER IF EXISTS update_recurring_patterns_updated_at ON recurring_lesson_patterns;
CREATE TRIGGER update_recurring_patterns_updated_at BEFORE UPDATE ON recurring_lesson_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. NOTIFICATIONS
-- In-app notification inbox per user
-- Referenced by: notificationService.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Content
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'lesson_reminder', 'lesson_cancelled', 'lesson_rescheduled',
        'payment_received', 'payment_overdue', 'certificate_issued',
        'instructor_assigned', 'time_off_approved', 'follow_up_due',
        'system', 'general'
    )),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    -- Link
    action_url TEXT,
    action_label VARCHAR(100),

    -- State
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,

    -- Source
    related_entity_type VARCHAR(50),  -- 'lesson', 'payment', 'student', etc.
    related_entity_id UUID,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- =====================================================
-- 5. NOTIFICATION TEMPLATES
-- Email/SMS templates for automated notifications
-- Referenced by: notificationService.ts / notificationProcessor.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Template Identity
    template_key VARCHAR(100) NOT NULL,  -- e.g. 'lesson_reminder_24h'
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
    name VARCHAR(255) NOT NULL,

    -- Content (supports {{variable}} placeholders)
    subject VARCHAR(255),     -- email only
    body TEXT NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,  -- tenant override of system default

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_key ON notification_templates(tenant_id, template_key, channel);
CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant ON notification_templates(tenant_id);

DROP TRIGGER IF EXISTS update_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. LESSON INVITES
-- Student booking requests / invite links
-- Referenced by: lessonInviteService.ts
-- =====================================================

CREATE TABLE IF NOT EXISTS lesson_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

    -- Invite Token (for magic links)
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    responded_at TIMESTAMP,

    -- Details
    message TEXT,  -- optional message to student

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_invites_lesson ON lesson_invites(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_invites_student ON lesson_invites(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_invites_token ON lesson_invites(token);
CREATE INDEX IF NOT EXISTS idx_lesson_invites_status ON lesson_invites(status);

DROP TRIGGER IF EXISTS update_lesson_invites_updated_at ON lesson_invites;
CREATE TRIGGER update_lesson_invites_updated_at BEFORE UPDATE ON lesson_invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 002_missing_tables.sql completed successfully';
    RAISE NOTICE 'Tables created: scheduling_settings, instructor_time_off,';
    RAISE NOTICE '               recurring_lesson_patterns, notifications,';
    RAISE NOTICE '               notification_templates, lesson_invites';
END $$;
