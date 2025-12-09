-- Migration 023: Calendar Feed Tokens
-- Adds calendar feed token column to instructors for ICS feed subscriptions
-- This enables a zero-config calendar sync solution that works with any calendar app

-- Add calendar feed token column
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS calendar_feed_token VARCHAR(64) UNIQUE;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_instructors_calendar_feed_token 
ON instructors(calendar_feed_token) 
WHERE calendar_feed_token IS NOT NULL;

-- Add comment
COMMENT ON COLUMN instructors.calendar_feed_token IS 'Unique token for ICS calendar feed subscription URL';
