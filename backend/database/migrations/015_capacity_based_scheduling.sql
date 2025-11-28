-- =====================================================
-- CAPACITY-BASED SCHEDULING SYSTEM
-- Migration: 015_capacity_based_scheduling.sql
-- Description: Adds capacity-based scheduling with max students per day
-- =====================================================

-- =====================================================
-- 1. ADD CAPACITY FIELDS TO SCHEDULING SETTINGS
-- =====================================================

-- Update default lesson duration to 120 minutes (2 hours)
ALTER TABLE scheduling_settings
ALTER COLUMN default_lesson_duration SET DEFAULT 120;

-- Add default max students per day per instructor
ALTER TABLE scheduling_settings
ADD COLUMN IF NOT EXISTS default_max_students_per_day INTEGER DEFAULT 3
CHECK (default_max_students_per_day > 0 AND default_max_students_per_day <= 20);

-- Add lesson duration templates for customization
ALTER TABLE scheduling_settings
ADD COLUMN IF NOT EXISTS lesson_duration_templates JSONB DEFAULT '[
  {"name": "Quick (1 hour)", "minutes": 60},
  {"name": "Standard (2 hours)", "minutes": 120},
  {"name": "Extended (2.5 hours)", "minutes": 150},
  {"name": "Intensive (3 hours)", "minutes": 180}
]'::jsonb;

COMMENT ON COLUMN scheduling_settings.default_lesson_duration IS 'Default lesson duration in minutes (e.g., 120 = 2 hours)';
COMMENT ON COLUMN scheduling_settings.default_max_students_per_day IS 'Default maximum number of students an instructor can teach per day';
COMMENT ON COLUMN scheduling_settings.lesson_duration_templates IS 'Pre-configured lesson duration options for booking UI';

-- =====================================================
-- 2. ADD CAPACITY FIELDS TO INSTRUCTORS
-- =====================================================

-- Add instructor-specific capacity override
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS max_students_per_day INTEGER
CHECK (max_students_per_day IS NULL OR (max_students_per_day > 0 AND max_students_per_day <= 20));

-- Add flag to prefer instructor's own vehicle
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS prefers_own_vehicle BOOLEAN DEFAULT false;

-- Add default vehicle for instructor (links to their vehicle)
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS default_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

COMMENT ON COLUMN instructors.max_students_per_day IS 'Override for max students per day. NULL means use tenant default from scheduling_settings';
COMMENT ON COLUMN instructors.prefers_own_vehicle IS 'Whether instructor prefers to use their own vehicle for lessons';
COMMENT ON COLUMN instructors.default_vehicle_id IS 'Default vehicle to use for this instructor''s lessons';

-- =====================================================
-- 3. UPDATE EXISTING DATA
-- =====================================================

-- Update all existing scheduling_settings to use new default (120 minutes)
UPDATE scheduling_settings
SET default_lesson_duration = 120
WHERE default_lesson_duration = 60;

-- Set prefers_own_vehicle to true for instructors who provide their own vehicle
UPDATE instructors
SET prefers_own_vehicle = true
WHERE provides_own_vehicle = true;

-- =====================================================
-- 4. CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_instructors_default_vehicle ON instructors(default_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_instructors_max_students ON instructors(max_students_per_day) WHERE max_students_per_day IS NOT NULL;

-- =====================================================
-- 5. CREATE HELPER VIEW FOR EFFECTIVE CAPACITY
-- =====================================================

-- View that shows the effective max_students_per_day for each instructor
-- (using instructor override if set, otherwise tenant default)
CREATE OR REPLACE VIEW instructor_effective_capacity AS
SELECT
  i.id AS instructor_id,
  i.tenant_id,
  i.full_name AS instructor_name,
  COALESCE(i.max_students_per_day, ss.default_max_students_per_day) AS max_students_per_day,
  ss.default_lesson_duration,
  ss.buffer_time_between_lessons,
  i.prefers_own_vehicle,
  i.default_vehicle_id,
  -- Calculate total work time needed per day (in minutes)
  COALESCE(i.max_students_per_day, ss.default_max_students_per_day) *
    (ss.default_lesson_duration + ss.buffer_time_between_lessons) -
    ss.buffer_time_between_lessons AS total_minutes_per_day
FROM instructors i
JOIN scheduling_settings ss ON i.tenant_id = ss.tenant_id
WHERE i.status = 'active';

COMMENT ON VIEW instructor_effective_capacity IS 'Shows effective capacity for each instructor, resolving overrides vs defaults';

-- =====================================================
-- 6. CREATE FUNCTION TO CALCULATE DAILY SLOTS
-- =====================================================

-- Function to calculate what time an instructor's day ends based on their start time and capacity
CREATE OR REPLACE FUNCTION calculate_instructor_end_time(
  p_start_time TIME,
  p_max_students INTEGER,
  p_lesson_duration INTEGER,
  p_buffer_time INTEGER
) RETURNS TIME AS $$
DECLARE
  v_total_minutes INTEGER;
  v_end_time TIME;
BEGIN
  -- Calculate total minutes: (lesson_duration × students) + (buffer × (students - 1))
  v_total_minutes := (p_lesson_duration * p_max_students) + (p_buffer_time * (p_max_students - 1));

  -- Add to start time
  v_end_time := p_start_time + (v_total_minutes || ' minutes')::INTERVAL;

  RETURN v_end_time;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_instructor_end_time IS 'Calculates when instructor day ends based on start time, student capacity, lesson duration, and buffer time';

-- Example usage:
-- SELECT calculate_instructor_end_time('09:00:00', 3, 120, 30);
-- Result: 16:30:00 (9am + 2hr + 30min + 2hr + 30min + 2hr = 4:30pm)
