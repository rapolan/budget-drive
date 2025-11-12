/**
 * Migration 005: Budget Drive Protocol (BDP) Treasury
 * Date: November 11, 2025
 * Purpose: Add treasury tracking for satoshi-level transaction fees (Phase 1)
 *
 * CRAIG WRIGHT PHILOSOPHY ALIGNMENT:
 * - Satoshi-based fees (NOT percentage extraction)
 * - Cost-based pricing (reflects computational cost)
 * - Scales at volume (millions of tx = profitable)
 * - No rent-seeking (honest money principle)
 *
 * PATENT NOTE: This implements Claim #2 (Self-Funding Treasury via Satoshi-Level Fees)
 * See: PATENT_DOCUMENTATION.md for full technical disclosure
 */

-- =====================================================
-- TREASURY TRANSACTIONS TABLE
-- =====================================================
-- Tracks all treasury fees (satoshi-level: 5 sats per booking, etc.)
-- Dual-write: PostgreSQL (current) + BSV blockchain (future)
-- Wright-Aligned Model: Cost-based fees, not percentage extraction

CREATE TABLE IF NOT EXISTS treasury_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Source transaction info
    source_type VARCHAR(50) NOT NULL, -- 'lesson_booking', 'lesson_payment', 'tip', etc.
    source_id UUID, -- lesson_id, payment_id, etc.

    -- Amount tracking (USD)
    gross_amount DECIMAL(10, 2) NOT NULL, -- Original transaction amount ($50.00)
    treasury_split DECIMAL(10, 2) NOT NULL, -- Satoshi-level fee in USD (~$0.000002 for 5 sats)
    provider_amount DECIMAL(10, 2) NOT NULL, -- Provider gets nearly full amount ($49.999998)

    -- BSV blockchain tracking
    bsv_txid VARCHAR(64), -- BSV transaction ID (once on-chain)
    bsv_action VARCHAR(20), -- BDP action type: BDP_BOOK, BDP_PAY, BDP_TIP
    bsv_satoshis INTEGER, -- Protocol fee in satoshis (5 for BDP_BOOK, 3 for BDP_PAY, etc.)
    bsv_fee_satoshis INTEGER DEFAULT 5, -- Miner fee (5 sats typical) - separate from protocol fee
    bsv_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'

    -- Metadata
    description TEXT, -- Human-readable description
    metadata JSONB, -- Additional data (student_id, instructor_id, etc.)

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP -- When BSV tx confirmed
);

-- Indexes for performance
CREATE INDEX idx_treasury_tenant ON treasury_transactions (tenant_id);
CREATE INDEX idx_treasury_source ON treasury_transactions (source_type, source_id);
CREATE INDEX idx_treasury_bsv_txid ON treasury_transactions (bsv_txid);
CREATE INDEX idx_treasury_status ON treasury_transactions (bsv_status);
CREATE INDEX idx_treasury_created ON treasury_transactions (created_at DESC);

COMMENT ON TABLE treasury_transactions IS 'BDP Treasury: Satoshi-level fees (cost-based, Wright-aligned) funding protocol operations';
COMMENT ON COLUMN treasury_transactions.treasury_split IS 'Patent Claim #2: Self-funding via satoshi-level transaction fees (~$0.000002)';
COMMENT ON COLUMN treasury_transactions.bsv_action IS 'See PATENT_DOCUMENTATION.md Section: BDP Transaction Format';
COMMENT ON COLUMN treasury_transactions.bsv_satoshis IS 'Wright Model: 5 sats for BDP_BOOK, 3 for BDP_PAY - cost-based, NOT percentage';

-- =====================================================
-- TREASURY BALANCE TABLE
-- =====================================================
-- Aggregate treasury balance per tenant (cached for performance)

