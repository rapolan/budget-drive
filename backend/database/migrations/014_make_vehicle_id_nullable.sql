-- Migration: Make vehicle_id nullable in lessons table
-- Description: Allow lessons to be created without a vehicle assignment
-- Instructors will assign vehicles later and log miles separately

-- Make vehicle_id nullable
ALTER TABLE lessons
ALTER COLUMN vehicle_id DROP NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN lessons.vehicle_id IS 'Vehicle used for this lesson (optional - instructors assign vehicles later)';
