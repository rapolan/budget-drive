-- =====================================================
-- MIGRATION 020: TENANT TYPES & REFERRAL SYSTEM
-- =====================================================
-- Description: Adds support for independent instructors vs driving schools
--              and implements referral tracking with rewards/commissions
-- 
-- Key Features:
--   1. Tenant type: 'school' or 'independent'
--   2. User-to-tenant linking (same user, multiple accounts)
--   3. Referral tracking with rewards and commission splits
--   4. Public profile settings for booking pages
-- =====================================================

-- =====================================================
-- 1. TENANT TYPE SUPPORT
-- =====================================================

-- Add tenant_type to tenants table
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(20) DEFAULT 'school' 
CHECK (tenant_type IN ('school', 'independent'));

-- Add public profile fields for booking pages
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS public_slug VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS public_description TEXT,
ADD COLUMN IF NOT EXISTS public_photo_url TEXT,
ADD COLUMN IF NOT EXISTS public_booking_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS public_show_rates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS public_require_payment_upfront BOOLEAN DEFAULT false;

-- Index for public profile lookups
CREATE INDEX IF NOT EXISTS idx_tenants_public_slug ON tenants(public_slug) WHERE public_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_tenant_type ON tenants(tenant_type);

-- =====================================================
-- 2. USER ACCOUNTS (for multi-tenant switching)
-- =====================================================

-- Users table - one person can have multiple tenant accounts
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Authentication
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    
    -- Profile
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    profile_photo_url TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_verification')),
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP,
    
    -- Security
    last_login_at TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User-Tenant Memberships (links users to their tenant accounts)
CREATE TABLE IF NOT EXISTS user_tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Role within this tenant
    role VARCHAR(50) NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'instructor', 'staff', 'viewer')),
    
    -- For instructors: link to their instructor record in this tenant
    instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited', 'declined')),
    invited_at TIMESTAMP,
    accepted_at TIMESTAMP,
    
    -- Preferences
    is_default_tenant BOOLEAN DEFAULT false,
    last_accessed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure unique user-tenant combination
    UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_user ON user_tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_tenant ON user_tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_instructor ON user_tenant_memberships(instructor_id);

CREATE TRIGGER update_user_tenant_memberships_updated_at BEFORE UPDATE ON user_tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. REFERRAL SYSTEM
-- =====================================================

-- Referral Sources (where students come from)
CREATE TABLE IF NOT EXISTS referral_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Source Details
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
        'student',           -- Referred by existing student
        'instructor',        -- Referred by instructor
        'partner_school',    -- Referred by another driving school
        'affiliate',         -- External affiliate partner
        'employee',          -- Staff referral
        'custom'             -- Custom source
    )),
    
    -- For student/instructor referrals
    referring_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    referring_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    
    -- Tracking
    referral_code VARCHAR(50) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    
    -- Stats
    total_referrals INTEGER DEFAULT 0,
    successful_conversions INTEGER DEFAULT 0,
    total_rewards_paid NUMERIC(12,2) DEFAULT 0,
    total_commissions_paid NUMERIC(12,2) DEFAULT 0,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_sources_tenant ON referral_sources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_sources_code ON referral_sources(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_sources_type ON referral_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_referral_sources_referring_student ON referral_sources(referring_student_id);

CREATE TRIGGER update_referral_sources_updated_at BEFORE UPDATE ON referral_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Referral Rewards Configuration
CREATE TABLE IF NOT EXISTS referral_reward_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Reward Type
    reward_type VARCHAR(50) NOT NULL CHECK (reward_type IN (
        'credit',            -- Credit towards lessons (e.g., $20 off)
        'cash',              -- Cash payment
        'free_lesson',       -- Free lesson(s)
        'percentage',        -- Percentage off next purchase
        'commission'         -- Commission on referred student's payments
    )),
    
    -- Who gets the reward
    recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN (
        'referrer',          -- Person who made the referral
        'referee',           -- New student being referred
        'both'               -- Both parties get rewards
    )),
    
    -- Reward Values
    referrer_reward_amount NUMERIC(10,2),           -- Fixed amount for referrer
    referrer_reward_percentage NUMERIC(5,2),        -- Percentage for referrer (commission)
    referee_reward_amount NUMERIC(10,2),            -- Fixed amount for referee (new student)
    referee_reward_percentage NUMERIC(5,2),         -- Percentage discount for referee
    
    -- Commission Details (if reward_type = 'commission')
    commission_duration_months INTEGER,              -- How long commission lasts (null = first purchase only)
    commission_max_amount NUMERIC(10,2),            -- Cap on total commission
    
    -- Conditions
    min_purchase_amount NUMERIC(10,2),              -- Minimum purchase to trigger reward
    max_rewards_per_referrer INTEGER,               -- Limit rewards per referrer
    requires_completion BOOLEAN DEFAULT false,       -- Referee must complete a lesson first
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    valid_from DATE,
    valid_until DATE,
    
    -- Limits
    total_budget NUMERIC(12,2),                     -- Total budget for this reward program
    total_spent NUMERIC(12,2) DEFAULT 0,            -- Amount spent so far
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_reward_configs_tenant ON referral_reward_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_reward_configs_active ON referral_reward_configs(is_active);

