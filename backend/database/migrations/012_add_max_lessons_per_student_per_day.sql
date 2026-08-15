-- Tenant-configurable cap on how many lessons a single student may have
-- booked on the same calendar day. Enforced in checkSchedulingConflicts
-- (student_daily_limit conflict type) on create/update/reschedule, and by
-- slot search excluding any day the student is already at the cap.
-- NOT NULL with a DEFAULT so every tenant - including ones created before
-- this migration - always has a concrete value to enforce against; default
-- of 1 matches the existing "one lesson per student per day" engine rule.

ALTER TABLE public.tenant_settings
    ADD COLUMN max_lessons_per_student_per_day integer NOT NULL DEFAULT 1;