CREATE TABLE IF NOT EXISTS treasury_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

    -- Balance tracking (USD)
    total_collected DECIMAL(12, 2) DEFAULT 0.00, -- Lifetime treasury collections
    total_spent DECIMAL(12, 2) DEFAULT 0.00, -- Spent on rewards, fees, etc.
    current_balance DECIMAL(12, 2) DEFAULT 0.00, -- total_collected - total_spent

    -- BSV wallet info
    bsv_wallet_address VARCHAR(64), -- Treasury BSV address
    bsv_wallet_balance_satoshis BIGINT DEFAULT 0, -- Current BSV balance

    -- Stats
    transaction_count INTEGER DEFAULT 0,
    last_transaction_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_treasury_balance_tenant ON treasury_balances (tenant_id);

COMMENT ON TABLE treasury_balances IS 'BDP Treasury: Aggregate balance tracking per tenant';

-- =====================================================
-- TREASURY SPENDING TABLE
-- =====================================================
-- Track how treasury funds are spent (rewards, fees, bounties)

CREATE TABLE IF NOT EXISTS treasury_spending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Spending details
    spend_type VARCHAR(50) NOT NULL, -- 'reward', 'fee', 'bounty', 'refund'
    amount DECIMAL(10, 2) NOT NULL, -- USD amount spent
    recipient_type VARCHAR(50), -- 'student', 'instructor', 'school', 'network'
    recipient_id UUID, -- student_id, instructor_id, etc.

    -- BSV tracking
    bsv_txid VARCHAR(64),
    bsv_satoshis INTEGER,
    bsv_status VARCHAR(20) DEFAULT 'pending',

    -- Context
    description TEXT,
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

CREATE INDEX idx_treasury_spending_tenant ON treasury_spending (tenant_id);
CREATE INDEX idx_treasury_spending_type ON treasury_spending (spend_type);
CREATE INDEX idx_treasury_spending_recipient ON treasury_spending (recipient_type, recipient_id);
CREATE INDEX idx_treasury_spending_created ON treasury_spending (created_at DESC);

COMMENT ON TABLE treasury_spending IS 'BDP Treasury: Track how protocol funds are spent (MNEE rewards, bounties, etc.)';

-- =====================================================
-- BDP ACTIONS LOG
-- =====================================================
-- Comprehensive log of all BDP blockchain actions

CREATE TABLE IF NOT EXISTS bdp_actions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Action details
    action_type VARCHAR(20) NOT NULL, -- BDP_REG, BDP_BOOK, BDP_PROGRESS, BDP_CERT, BDP_AVAIL, BDP_SYNC, BDP_TIP
    action_data TEXT NOT NULL, -- Pipe-delimited payload (e.g., "lesson_id|instructor|slot")

    -- BSV tracking
    bsv_txid VARCHAR(64),
    bsv_fee_satoshis INTEGER DEFAULT 5,
    bsv_status VARCHAR(20) DEFAULT 'pending',

    -- Context
    user_id UUID, -- Who initiated the action
    entity_id UUID, -- Related entity (lesson_id, student_id, etc.)
    entity_type VARCHAR(50), -- 'lesson', 'student', 'instructor', etc.

    -- Metadata
    description TEXT,
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP
);

CREATE INDEX idx_bdp_actions_tenant ON bdp_actions_log (tenant_id);
CREATE INDEX idx_bdp_actions_type ON bdp_actions_log (action_type);
CREATE INDEX idx_bdp_actions_txid ON bdp_actions_log (bsv_txid);
CREATE INDEX idx_bdp_actions_entity ON bdp_actions_log (entity_type, entity_id);
CREATE INDEX idx_bdp_actions_created ON bdp_actions_log (created_at DESC);

