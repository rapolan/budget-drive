-- Migration: Create instructor_time_off table
-- Date: 2025-12-11

-- Create instructor_time_off table
CREATE TABLE IF NOT EXISTS instructor_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  reason TEXT NOT NULL,
  notes TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on instructor_id for faster queries
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_instructor_id ON instructor_time_off(instructor_id);

-- Create index on tenant_id for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_tenant_id ON instructor_time_off(tenant_id);

-- Create index on date range for scheduling queries
CREATE INDEX IF NOT EXISTS idx_instructor_time_off_dates ON instructor_time_off(start_date, end_date);

-- Add comments
COMMENT ON TABLE instructor_time_off IS 'Stores instructor time off requests and approvals';
COMMENT ON COLUMN instructor_time_off.start_time IS 'Optional start time for partial day time off';
COMMENT ON COLUMN instructor_time_off.end_time IS 'Optional end time for partial day time off';
COMMENT ON COLUMN instructor_time_off.is_approved IS 'Whether the time off request has been approved';
