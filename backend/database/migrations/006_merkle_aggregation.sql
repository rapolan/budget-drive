/**
 * Migration 006: Merkle Aggregation for BSV Optimization
 * Date: November 18, 2025
 * Purpose: Add Merkle tree batching fields for cost-optimized on-chain transactions
 *
 * GROK'S VISION ALIGNMENT:
 * - Batch 100 actions into single on-chain TX (40-60 sats miner fee vs 1,500-3,000 sats collected)
 * - 98-99% profit margin on micropayments
 * - Merkle root stored in OP_RETURN for proof verification
 * - Per-action leaf hash for transparency mode
 * - Designed for Teranode scale (10,000+ actions per batch)
 *
 * COST OPTIMIZATION:
 * Individual TX: 100 actions × 60 sats/tx = 6,000 sats in fees (collecting 1,500 sats)
 * Batched TX:   100 actions → 1 TX = 40-60 sats in fees (collecting 1,500 sats)
 * Savings:      99% reduction in miner fees, 98% profit margin
 */

-- =====================================================
-- ALTER treasury_transactions FOR MERKLE SUPPORT
-- =====================================================

-- Add leaf_hash for Merkle tree construction
ALTER TABLE treasury_transactions
ADD COLUMN IF NOT EXISTS leaf_hash VARCHAR(64);

COMMENT ON COLUMN treasury_transactions.leaf_hash IS
'SHA256 hash of this action (SHA256(action_type + amount + timestamp + tenant_id)) - used as Merkle tree leaf';

-- Add batch tracking
ALTER TABLE treasury_transactions
ADD COLUMN IF NOT EXISTS batch_id UUID;

COMMENT ON COLUMN treasury_transactions.batch_id IS
'Groups actions into batches of ~100 for on-chain aggregation. NULL until batched.';

-- Add merkle_root for proof verification
ALTER TABLE treasury_transactions
ADD COLUMN IF NOT EXISTS merkle_root VARCHAR(64);

COMMENT ON COLUMN treasury_transactions.merkle_root IS
'Merkle root stored in on-chain OP_RETURN. Same for all actions in batch. Used for proof verification.';

-- Add merkle_proof for transparency mode
ALTER TABLE treasury_transactions
ADD COLUMN IF NOT EXISTS merkle_proof JSONB;

COMMENT ON COLUMN treasury_transactions.merkle_proof IS
'Merkle proof path for this action: [sibling1_hash, sibling2_hash, ...]. Allows verification without trusting server.';

-- Add batch_position for ordering
ALTER TABLE treasury_transactions
ADD COLUMN IF NOT EXISTS batch_position INTEGER;

COMMENT ON COLUMN treasury_transactions.batch_position IS
'Position in batch (0-99). Used to reconstruct Merkle tree from leaves.';

-- Index for batch queries
CREATE INDEX IF NOT EXISTS idx_treasury_batch_id ON treasury_transactions (batch_id);
CREATE INDEX IF NOT EXISTS idx_treasury_batch_status ON treasury_transactions (batch_id, bsv_status) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treasury_leaf_hash ON treasury_transactions (leaf_hash);

-- =====================================================
-- MERKLE BATCHES TABLE
-- =====================================================
-- Tracks batched on-chain transactions

CREATE TABLE IF NOT EXISTS merkle_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Batch info
    action_count INTEGER NOT NULL, -- How many actions in this batch (typically 100)
    total_satoshis INTEGER NOT NULL, -- Sum of all action fees (e.g., 5+8+20+... = ~1,500)

    -- Merkle tree
    merkle_root VARCHAR(64) NOT NULL, -- Root hash stored in OP_RETURN
    merkle_leaves TEXT[], -- Array of leaf hashes (for reconstruction)

    -- On-chain transaction
    bsv_txid VARCHAR(64), -- Transaction ID on BSV blockchain
    bsv_miner_fee_satoshis INTEGER, -- Actual miner fee paid (~40-60 sats)
    bsv_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'broadcasted', 'confirmed', 'failed'

    -- Economics
    gross_collected_satoshis INTEGER, -- Total collected (sum of action fees)
    net_profit_satoshis INTEGER, -- gross_collected - miner_fee (should be ~98-99%)
    profit_margin_percent DECIMAL(5, 2), -- ((net / gross) * 100) - should be ~98-99%

    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When batch created
    broadcasted_at TIMESTAMP, -- When sent to network
    confirmed_at TIMESTAMP, -- When confirmed on-chain

    -- Metadata
    metadata JSONB -- Additional data (block_height, confirmation_count, etc.)
);

