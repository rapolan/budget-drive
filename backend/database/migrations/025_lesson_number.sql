-- Migration: Add lesson_number column to lessons table
-- Purpose: Track which lesson number this is for the student (e.g., "Lesson #3 of 6")

-- Add lesson_number column
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS lesson_number INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN lessons.lesson_number IS 'Which lesson number this is for the student (e.g., 1, 2, 3...)';