COMMENT ON TABLE bdp_actions_log IS 'BDP Protocol: Comprehensive log of all on-chain actions';
COMMENT ON COLUMN bdp_actions_log.action_type IS 'See PATENT_DOCUMENTATION.md: The 7 Core BDP Actions';

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function: Calculate satoshi-based treasury fee (Wright-Aligned)
-- NOTE: This function is deprecated. Use treasuryService.calculateFee() instead
-- for proper satoshi-based fee calculation (5 sats for BDP_BOOK, 3 for BDP_PAY, etc.)
CREATE OR REPLACE FUNCTION calculate_treasury_split(amount DECIMAL)
RETURNS TABLE(treasury DECIMAL, provider DECIMAL) AS $$
BEGIN
    -- DEPRECATED: Old 1% model - replaced by satoshi-level fees
    -- Kept for backward compatibility with existing data
    RETURN QUERY SELECT
        ROUND(amount * 0.01, 2) AS treasury,
        ROUND(amount * 0.99, 2) AS provider;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_treasury_split IS 'DEPRECATED: Old 1% model. Use treasuryService.calculateFee() for Wright-aligned satoshi-level fees';

-- Function: Update treasury balance (called by trigger)
CREATE OR REPLACE FUNCTION update_treasury_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or create treasury balance record
    INSERT INTO treasury_balances (tenant_id, total_collected, transaction_count, last_transaction_at)
    VALUES (
        NEW.tenant_id,
        NEW.treasury_split,
        1,
        NEW.created_at
    )
    ON CONFLICT (tenant_id)
    DO UPDATE SET
        total_collected = treasury_balances.total_collected + NEW.treasury_split,
        current_balance = treasury_balances.current_balance + NEW.treasury_split,
        transaction_count = treasury_balances.transaction_count + 1,
        last_transaction_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update balance on new treasury transaction
CREATE TRIGGER treasury_transaction_balance_update
    AFTER INSERT ON treasury_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_treasury_balance();

COMMENT ON TRIGGER treasury_transaction_balance_update ON treasury_transactions
IS 'Auto-update treasury_balances when new split recorded';

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

-- View: Treasury summary by tenant
CREATE OR REPLACE VIEW treasury_summary AS
SELECT
    t.id AS tenant_id,
    t.name AS company_name,
    tb.current_balance,
    tb.total_collected,
    tb.total_spent,
    tb.transaction_count,
    tb.last_transaction_at,
    tb.bsv_wallet_address,
    tb.bsv_wallet_balance_satoshis,
    (tb.bsv_wallet_balance_satoshis::DECIMAL / 100000000) *
        (SELECT AVG((metadata->>'usd_per_btc')::DECIMAL) FROM treasury_transactions WHERE metadata->>'usd_per_btc' IS NOT NULL)
        AS bsv_balance_usd_estimate
FROM tenants t
LEFT JOIN treasury_balances tb ON t.id = tb.tenant_id;

COMMENT ON VIEW treasury_summary IS 'BDP Treasury: Quick dashboard view of balances';

-- View: Recent treasury activity
CREATE OR REPLACE VIEW treasury_recent_activity AS
SELECT
    tt.created_at,
    tt.tenant_id,
    t.name AS company_name,
    tt.source_type,
    tt.gross_amount,
    tt.treasury_split,
    tt.bsv_action,
    tt.bsv_status,
    tt.description
FROM treasury_transactions tt
JOIN tenants t ON tt.tenant_id = t.id
ORDER BY tt.created_at DESC
LIMIT 100;

COMMENT ON VIEW treasury_recent_activity IS 'BDP Treasury: Last 100 transactions for monitoring';

-- =====================================================
-- SAMPLE DATA (for testing only - remove in production)
-- =====================================================

-- Note: Treasury starts at $0.00 for all tenants
-- First splits will be recorded when lessons are booked in Phase 1

-- =====================================================
-- MIGRATION VERIFICATION
-- =====================================================

-- Verify tables created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'treasury_transactions',
        'treasury_balances',
        'treasury_spending',
        'bdp_actions_log'
    );

    IF table_count = 4 THEN
        RAISE NOTICE 'Migration 005 successful: All 4 treasury tables created';
    ELSE
        RAISE EXCEPTION 'Migration 005 failed: Expected 4 tables, found %', table_count;
    END IF;
END $$;

-- =====================================================
-- END MIGRATION 005
-- =====================================================