CREATE INDEX idx_merkle_batches_tenant ON merkle_batches (tenant_id);
CREATE INDEX idx_merkle_batches_status ON merkle_batches (bsv_status);
CREATE INDEX idx_merkle_batches_txid ON merkle_batches (bsv_txid);
CREATE INDEX idx_merkle_batches_created ON merkle_batches (created_at DESC);

COMMENT ON TABLE merkle_batches IS 'Merkle-aggregated batches of BDP actions for cost-optimized on-chain storage';
COMMENT ON COLUMN merkle_batches.merkle_root IS 'Stored in OP_RETURN: OP_FALSE OP_RETURN <MERKLE:root_hash>';
COMMENT ON COLUMN merkle_batches.profit_margin_percent IS 'Target: 98-99% (collecting 1,500 sats, spending 40-60 sats)';

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function: Calculate leaf hash for Merkle tree
CREATE OR REPLACE FUNCTION calculate_leaf_hash(
    p_action_type VARCHAR,
    p_amount_sats INTEGER,
    p_timestamp TIMESTAMP,
    p_tenant_id UUID
)
RETURNS VARCHAR(64) AS $$
DECLARE
    leaf_data TEXT;
BEGIN
    -- Concatenate fields in deterministic order
    leaf_data := p_action_type || '|' ||
                 p_amount_sats::TEXT || '|' ||
                 EXTRACT(EPOCH FROM p_timestamp)::BIGINT::TEXT || '|' ||
                 p_tenant_id::TEXT;

    -- Return SHA256 hash (PostgreSQL extension required)
    -- Note: In production, this calculation should happen in Node.js
    -- using crypto.createHash('sha256') for consistency with BSV SDK
    RETURN encode(digest(leaf_data, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_leaf_hash IS
'Calculates SHA256 leaf hash for Merkle tree. Production: Use Node.js crypto for BSV compatibility.';

-- Function: Check if batch is ready to broadcast
CREATE OR REPLACE FUNCTION is_batch_ready(p_batch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    batch_count INTEGER;
BEGIN
    SELECT action_count INTO batch_count
    FROM merkle_batches
    WHERE id = p_batch_id;

    -- Batch is ready when we have 100 actions OR 1 hour has passed since first action
    RETURN batch_count >= 100 OR
           (SELECT created_at < NOW() - INTERVAL '1 hour'
            FROM merkle_batches
            WHERE id = p_batch_id);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_batch_ready IS
'Returns true if batch has 100 actions OR is 1+ hour old (whichever comes first)';

-- =====================================================
-- VIEWS FOR MONITORING
-- =====================================================

-- View: Batch performance metrics
CREATE OR REPLACE VIEW merkle_batch_performance AS
SELECT
    mb.id AS batch_id,
    mb.created_at,
    mb.broadcasted_at,
    mb.confirmed_at,
    mb.action_count,
    mb.gross_collected_satoshis,
    mb.bsv_miner_fee_satoshis,
    mb.net_profit_satoshis,
    mb.profit_margin_percent,
    mb.bsv_status,
    mb.bsv_txid,
    -- Calculate time to broadcast
    EXTRACT(EPOCH FROM (mb.broadcasted_at - mb.created_at))::INTEGER AS seconds_to_broadcast,
    -- Calculate time to confirm
    EXTRACT(EPOCH FROM (mb.confirmed_at - mb.broadcasted_at))::INTEGER AS seconds_to_confirm,
    -- USD value (assuming BSV = $47)
    (mb.net_profit_satoshis::DECIMAL / 100000000) * 47 AS profit_usd_estimate
FROM merkle_batches mb
WHERE mb.bsv_status IN ('confirmed', 'broadcasted')
ORDER BY mb.created_at DESC;

COMMENT ON VIEW merkle_batch_performance IS
'Merkle batch economics: profit margins, timing, USD estimates';

-- View: Unbatched actions (ready for next batch)
CREATE OR REPLACE VIEW unbatched_actions AS
SELECT
    tt.id,
    tt.tenant_id,
    tt.bsv_action,
    tt.bsv_satoshis,
    tt.created_at,
    tt.leaf_hash,
    EXTRACT(EPOCH FROM (NOW() - tt.created_at))::INTEGER AS seconds_waiting
FROM treasury_transactions tt
WHERE tt.batch_id IS NULL
  AND tt.bsv_status = 'pending'
  AND tt.leaf_hash IS NOT NULL
ORDER BY tt.created_at ASC;

COMMENT ON VIEW unbatched_actions IS
'Actions waiting to be included in next Merkle batch';

-- =====================================================
-- MIGRATION VERIFICATION
-- =====================================================

DO $$
DECLARE
    column_count INTEGER;
    table_exists BOOLEAN;
BEGIN
    -- Check new columns added to treasury_transactions
    SELECT COUNT(*) INTO column_count
    FROM information_schema.columns
    WHERE table_name = 'treasury_transactions'
    AND column_name IN (
        'leaf_hash',
        'batch_id',
        'merkle_root',
        'merkle_proof',
        'batch_position'
    );

    -- Check merkle_batches table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'merkle_batches'
    ) INTO table_exists;

    IF column_count = 5 AND table_exists THEN
        RAISE NOTICE 'Migration 006 successful: Merkle aggregation schema ready';
        RAISE NOTICE '  - Added 5 columns to treasury_transactions';
        RAISE NOTICE '  - Created merkle_batches table';
        RAISE NOTICE '  - Cost optimization enabled: 98-99%% profit margin';
    ELSE
        RAISE EXCEPTION 'Migration 006 failed: columns=%, table=%', column_count, table_exists;
    END IF;
END $$;

-- =====================================================
-- USAGE NOTES
-- =====================================================

/*
PHASE 1 (Current): Simple BSV Transactions
- Create treasury_transaction record for each action
- Send individual BSV TX for each action (slower, higher cost)
- Populate bsv_txid and bsv_status

PHASE 2 (Merkle Optimization): Batched Transactions
1. Accrue actions in treasury_transactions (batch_id = NULL)
2. Calculate leaf_hash for each action using calculate_leaf_hash()
3. When 100 actions reached OR 1 hour passed:
   a. Create merkle_batches record
   b. Build Merkle tree from leaf hashes
   c. Store merkle_root in batches table
   d. Send single BSV TX with merkle_root in OP_RETURN
   e. Update all actions: set batch_id, merkle_root, merkle_proof
4. For verification:
   - User requests proof for action_id
   - Return merkle_proof array + merkle_root
   - User verifies: hash(action) + proof = root
   - User checks WhatsOnChain for root in bsv_txid

COST COMPARISON:
Individual:  100 actions × 60 sats = 6,000 sats fees (LOSS if collecting <6,000 sats)
Batched:     100 actions → 1 TX   = 40-60 sats fees (PROFIT 98-99%)

TRANSPARENCY MODE:
- Normal users: See only fiat, Bitcoin invisible
- School owners: See "Protocol fee: ~$0.02" line item
- Power users: Click "Verify" → see Merkle proof, verify on WhatsOnChain

TERANODE SCALING:
- At 1 sat/KB fees: Can batch 10,000+ actions per TX
- Profit margin increases to 99.9%+
- Global scale: millions of actions/day
*/

-- =====================================================
-- END MIGRATION 006
-- =====================================================
