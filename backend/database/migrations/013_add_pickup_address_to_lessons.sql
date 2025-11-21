-- Migration: Add pickup_address to lessons table
-- Description: Adds a pickup_address column to store lesson-specific pickup location
-- This allows different pickup locations per lesson instead of always using student's home address

-- Add pickup_address column
ALTER TABLE lessons
ADD COLUMN pickup_address TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN lessons.pickup_address IS 'Pickup location for this specific lesson (can differ from student home address)';