CREATE TRIGGER update_referral_reward_configs_updated_at BEFORE UPDATE ON referral_reward_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Referral Tracking (individual referrals)
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Source
    referral_source_id UUID NOT NULL REFERENCES referral_sources(id) ON DELETE CASCADE,
    reward_config_id UUID REFERENCES referral_reward_configs(id) ON DELETE SET NULL,
    
    -- The referred person
    referred_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    referred_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',           -- Referral made, awaiting conversion
        'converted',         -- Lead became a student
        'qualified',         -- Met conditions for reward (e.g., completed first lesson)
        'rewarded',          -- Rewards have been issued
        'expired',           -- Referral expired without conversion
        'cancelled'          -- Referral cancelled
    )),
    
    -- Tracking
    referral_code_used VARCHAR(50),
    referral_date DATE NOT NULL DEFAULT CURRENT_DATE,
    conversion_date DATE,
    qualification_date DATE,
    
    -- Attribution
    first_lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    first_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_tenant ON referrals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_source ON referrals(referral_source_id);
CREATE INDEX IF NOT EXISTS idx_referrals_student ON referrals(referred_student_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Referral Rewards Issued
CREATE TABLE IF NOT EXISTS referral_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    
    -- Recipient
    recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('referrer', 'referee')),
    recipient_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    recipient_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    
    -- Reward Details
    reward_type VARCHAR(50) NOT NULL CHECK (reward_type IN ('credit', 'cash', 'free_lesson', 'percentage', 'commission')),
    amount NUMERIC(10,2) NOT NULL,
    
    -- For credits/discounts
    credit_balance_remaining NUMERIC(10,2),
    expires_at DATE,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',           -- Reward created, not yet usable
        'active',            -- Reward is active and can be used
        'partially_used',    -- Some of the credit has been used
        'fully_used',        -- Credit fully redeemed
        'paid_out',          -- Cash/commission paid out
        'expired',           -- Reward expired
        'cancelled'          -- Reward cancelled
    )),
    
    -- Usage Tracking
    used_in_payment_ids UUID[],
    total_used NUMERIC(10,2) DEFAULT 0,
    
    -- Payout (for cash/commission)
    payout_method VARCHAR(50) CHECK (payout_method IN ('check', 'bank_transfer', 'paypal', 'bsv', 'credit_applied')),
    payout_date DATE,
    payout_reference VARCHAR(255),
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_tenant ON referral_rewards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referral ON referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_recipient_student ON referral_rewards(recipient_student_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);

