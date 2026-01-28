-- =====================================================
-- MIGRATION 030: AUDIT TRAIL - Track WHO created/edited records
-- =====================================================
-- Description: Adds created_by and updated_by fields to track user actions
--
-- Key Features:
--   1. Track WHO created each record (created_by)
--   2. Track WHO last modified each record (updated_by)
--   3. Automatic trigger to update updated_by on record changes
--   4. Applied to core tables: students, lessons, instructors, payments, vehicles
-- =====================================================

-- =====================================================
-- 1. ADD AUDIT COLUMNS TO CORE TABLES
-- =====================================================

-- Students: Track who creates/edits student records
ALTER TABLE students
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN students.created_by IS 'User who created this student record';
COMMENT ON COLUMN students.updated_by IS 'User who last modified this student record';

-- Lessons: Track who creates/edits lesson records
ALTER TABLE lessons
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN lessons.created_by IS 'User who created this lesson';
COMMENT ON COLUMN lessons.updated_by IS 'User who last modified this lesson';

-- Instructors: Track who creates/edits instructor records
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN instructors.created_by IS 'User who created this instructor record';
COMMENT ON COLUMN instructors.updated_by IS 'User who last modified this instructor record';

-- Payments: Track who creates/edits payment records
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN payments.created_by IS 'User who created this payment record';
COMMENT ON COLUMN payments.updated_by IS 'User who last modified this payment record';

-- Vehicles: Track who creates/edits vehicle records
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN vehicles.created_by IS 'User who created this vehicle record';
COMMENT ON COLUMN vehicles.updated_by IS 'User who last modified this vehicle record';

-- =====================================================
-- 2. CREATE AUDIT TRIGGER FUNCTION
-- =====================================================

-- Function to automatically set updated_by when a record is modified
CREATE OR REPLACE FUNCTION set_updated_by_from_session()
RETURNS TRIGGER AS $$
BEGIN
    -- Get user_id from session variable if set
    -- Application should set this via: SET LOCAL app.current_user_id = 'user-uuid';
    IF current_setting('app.current_user_id', true) IS NOT NULL THEN
        NEW.updated_by = current_setting('app.current_user_id', true)::UUID;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_by_from_session() IS 'Automatically sets updated_by column from session variable on UPDATE';

-- =====================================================
-- 3. ATTACH AUDIT TRIGGERS TO TABLES
-- =====================================================

-- Students: Auto-update updated_by on modifications
DROP TRIGGER IF EXISTS set_students_updated_by ON students;
CREATE TRIGGER set_students_updated_by
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_by_from_session();

-- Lessons: Auto-update updated_by on modifications
DROP TRIGGER IF EXISTS set_lessons_updated_by ON lessons;
CREATE TRIGGER set_lessons_updated_by
    BEFORE UPDATE ON lessons
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_by_from_session();

-- Instructors: Auto-update updated_by on modifications
DROP TRIGGER IF EXISTS set_instructors_updated_by ON instructors;
CREATE TRIGGER set_instructors_updated_by
    BEFORE UPDATE ON instructors
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_by_from_session();

-- Payments: Auto-update updated_by on modifications
DROP TRIGGER IF EXISTS set_payments_updated_by ON payments;
CREATE TRIGGER set_payments_updated_by
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_by_from_session();

-- Vehicles: Auto-update updated_by on modifications
DROP TRIGGER IF EXISTS set_vehicles_updated_by ON vehicles;
CREATE TRIGGER set_vehicles_updated_by
    BEFORE UPDATE ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_by_from_session();

-- =====================================================
-- 4. CREATE INDEXES FOR AUDIT QUERIES
-- =====================================================

-- Indexes to efficiently query "who created/edited what"
CREATE INDEX IF NOT EXISTS idx_students_created_by ON students(created_by);
CREATE INDEX IF NOT EXISTS idx_students_updated_by ON students(updated_by);

CREATE INDEX IF NOT EXISTS idx_lessons_created_by ON lessons(created_by);
CREATE INDEX IF NOT EXISTS idx_lessons_updated_by ON lessons(updated_by);

CREATE INDEX IF NOT EXISTS idx_instructors_created_by ON instructors(created_by);
CREATE INDEX IF NOT EXISTS idx_instructors_updated_by ON instructors(updated_by);

CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_updated_by ON payments(updated_by);

CREATE INDEX IF NOT EXISTS idx_vehicles_created_by ON vehicles(created_by);
CREATE INDEX IF NOT EXISTS idx_vehicles_updated_by ON vehicles(updated_by);

-- =====================================================
-- USAGE NOTES
-- =====================================================
--
-- APPLICATION USAGE:
--
-- 1. On INSERT - Pass created_by explicitly:
--    INSERT INTO students (..., created_by) VALUES (..., 'user-uuid');
--
-- 2. On UPDATE - Set session variable before update:
--    await query('SET LOCAL app.current_user_id = $1', [userId]);
--    await query('UPDATE students SET ... WHERE id = $1', [studentId]);
--
--    Or pass updated_by explicitly:
--    UPDATE students SET ..., updated_by = 'user-uuid' WHERE id = ...;
--
-- 3. Query audit trail:
--    SELECT s.*,
--           u1.full_name as created_by_name,
--           u2.full_name as updated_by_name
--    FROM students s
--    LEFT JOIN users u1 ON s.created_by = u1.id
--    LEFT JOIN users u2 ON s.updated_by = u2.id;
--
-- =====================================================
