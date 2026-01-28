-- Migration 037: Add wallet_identity_key for BSV wallet authentication
-- Purpose: Enable future BRC-100 wallet-based authentication alongside email/password
-- Reference: docs/BSV_BLOCKCHAIN_REFERENCE.md - Phase 2: Wallet Integration

-- Add wallet_identity_key to users table
-- This allows users to authenticate via BSV wallet instead of/in addition to email/password
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_identity_key TEXT UNIQUE;

-- Index for fast wallet lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet_identity_key ON users(wallet_identity_key) WHERE wallet_identity_key IS NOT NULL;

-- Make password_hash nullable to support wallet-only users
-- Users can auth via: email+password, wallet, or both
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Add constraint: user must have either password_hash or wallet_identity_key
-- This ensures every user can authenticate somehow
ALTER TABLE users ADD CONSTRAINT users_must_have_auth_method
  CHECK (password_hash IS NOT NULL OR wallet_identity_key IS NOT NULL);

COMMENT ON COLUMN users.wallet_identity_key IS 'BSV wallet identity public key for BRC-100 authentication';
