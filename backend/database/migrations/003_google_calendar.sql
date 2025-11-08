-- =====================================================
-- PHASE 4B: GOOGLE CALENDAR INTEGRATION
-- Migration 003: Google Calendar Two-Way Sync
-- =====================================================

-- =====================================================
-- INSTRUCTOR CALENDAR CREDENTIALS
-- Stores OAuth tokens for Google Calendar access
-- =====================================================
CREATE TABLE IF NOT EXISTS instructor_calendar_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Google OAuth credentials
    google_access_token TEXT NOT NULL,
    google_refresh_token TEXT NOT NULL,
    google_token_expiry TIMESTAMP NOT NULL,

    -- Calendar configuration
    google_calendar_id VARCHAR(255) NOT NULL, -- Primary calendar ID
    calendar_name VARCHAR(255),
    sync_enabled BOOLEAN DEFAULT true,

    -- Sync preferences
    sync_direction VARCHAR(20) DEFAULT 'two_way' CHECK (sync_direction IN ('to_google', 'from_google', 'two_way')),
    auto_sync BOOLEAN DEFAULT true,
    sync_interval_minutes INTEGER DEFAULT 15, -- How often to check for changes

    -- Last sync tracking
    last_sync_at TIMESTAMP,
    last_sync_status VARCHAR(20) DEFAULT 'pending' CHECK (last_sync_status IN ('pending', 'success', 'failed')),
    last_sync_error TEXT,

    -- Webhook configuration (for real-time updates)
    webhook_channel_id VARCHAR(255), -- Google's channel ID
    webhook_resource_id VARCHAR(255), -- Google's resource ID
    webhook_expiration TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- One set of credentials per instructor
    UNIQUE(tenant_id, instructor_id)
);

-- Index for faster lookups
CREATE INDEX idx_calendar_creds_instructor ON instructor_calendar_credentials(instructor_id);
CREATE INDEX idx_calendar_creds_tenant ON instructor_calendar_credentials(tenant_id);
CREATE INDEX idx_calendar_creds_sync_enabled ON instructor_calendar_credentials(sync_enabled);

-- =====================================================
-- CALENDAR EVENT MAPPINGS
-- Maps our lessons to Google Calendar events
-- =====================================================
CREATE TABLE IF NOT EXISTS calendar_event_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Google Calendar event details
    google_event_id VARCHAR(255) NOT NULL, -- Google's event ID
    google_calendar_id VARCHAR(255) NOT NULL, -- Which calendar it's on

    -- Event metadata
    event_title VARCHAR(500),
    event_start TIMESTAMP NOT NULL,
    event_end TIMESTAMP NOT NULL,
    event_description TEXT,
    event_location VARCHAR(500),

    -- Sync tracking
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed', 'deleted')),
    sync_direction VARCHAR(20) CHECK (sync_direction IN ('to_google', 'from_google')),

    -- Conflict detection
    has_conflict BOOLEAN DEFAULT false,
    conflict_reason TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: one mapping per lesson
    UNIQUE(lesson_id),
    -- Unique constraint: one Google event per calendar
    UNIQUE(google_calendar_id, google_event_id)
);

-- Indexes for performance
CREATE INDEX idx_event_mappings_lesson ON calendar_event_mappings(lesson_id);
CREATE INDEX idx_event_mappings_instructor ON calendar_event_mappings(instructor_id);
CREATE INDEX idx_event_mappings_google_event ON calendar_event_mappings(google_event_id);
CREATE INDEX idx_event_mappings_sync_status ON calendar_event_mappings(sync_status);
CREATE INDEX idx_event_mappings_has_conflict ON calendar_event_mappings(has_conflict);

-- =====================================================
-- EXTERNAL CALENDAR EVENTS
-- Stores events from Google Calendar that aren't lessons
-- (for conflict detection)
-- =====================================================
CREATE TABLE IF NOT EXISTS external_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Google Calendar event details
    google_event_id VARCHAR(255) NOT NULL,
    google_calendar_id VARCHAR(255) NOT NULL,

    -- Event details
    event_title VARCHAR(500),
    event_start TIMESTAMP NOT NULL,
    event_end TIMESTAMP NOT NULL,
    event_description TEXT,
    event_location VARCHAR(500),
    all_day_event BOOLEAN DEFAULT false,

    -- Event status
    event_status VARCHAR(20) DEFAULT 'confirmed' CHECK (event_status IN ('confirmed', 'tentative', 'cancelled')),

    -- Tracking
    last_fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint
    UNIQUE(google_calendar_id, google_event_id)
);

