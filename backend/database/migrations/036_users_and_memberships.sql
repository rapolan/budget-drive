-- Migration 036: Users and User Tenant Memberships
-- Purpose: Add user authentication tables for multi-user login support

-- Users table - stores user accounts
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    phone VARCHAR(50),
    profile_photo_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- User tenant memberships - links users to tenants with roles
CREATE TABLE IF NOT EXISTS user_tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'instructor', 'staff', 'viewer')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'declined')),
    instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Each user can only have one membership per tenant
    UNIQUE(user_id, tenant_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_user_id ON user_tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_tenant_id ON user_tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_instructor_id ON user_tenant_memberships(instructor_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

DROP TRIGGER IF EXISTS trigger_user_tenant_memberships_updated_at ON user_tenant_memberships;
CREATE TRIGGER trigger_user_tenant_memberships_updated_at
    BEFORE UPDATE ON user_tenant_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Insert a default admin user for the existing dev tenant
-- Password: 'admin123' (bcrypt hash with 10 rounds)
-- In production, this should be changed immediately
INSERT INTO users (id, email, password_hash, full_name, email_verified)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@budgetdrivingschool.com',
    '$2b$10$qNlO4pH2dg/CRMmtI/3MVu7smLDzdITv4DFEM43FRbfwvWjO27qkG',
    'Admin User',
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- Link admin user to dev tenant as owner
INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status, accepted_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '55654b9d-6d7f-46e0-ade2-be606abfe00a',
    'owner',
    'active',
    NOW()
)
ON CONFLICT (user_id, tenant_id) DO NOTHING;
