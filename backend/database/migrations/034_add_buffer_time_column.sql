-- Migration: Add buffer_time_between_lessons to scheduling_settings
-- Date: 2025-12-11

-- Add buffer_time_between_lessons column if it doesn't exist
ALTER TABLE scheduling_settings
ADD COLUMN IF NOT EXISTS buffer_time_between_lessons INTEGER DEFAULT 30;

-- Update existing rows to have the default value
UPDATE scheduling_settings
SET buffer_time_between_lessons = 30
WHERE buffer_time_between_lessons IS NULL;

-- Add comment
COMMENT ON COLUMN scheduling_settings.buffer_time_between_lessons IS 'Buffer time in minutes between consecutive lessons (default: 30 minutes)';