CREATE TRIGGER update_referral_rewards_updated_at BEFORE UPDATE ON referral_rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Commission Ledger (tracks ongoing commission payments)
CREATE TABLE IF NOT EXISTS commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    
    -- The payment that triggered this commission
    source_payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    
    -- Commission Details
    source_amount NUMERIC(10,2) NOT NULL,           -- Original payment amount
    commission_percentage NUMERIC(5,2) NOT NULL,     -- Percentage earned
    commission_amount NUMERIC(10,2) NOT NULL,        -- Calculated commission
    
    -- Recipient
    recipient_type VARCHAR(50) NOT NULL,
    recipient_student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    recipient_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    
    -- Payout
    paid_in_reward_id UUID REFERENCES referral_rewards(id) ON DELETE SET NULL,
    paid_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_tenant ON commission_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_referral ON commission_ledger(referral_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_payment ON commission_ledger(source_payment_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON commission_ledger(status);

-- =====================================================
-- 4. ADD REFERRAL TRACKING TO STUDENTS
-- =====================================================

-- Add referral source to students table
ALTER TABLE students
ADD COLUMN IF NOT EXISTS referral_source_id UUID REFERENCES referral_sources(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS referral_code_used VARCHAR(50),
ADD COLUMN IF NOT EXISTS referred_by_student_id UUID REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_referral_source ON students(referral_source_id);
CREATE INDEX IF NOT EXISTS idx_students_referred_by ON students(referred_by_student_id);

-- =====================================================
-- 5. INDEPENDENT INSTRUCTOR SPECIFIC SETTINGS
-- =====================================================

-- Add independent-specific fields to tenant_settings
ALTER TABLE tenant_settings
ADD COLUMN IF NOT EXISTS independent_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS accepts_new_students BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS service_area_description TEXT,
ADD COLUMN IF NOT EXISTS service_area_radius_miles INTEGER,
ADD COLUMN IF NOT EXISTS service_zip_codes TEXT[],
ADD COLUMN IF NOT EXISTS specializations TEXT[],
ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT ARRAY['English'],
ADD COLUMN IF NOT EXISTS years_experience INTEGER,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS teaching_philosophy TEXT;

-- =====================================================
-- 6. VIEWS FOR CONVENIENCE
-- =====================================================

-- User's accessible tenants with details
CREATE OR REPLACE VIEW user_accessible_tenants AS
SELECT 
    utm.user_id,
    utm.tenant_id,
    utm.role,
    utm.is_default_tenant,
    utm.last_accessed_at,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    t.tenant_type,
    t.status AS tenant_status,
    t.public_profile_enabled,
    t.public_slug,
    ts.business_name,
    ts.logo_url,
    ts.primary_color
FROM user_tenant_memberships utm
JOIN tenants t ON utm.tenant_id = t.id
LEFT JOIN tenant_settings ts ON t.id = ts.tenant_id
WHERE utm.status = 'active'
AND t.status = 'active';

-- Referral performance summary
CREATE OR REPLACE VIEW referral_performance AS
SELECT 
    rs.id AS referral_source_id,
    rs.tenant_id,
    rs.name AS source_name,
    rs.source_type,
    rs.referral_code,
    rs.total_referrals,
    rs.successful_conversions,
    CASE WHEN rs.total_referrals > 0 
         THEN ROUND((rs.successful_conversions::NUMERIC / rs.total_referrals) * 100, 1)
         ELSE 0 
    END AS conversion_rate,
    rs.total_rewards_paid,
    rs.total_commissions_paid,
    rs.total_rewards_paid + rs.total_commissions_paid AS total_cost,
    s.full_name AS referring_student_name,
    i.full_name AS referring_instructor_name
FROM referral_sources rs
LEFT JOIN students s ON rs.referring_student_id = s.id
LEFT JOIN instructors i ON rs.referring_instructor_id = i.id;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'Migration 020_tenant_types_and_referrals.sql completed';
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'New tables created:';
    RAISE NOTICE '  - users (multi-tenant user accounts)';
    RAISE NOTICE '  - user_tenant_memberships (user-tenant links)';
    RAISE NOTICE '  - referral_sources (where referrals come from)';
    RAISE NOTICE '  - referral_reward_configs (reward programs)';
    RAISE NOTICE '  - referrals (individual referral tracking)';
    RAISE NOTICE '  - referral_rewards (issued rewards)';
    RAISE NOTICE '  - commission_ledger (ongoing commissions)';
    RAISE NOTICE '';
    RAISE NOTICE 'Modified tables:';
    RAISE NOTICE '  - tenants (added tenant_type, public profile fields)';
    RAISE NOTICE '  - students (added referral tracking fields)';
    RAISE NOTICE '  - tenant_settings (added independent instructor fields)';
    RAISE NOTICE '';
    RAISE NOTICE 'New views:';
    RAISE NOTICE '  - user_accessible_tenants';
    RAISE NOTICE '  - referral_performance';
    RAISE NOTICE '=====================================================';
END $$;
