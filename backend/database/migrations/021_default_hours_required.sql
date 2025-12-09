-- Migration: Add default_hours_required to tenant_settings
-- This allows each driving school to set their state's required training hours

-- Add the column with a default of 6 (California requirement for under 18)
ALTER TABLE tenant_settings 
ADD COLUMN IF NOT EXISTS default_hours_required DECIMAL(5,2) DEFAULT 6.00;

-- Add a comment explaining the field
COMMENT ON COLUMN tenant_settings.default_hours_required IS 'Default training hours required for new students. California requires 6 hours for students under 18.';
