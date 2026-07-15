-- =====================================================
-- BUDGET DRIVING SCHOOL
-- Migration 004: team management roles, statuses, invite tokens
-- =====================================================
-- Description: user_tenant_memberships.role only allowed
--              'admin' | 'instructor' | 'staff' | 'student', but the
--              team-management feature needs an 'owner' role (for
--              last-owner protection and role-assignment rules) and
--              a 'viewer' role, matching the TypeScript UserRole type.
--              status only allowed 'active' | 'inactive' | 'pending' |
--              'invited', but the application code uses 'suspended'
--              and 'declined' instead of 'inactive'/'pending'.
--
--              Also adds invite_token / invite_token_expires_at so
--              invited members have a way to accept their invite
--              (see inviteUserToTenant / acceptInvite).
--
-- Safe to re-run: constraints are dropped and recreated, columns use
-- IF NOT EXISTS.
-- =====================================================

ALTER TABLE user_tenant_memberships
    DROP CONSTRAINT IF EXISTS user_tenant_memberships_role_check;

ALTER TABLE user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_role_check
    CHECK (role IN ('owner', 'admin', 'instructor', 'staff', 'viewer'));

ALTER TABLE user_tenant_memberships
    DROP CONSTRAINT IF EXISTS user_tenant_memberships_status_check;

ALTER TABLE user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_status_check
    CHECK (status IN ('active', 'invited', 'suspended', 'declined'));

ALTER TABLE user_tenant_memberships
    ADD COLUMN IF NOT EXISTS invite_token_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_invite_token
    ON user_tenant_memberships(invite_token_hash)
    WHERE invite_token_hash IS NOT NULL;

DO $$
BEGIN
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Migration 004 complete: user_tenant_memberships';
    RAISE NOTICE 'role now allows owner/admin/instructor/staff/viewer';
    RAISE NOTICE 'status now allows active/invited/suspended/declined';
    RAISE NOTICE 'invite_token_hash + invite_token_expires_at added';
    RAISE NOTICE '==============================================';
END $$;
