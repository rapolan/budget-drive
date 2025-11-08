-- =====================================================
-- INSTRUCTOR AVAILABILITY & SCHEDULING ENHANCEMENTS
-- =====================================================
-- Migration: 002_instructor_availability.sql
-- Description: Add instructor availability, working hours, and vehicle ownership
-- =====================================================

-- =====================================================
-- INSTRUCTOR AVAILABILITY SCHEDULE
-- =====================================================
-- Stores instructor working hours (recurring weekly schedule)
CREATE TABLE IF NOT EXISTS instructor_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),

    -- Time range
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Notes (e.g., "Only morning shifts on Mondays")
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure no overlapping availability for same instructor on same day
    CONSTRAINT unique_instructor_day_time UNIQUE (instructor_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_instructor_availability_instructor ON instructor_availability(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_availability_tenant ON instructor_availability(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instructor_availability_day ON instructor_availability(day_of_week);

-- =====================================================
-- INSTRUCTOR TIME OFF / UNAVAILABILITY
-- =====================================================
-- Stores one-time unavailability (vacation, sick days, personal time off)
CREATE TABLE IF NOT EXISTS instructor_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Date range
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Optional: specific time range (null = all day)
    start_time TIME,
    end_time TIME,

    -- Reason
    reason VARCHAR(100), -- 'vacation', 'sick', 'personal', 'training', 'other'
    notes TEXT,

    -- Status
    is_approved BOOLEAN DEFAULT true,
    approved_by VARCHAR(255), -- Admin email/name who approved
    approved_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_instructor_time_off_instructor ON instructor_time_off(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_tenant ON instructor_time_off(tenant_id);
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_dates ON instructor_time_off(start_date, end_date);

-- =====================================================
-- VEHICLE OWNERSHIP TRACKING
-- =====================================================
-- Add instructor ownership flag to vehicles table
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL;

ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(50) DEFAULT 'school_owned'
CHECK (ownership_type IN ('school_owned', 'instructor_owned', 'leased'));

CREATE INDEX IF NOT EXISTS idx_vehicles_instructor ON vehicles(instructor_id);

-- =====================================================
-- SCHEDULING CONFIGURATION
-- =====================================================
-- Tenant-level scheduling settings
CREATE TABLE IF NOT EXISTS scheduling_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,

    -- Buffer times (in minutes)
    buffer_time_between_lessons INTEGER DEFAULT 30,
    buffer_time_before_first_lesson INTEGER DEFAULT 0,
    buffer_time_after_last_lesson INTEGER DEFAULT 0,

    -- Booking windows
    min_hours_advance_booking INTEGER DEFAULT 24, -- How far in advance must lessons be booked
    max_days_advance_booking INTEGER DEFAULT 90, -- How far in future can book

    -- Lesson duration defaults (in minutes)
    default_lesson_duration INTEGER DEFAULT 60,
    allow_back_to_back_lessons BOOLEAN DEFAULT false, -- Override buffer for same student

    -- Working day defaults
    default_work_start_time TIME DEFAULT '09:00:00',
    default_work_end_time TIME DEFAULT '17:00:00',

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduling_settings_tenant ON scheduling_settings(tenant_id);

-- =====================================================
-- NOTIFICATION QUEUE
-- =====================================================
-- Queue for scheduled notifications
CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Notification details
    notification_type VARCHAR(50) NOT NULL, -- 'lesson_reminder_24h', 'lesson_reminder_1h', 'lesson_booked', 'lesson_cancelled'
    recipient_type VARCHAR(50) NOT NULL, -- 'student', 'instructor', 'admin'
    recipient_id UUID NOT NULL, -- student_id or instructor_id

    -- Delivery channels
    send_email BOOLEAN DEFAULT true,
    send_sms BOOLEAN DEFAULT false,

    -- Contact info (cached at queue time)
    email VARCHAR(255),
    phone VARCHAR(50),

    -- Message content
    subject VARCHAR(255),
    message TEXT NOT NULL,

    -- Related entity
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,

    -- Scheduling
    scheduled_for TIMESTAMP NOT NULL,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    sent_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_tenant ON notification_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_lesson ON notification_queue(lesson_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);

-- =====================================================
-- UPDATE EXISTING TABLES
-- =====================================================

-- Add instructor preference for vehicle
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS prefers_own_vehicle BOOLEAN DEFAULT false;

ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS default_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

-- Add lesson buffer tracking
ALTER TABLE lessons
ADD COLUMN IF NOT EXISTS buffer_time_after INTEGER DEFAULT 30; -- in minutes

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at for new tables
DROP TRIGGER IF EXISTS update_instructor_availability_updated_at ON instructor_availability;
CREATE TRIGGER update_instructor_availability_updated_at
    BEFORE UPDATE ON instructor_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_instructor_time_off_updated_at ON instructor_time_off;
CREATE TRIGGER update_instructor_time_off_updated_at
    BEFORE UPDATE ON instructor_time_off
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduling_settings_updated_at ON scheduling_settings;
CREATE TRIGGER update_scheduling_settings_updated_at
    BEFORE UPDATE ON scheduling_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_queue_updated_at ON notification_queue;
CREATE TRIGGER update_notification_queue_updated_at
    BEFORE UPDATE ON notification_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DEFAULT SCHEDULING SETTINGS FOR EXISTING TENANTS
-- =====================================================

-- Insert default scheduling settings for all existing tenants
INSERT INTO scheduling_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE instructor_availability IS 'Recurring weekly availability schedule for instructors';
COMMENT ON TABLE instructor_time_off IS 'One-time unavailability periods (vacations, sick days, etc.)';
COMMENT ON TABLE scheduling_settings IS 'Tenant-level scheduling configuration and buffer times';
COMMENT ON TABLE notification_queue IS 'Queue for scheduled email and SMS notifications';

COMMENT ON COLUMN instructor_availability.day_of_week IS '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
COMMENT ON COLUMN scheduling_settings.buffer_time_between_lessons IS 'Minutes between lessons (default: 30)';
COMMENT ON COLUMN vehicles.instructor_id IS 'If instructor-owned, references the instructor who owns it';
COMMENT ON COLUMN instructors.prefers_own_vehicle IS 'True if instructor typically uses their own vehicle';
