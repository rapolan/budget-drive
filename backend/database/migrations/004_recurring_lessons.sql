-- =====================================================
-- PHASE 4C: RECURRING LESSONS
-- Migration 004: Recurring Lesson Patterns
-- =====================================================

-- =====================================================
-- RECURRING LESSON PATTERNS
-- Defines repeating lesson templates
-- =====================================================
CREATE TABLE IF NOT EXISTS recurring_lesson_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Pattern details
    pattern_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Participants
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,

    -- Lesson details
    lesson_type VARCHAR(50) DEFAULT 'behind_wheel' CHECK (lesson_type IN ('behind_wheel', 'classroom', 'observation', 'road_test')),
    duration INTEGER NOT NULL, -- minutes
    cost DECIMAL(10, 2) NOT NULL,

    -- Recurrence pattern
    recurrence_type VARCHAR(20) NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'biweekly', 'monthly')),
    days_of_week INTEGER[], -- Array: [1,3,5] for Mon, Wed, Fri (1=Monday, 7=Sunday)
    time_of_day TIME NOT NULL, -- Start time for each occurrence

    -- Pattern duration
    start_date DATE NOT NULL,
    end_date DATE, -- NULL = indefinite
    max_occurrences INTEGER, -- NULL = unlimited

    -- Status
    is_active BOOLEAN DEFAULT true,
    created_by UUID,

    -- Package linking (optional) - TODO: Add FK when lesson_packages table exists
    package_id UUID,
    deduct_from_package BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_recurring_patterns_student ON recurring_lesson_patterns(student_id);
CREATE INDEX idx_recurring_patterns_instructor ON recurring_lesson_patterns(instructor_id);
CREATE INDEX idx_recurring_patterns_active ON recurring_lesson_patterns(is_active);
CREATE INDEX idx_recurring_patterns_dates ON recurring_lesson_patterns(start_date, end_date);

-- =====================================================
-- GENERATED LESSONS FROM PATTERNS
-- Tracks which lessons were generated from patterns
-- =====================================================
CREATE TABLE IF NOT EXISTS pattern_generated_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pattern_id UUID NOT NULL REFERENCES recurring_lesson_patterns(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,

    -- Occurrence tracking
    occurrence_number INTEGER NOT NULL, -- 1st, 2nd, 3rd occurrence, etc.
    scheduled_date DATE NOT NULL,

    -- Status
    was_modified BOOLEAN DEFAULT false, -- Did admin change this lesson from pattern?
    is_exception BOOLEAN DEFAULT false, -- Is this a skip/exception?

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(pattern_id, occurrence_number)
);

-- Indexes
CREATE INDEX idx_pattern_lessons_pattern ON pattern_generated_lessons(pattern_id);
CREATE INDEX idx_pattern_lessons_lesson ON pattern_generated_lessons(lesson_id);
CREATE INDEX idx_pattern_lessons_date ON pattern_generated_lessons(scheduled_date);

-- =====================================================
-- PATTERN EXCEPTIONS
-- Dates to skip (holidays, vacations, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS recurring_pattern_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pattern_id UUID NOT NULL REFERENCES recurring_lesson_patterns(id) ON DELETE CASCADE,

    -- Exception details
    exception_date DATE NOT NULL,
    reason VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(pattern_id, exception_date)
);

-- Index
CREATE INDEX idx_pattern_exceptions_pattern ON recurring_pattern_exceptions(pattern_id);
CREATE INDEX idx_pattern_exceptions_date ON recurring_pattern_exceptions(exception_date);

-- =====================================================
-- UPDATE LESSON PACKAGES TABLE (when it exists)
-- Add recurring pattern support
-- =====================================================
-- TODO: Uncomment when lesson_packages table is created
-- ALTER TABLE lesson_packages
-- ADD COLUMN IF NOT EXISTS allow_recurring BOOLEAN DEFAULT true;
--
-- ALTER TABLE lesson_packages
-- ADD COLUMN IF NOT EXISTS recurring_pattern_id UUID REFERENCES recurring_lesson_patterns(id) ON DELETE SET NULL;

-- =====================================================
-- AUTO-UPDATE TIMESTAMPS
-- =====================================================
CREATE TRIGGER update_recurring_patterns_timestamp
    BEFORE UPDATE ON recurring_lesson_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_timestamps();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to calculate next occurrence date
CREATE OR REPLACE FUNCTION get_next_occurrence_date(
    p_last_date DATE,
    p_recurrence_type VARCHAR,
    p_days_of_week INTEGER[]
) RETURNS DATE AS $$
DECLARE
    v_next_date DATE;
    v_day_of_week INTEGER;
    v_days_to_add INTEGER := 1;
BEGIN
    CASE p_recurrence_type
        WHEN 'daily' THEN
            v_next_date := p_last_date + INTERVAL '1 day';

        WHEN 'weekly' THEN
            -- Find next matching day of week
            v_next_date := p_last_date + INTERVAL '1 day';
            LOOP
                v_day_of_week := EXTRACT(ISODOW FROM v_next_date); -- 1=Monday, 7=Sunday
                EXIT WHEN v_day_of_week = ANY(p_days_of_week);
                v_next_date := v_next_date + INTERVAL '1 day';
                v_days_to_add := v_days_to_add + 1;
                EXIT WHEN v_days_to_add > 7; -- Safety check
            END LOOP;

        WHEN 'biweekly' THEN
            v_next_date := p_last_date + INTERVAL '14 days';

        WHEN 'monthly' THEN
            v_next_date := p_last_date + INTERVAL '1 month';
    END CASE;

    RETURN v_next_date;
END;
$$ LANGUAGE plpgsql;

-- Function to check if date is exception
CREATE OR REPLACE FUNCTION is_exception_date(
    p_pattern_id UUID,
    p_date DATE
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM recurring_pattern_exceptions
        WHERE pattern_id = p_pattern_id AND exception_date = p_date
    );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Active recurring patterns with participant details
CREATE OR REPLACE VIEW active_recurring_patterns AS
SELECT
    p.*,
    s.full_name as student_name,
    i.full_name as instructor_name,
    v.make || ' ' || v.model as vehicle_name,
    (SELECT COUNT(*) FROM pattern_generated_lessons WHERE pattern_id = p.id) as total_occurrences,
    (SELECT COUNT(*) FROM pattern_generated_lessons pgl
     JOIN lessons l ON pgl.lesson_id = l.id
     WHERE pgl.pattern_id = p.id AND l.status = 'completed') as completed_occurrences
FROM recurring_lesson_patterns p
JOIN students s ON p.student_id = s.id
JOIN instructors i ON p.instructor_id = i.id
JOIN vehicles v ON p.vehicle_id = v.id
WHERE p.is_active = true
ORDER BY p.created_at DESC;

-- View: Upcoming pattern occurrences
CREATE OR REPLACE VIEW upcoming_pattern_lessons AS
SELECT
    pgl.*,
    p.pattern_name,
    l.date as lesson_date,
    l.start_time,
    l.end_time,
    l.status as lesson_status,
    s.full_name as student_name
FROM pattern_generated_lessons pgl
JOIN recurring_lesson_patterns p ON pgl.pattern_id = p.id
JOIN lessons l ON pgl.lesson_id = l.id
JOIN students s ON p.student_id = s.id
WHERE l.date >= CURRENT_DATE
ORDER BY l.date, l.start_time;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- This migration adds complete recurring lesson support:
-- 1. Pattern definition with flexible recurrence rules
-- 2. Generated lesson tracking
-- 3. Exception handling for holidays
-- 4. Package integration
-- 5. Helper functions for date calculations