-- Indexes for conflict detection queries
CREATE INDEX idx_external_events_instructor ON external_calendar_events(instructor_id);
CREATE INDEX idx_external_events_timerange ON external_calendar_events(event_start, event_end);
CREATE INDEX idx_external_events_status ON external_calendar_events(event_status);
CREATE INDEX idx_external_events_deleted ON external_calendar_events(is_deleted);

-- =====================================================
-- CALENDAR SYNC LOGS
-- Audit trail for sync operations
-- =====================================================
CREATE TABLE IF NOT EXISTS calendar_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,

    -- Sync operation details
    sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('manual', 'auto', 'webhook', 'initial')),
    sync_direction VARCHAR(20) NOT NULL CHECK (sync_direction IN ('to_google', 'from_google', 'two_way')),

    -- Results
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    events_synced INTEGER DEFAULT 0,
    events_created INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    events_deleted INTEGER DEFAULT 0,
    conflicts_detected INTEGER DEFAULT 0,

    -- Error tracking
    error_message TEXT,
    error_stack TEXT,

    -- Performance metrics
    duration_ms INTEGER, -- How long the sync took

    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for log queries
CREATE INDEX idx_sync_logs_instructor ON calendar_sync_logs(instructor_id);
CREATE INDEX idx_sync_logs_status ON calendar_sync_logs(status);
CREATE INDEX idx_sync_logs_created ON calendar_sync_logs(created_at);

-- =====================================================
-- UPDATE INSTRUCTORS TABLE
-- Add calendar sync preferences
-- =====================================================
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN DEFAULT false;

ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS calendar_last_synced_at TIMESTAMP;

-- =====================================================
-- UPDATE LESSONS TABLE
-- Add Google Calendar event ID
-- =====================================================
ALTER TABLE lessons
ADD COLUMN IF NOT EXISTS google_calendar_event_id VARCHAR(255);

ALTER TABLE lessons
ADD COLUMN IF NOT EXISTS calendar_sync_status VARCHAR(20) DEFAULT 'not_synced'
CHECK (calendar_sync_status IN ('not_synced', 'synced', 'pending', 'failed'));

CREATE INDEX IF NOT EXISTS idx_lessons_calendar_sync ON lessons(calendar_sync_status);

-- =====================================================
-- AUTO-UPDATE TIMESTAMPS
-- =====================================================
CREATE OR REPLACE FUNCTION update_calendar_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to calendar tables
CREATE TRIGGER update_instructor_calendar_credentials_timestamp
    BEFORE UPDATE ON instructor_calendar_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_timestamps();

CREATE TRIGGER update_calendar_event_mappings_timestamp
    BEFORE UPDATE ON calendar_event_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_timestamps();

CREATE TRIGGER update_external_calendar_events_timestamp
    BEFORE UPDATE ON external_calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_timestamps();

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View: Instructors with active calendar sync
CREATE OR REPLACE VIEW instructors_with_calendar_sync AS
SELECT
    i.id as instructor_id,
    i.full_name,
    i.email,
    i.tenant_id,
    c.google_calendar_id,
    c.sync_enabled,
    c.sync_direction,
    c.last_sync_at,
    c.last_sync_status
FROM instructors i
INNER JOIN instructor_calendar_credentials c ON i.id = c.instructor_id
WHERE c.sync_enabled = true;

-- View: Upcoming external events (for conflict detection)
CREATE OR REPLACE VIEW upcoming_external_events AS
SELECT
    e.*,
    i.full_name as instructor_name
FROM external_calendar_events e
INNER JOIN instructors i ON e.instructor_id = i.id
WHERE e.event_start >= NOW()
    AND e.is_deleted = false
    AND e.event_status IN ('confirmed', 'tentative')
ORDER BY e.event_start;

-- =====================================================
-- GRANT PERMISSIONS (if using specific db users)
-- =====================================================
-- GRANT ALL ON instructor_calendar_credentials TO budget_app_user;
-- GRANT ALL ON calendar_event_mappings TO budget_app_user;
-- GRANT ALL ON external_calendar_events TO budget_app_user;
-- GRANT ALL ON calendar_sync_logs TO budget_app_user;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This migration adds complete Google Calendar integration:
-- 1. OAuth credential storage
-- 2. Event mapping between lessons and Google Calendar
-- 3. External event tracking for conflict detection
-- 4. Sync logging and audit trail
-- 5. Webhook support for real-time updates
