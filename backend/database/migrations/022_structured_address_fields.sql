-- =====================================================
-- STRUCTURED ADDRESS FIELDS FOR STUDENTS
-- Migration: 022_structured_address_fields.sql
-- Description: Adds structured address fields to students table
--              for better querying, route optimization, and analytics
-- =====================================================

-- Add structured address fields to students table
ALTER TABLE students
ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(50),
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- Add index on zip_code for efficient proximity queries
CREATE INDEX IF NOT EXISTS idx_students_zip_code ON students(zip_code);

-- Add index on city for geographic grouping
CREATE INDEX IF NOT EXISTS idx_students_city ON students(city);

-- Add composite index for full location queries
CREATE INDEX IF NOT EXISTS idx_students_location ON students(zip_code, city, state);

-- Add comments for documentation
COMMENT ON COLUMN students.address_line1 IS 'Primary street address (e.g., 123 Main St)';
COMMENT ON COLUMN students.address_line2 IS 'Secondary address info (e.g., Apt 4B, Suite 100)';
COMMENT ON COLUMN students.city IS 'City name (e.g., San Diego)';
COMMENT ON COLUMN students.state IS 'State abbreviation or full name (e.g., CA or California)';
COMMENT ON COLUMN students.zip_code IS 'ZIP code for proximity-based queries (e.g., 92101)';

-- Note: The existing 'address' field is kept for backward compatibility
-- It can be used for display purposes while structured fields are used for queries
-- Future migration can deprecate the 'address' field once all data is migrated

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
