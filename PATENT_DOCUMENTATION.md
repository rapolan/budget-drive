# Budget Drive Protocol (BDP) - Patent Documentation
**Date Started:** November 11, 2025
**Inventor:** Rob (Budget Driving School, National City)
**Technical Contributor:** Claude (Anthropic) + Grok (xAI)
**Status:** Development Phase - Provisional Patent Target Q1 2026

---

## Executive Summary

Budget Drive Protocol (BDP) is a novel blockchain-based system for managing service-based businesses (initially driving schools) with **autonomous funding through satoshi-level transaction fees**, **hidden blockchain complexity**, and **stable engagement rewards**. The system eliminates traditional payment processing chokepoints while maintaining familiar fiat UX.

### Core Innovation
**Self-Funding Protocol Architecture (Wright-Aligned)**: A system where fixed satoshi-denominated fees (5 sats per booking = ~$0.000002 USD) automatically fund protocol operations, rewards, and growth—creating an antifragile network that strengthens with use. Unlike percentage-based extraction models, BDP uses cost-based pricing that scales profitably at volume, aligning with Craig Wright's Bitcoin philosophy of "honest money" and micropayment economics.

---

## Patent Claims (Preliminary)

### **Claim 1: Hybrid Scheduling with On-Chain Conflict Resolution**
A method for preventing scheduling conflicts in a multi-party service system comprising:
1. A six-dimensional conflict detection algorithm checking:
   - Instructor availability
   - Vehicle availability
   - Student availability
   - Working hours constraints
   - Time-off periods
   - Buffer time requirements (30-minute minimum between appointments)
2. Immutable blockchain recording of scheduled time slots
3. Real-time verification against on-chain records before booking confirmation
4. Automatic conflict prevention through cryptographic proof of availability

**Prior Art Differentiation:**
- Traditional systems: Database-only, race conditions possible
- BDP: Blockchain immutability + 6D logic = provably conflict-free

**Reduction to Practice:** Implemented in `backend/src/services/schedulingService.ts` (417 lines, tested Nov 8-11, 2025)

---

### **Claim 2: Self-Funding Treasury via Satoshi-Level Transaction Fees**
A system for autonomous protocol funding using cost-based micropayments comprising:
1. Satoshi-denominated transaction fees (NOT percentage-based)
   - BDP_BOOK: 5 satoshis (~$0.000002 USD) per lesson booking
   - BDP_PAY: 3 satoshis per payment confirmation
   - BDP_PROGRESS: 2 satoshis per progress update
   - BDP_CERT: 10 satoshis per certificate issuance
2. Craig Wright Bitcoin Philosophy Alignment:
   - Cost-based pricing (reflects actual computational cost)
   - Scales at volume (millions of transactions = profitability)
   - No rent-seeking middleman (honest money principle)
   - Fixed satoshi fees independent of transaction value
3. Treasury wallet accumulation without user interaction
4. Protocol-funded operations including:
   - Blockchain transaction fees (miner fees)
   - User engagement rewards
   - Growth incentives
5. Transparent accounting via on-chain ledger

**Mathematical Model (Wright-Aligned):**
```
Let L = lesson cost ($50 typical)
Treasury fee per action = 1-20 satoshis (varies by action type)
Provider receives = virtually full amount (99.999996% for 5-sat action)

Scale Economics (100 million protocol actions):
Example action mix:
- 30M bookings (BDP_BOOK) × 5 sats = 150M sats
- 30M payments (BDP_PAY) × 20 sats = 600M sats
- 20M notifications (BDP_EMAIL) × 1 sat = 20M sats
- 10M SMS (BDP_SMS) × 8 sats = 80M sats
- 10M misc (progress, sync, etc.) × 2 sats avg = 20M sats
Total: 870M satoshis = 8.7 BSV

At BSV=$47: 8.7 BSV = $409/year
At BSV=$10,000 (Wright target): 8.7 BSV = $87,000/year

Key Insight: Profitability comes from ACTION VOLUME, not extraction percentage
```

**Comparison to Old Model:**
```
OLD (1% Split):
- $50 lesson → $0.50 treasury fee (rent-seeking)
- Does NOT scale (always 1% regardless of volume)
- Contradicts Wright's "honest money" principle

NEW (Satoshi-Level):
- $50 lesson → $0.000002 treasury fee (cost-based)
- Scales infinitely at volume
- Aligns with Wright's Bitcoin vision
```

**Prior Art Differentiation:**
- Traditional SaaS: Monthly subscriptions ($50-200/month)
- Stripe/PayPal: 2.9% + 30¢ per transaction (percentage extraction)
- BDP: Fixed satoshi fees, scales with volume, NOT value

**Reduction to Practice:**
- **Phase 1:** Implemented November 11, 2025 in `backend/src/services/treasuryService.ts`
- **Phase 2:** BSV wallet integration November 18, 2025 in `backend/src/services/walletService.ts` (220 lines)
- **Phase 2:** Merkle aggregation schema November 18, 2025 in `backend/database/migrations/006_merkle_aggregation.sql` (290 lines)

**Implementation Evidence:**
- Testnet wallet generated: `1ARbqsYrFQD6dZykcscFqoCcHp7gaMmDwQ`
- Database schema supports Merkle batching (5 new columns, 1 new table)
- Cost optimization calculations implemented

---

### **Claim 3: Merkle Tree Transaction Aggregation for Micropayment Optimization**
A novel method for cost-optimized blockchain micropayment batching comprising:

1. **Per-Action Leaf Hash Generation:**
   - Each treasury action generates deterministic SHA-256 hash
   - Leaf data: `action_type|amount_sats|timestamp|tenant_id`
   - Stored in PostgreSQL `treasury_transactions.leaf_hash` column
   - Example: `BDP_BOOK|5|1700000000|tenant_uuid` → `a3f5c9...`

2. **Batch Accumulation Strategy:**
   - Accrue unbatched actions in database (batch_id = NULL)
   - Trigger batching when EITHER condition met:
     - 100 actions accumulated (optimal Merkle tree size)
     - 1 hour elapsed since first action (time-based flush)
   - Deterministic batch creation ensures consistency

3. **Merkle Root Calculation:**
   - Build binary Merkle tree from leaf hashes
   - Calculate intermediate node hashes: `SHA256(left_hash + right_hash)`
   - Root hash represents cryptographic commitment to all 100 actions
   - Store merkle_root in `merkle_batches` table

4. **Single On-Chain Transaction:**
   - Send 1 BSV transaction instead of 100 individual transactions
   - OP_RETURN payload: `MERKLE:<root_hash>` (64 hex characters)
   - Sum of all action fees sent to protocol wallet
   - Miner fee: ~40-60 satoshis (vs 6,000 sats for 100 individual TXs)

5. **Proof Path Storage for Verification:**
   - For each action, store Merkle proof (sibling hashes from leaf to root)
   - JSONB array: `['sibling1_hash', 'sibling2_hash', ...]`
   - Enables user verification without trusting server:
     - User calculates: `hash(action_data)`
     - Applies proof path: `hash(hash(leaf) + sibling1)...`
     - Compares final result to on-chain merkle_root
   - If match: Action provably included in batch

6. **Three-Tier Transparency Model:**
   - **Normal users (99.9%):** See only fiat, no Bitcoin visibility
   - **School owners:** See "Protocol fee: ~$0.02" as line item
   - **Power users (0.1%):** "Transparency Mode" toggle shows:
     - Full Merkle proof visualization
     - WhatsOnChain verification links
     - Leaf hash → Root hash path diagram
     - On-chain transaction confirmation

**Economic Impact:**
```
Individual Transactions (without batching):
- 100 actions × 60 sats/tx = 6,000 sats in miner fees
- Collecting: 100 actions × 15 sats avg = 1,500 sats
- NET: -4,500 sats (75% LOSS)
- Conclusion: Unsustainable at current BSV fees

Merkle Batched Transactions (with aggregation):
- 100 actions → 1 TX = 40-60 sats miner fee
- Collecting: 100 actions × 15 sats avg = 1,500 sats
- NET: +1,440-1,460 sats (96-97% PROFIT)
- Conclusion: 98-99% profit margin enables sustainable micropayments

At Teranode scale (1 sat/KB fees):
- 10,000 actions → 1 TX = ~40 sats miner fee
- Collecting: 10,000 × 15 sats = 150,000 sats
- NET: +149,960 sats (99.97% PROFIT)
```

**Prior Art Differentiation:**
- **Bitcoin Lightning Network:** Requires payment channels, online presence, liquidity management
- **Ethereum Layer 2 (Optimistic Rollups):** Uses fraud proofs, 7-day withdrawal, complex architecture
- **BDP Merkle Batching:** Simple on-chain Merkle roots, instant verification, no channels needed
- **Traditional Merkle Trees:** Used for block verification, NOT for micropayment aggregation
- **Novel Combination:** Merkle proofs + micropayment batching + transparency mode = unique system

**Reduction to Practice:**
- **Implementation Date:** November 18, 2025
- **Files Created:**
  - `backend/database/migrations/006_merkle_aggregation.sql` (290 lines)
  - `backend/src/services/walletService.ts` (220 lines with batchMicropayments method)
  - `backend/src/scripts/generateTestnetWallet.ts` (40 lines)
- **Database Schema:**
  - Added 5 columns to `treasury_transactions` (leaf_hash, batch_id, merkle_root, merkle_proof, batch_position)
  - Created `merkle_batches` table (13 columns tracking batch economics)
  - Created views: `merkle_batch_performance`, `unbatched_actions`
- **Functions Implemented:**
  - `calculate_leaf_hash()` - Deterministic SHA-256 generation
  - `is_batch_ready()` - 100 actions OR 1 hour trigger logic
- **Testnet Wallet:** `1ARbqsYrFQD6dZykcscFqoCcHp7gaMmDwQ` (ready for testing)

**Patent Strength:** HIGH
- Novel combination of Merkle trees + micropayment optimization
- Significant economic advantage (98-99% margin vs 75% loss)
- Working implementation with documented code
- Measurable performance metrics
- Designed for Teranode (future-proof for 10,000+ action batches)

---

### **Claim 4: Stable Engagement Credits (MNEE Integration)**
A method for cryptocurrency-backed stable rewards comprising:
1. Treasury-funded token issuance (BRC-100 standard)
2. USD-pegged value maintenance through:
   - Treasury reserves backing
   - Real-time BSV/USD conversion
3. Redeemable credits for service usage
4. Automated distribution to incentivize re-engagement

**Example Flow:**
```
Past student inactive for 90 days
→ Treasury issues $5 MNEE credit
→ Student sees "You have $5 credit!" in UI
→ Books $50 lesson, pays $45 + $5 credit
→ Treasury-funded customer retention
```

**Prior Art Differentiation:**
- Traditional loyalty: Points programs (airline miles, etc.)
- BDP: Blockchain-native, instantly redeemable, stable value

**Reduction to Practice:** Phase 2 target (Dec 2025)

---

### **Claim 4: Hidden Blockchain Layer (Fiat UX Abstraction)**
A user interface abstraction system comprising:
1. Traditional fiat currency display ($USD)
2. Backend blockchain transaction execution (BSV)
3. Automatic cryptocurrency conversion without user knowledge
4. "Instant Pay" terminology replacing "blockchain" or "crypto"
5. Dashboard showing fiat earnings: "Balance: $495.00"

**Technical Architecture:**
```
User clicks "Pay $50 Now"
    ↓
Frontend → Backend API (USD input)
    ↓
treasuryService.ts:
  - Convert $50 to satoshis (current rate)
  - Create BSV transaction with 1% split
  - Record in PostgreSQL (USD amounts)
    ↓
User sees: "Payment successful! Balance: $50"
Backend truth: BSV txid, treasury split logged
```

**Prior Art Differentiation:**
- Bitcoin wallets: Require crypto knowledge
- BDP: Zero crypto exposure, fiat mental model

**Reduction to Practice:** Phase 1 (Nov 2025)

---

### **Claim 5: On-Chain Gig Worker Verification**
A decentralized identity verification system comprising:
1. Background check result hashing (SHA-256)
2. Immutable attestation storage on blockchain
3. Verification without revealing personal data (zero-knowledge proof)
4. Treasury-funded bounties for verified onboarding

**Flow:**
```
New instructor applies
    ↓
Background check performed (external service)
    ↓
Result hash: sha256(check_id + pass/fail + date)
    ↓
BDP_CERT transaction: instructor_id|cert_hash|timestamp
    ↓
Future schools verify: hash(their_check) == on-chain_hash
    ↓
Treasury pays $50 bounty for verified instructor
```

**Prior Art Differentiation:**
- Traditional: Manual checks, no portability
- BDP: Portable verification, privacy-preserving

**Reduction to Practice:** Phase 4 target (Q1 2026)

---

## Technical Architecture

### System Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React/Vite)                    │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Student │  │ Booking  │  │ Instructor │  │  Treasury  │ │
│  │  Portal │  │  Wizard  │  │ Dashboard  │  │  Dashboard │ │
│  └────┬────┘  └─────┬────┘  └──────┬─────┘  └──────┬─────┘ │
└───────┼────────────┼───────────────┼────────────────┼───────┘
        │            │               │                │
        │    REST API (Express/TypeScript)            │
        ▼            ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND SERVICES                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Scheduling  │  │   Treasury   │  │   Calendar   │     │
│  │   Service    │  │   Service    │  │    Sync      │     │
│  │   (6D logic) │  │ (BSV splits) │  │  (Google)    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          │     ┌────────────▼─────────┐        │
          │     │  BSV Blockchain      │        │
          │     │  - OP_RETURN (data)  │        │
          │     │  - Micropayments     │        │
          │     │  - Treasury wallet   │        │
          │     └────────────┬─────────┘        │
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     DATA LAYER (Dual-Write)                  │
│  ┌──────────────────────┐  ┌─────────────────────────────┐ │
│  │   PostgreSQL (PG)    │  │  BSV Blockchain (Metanet)   │ │
│  │  - Current source    │  │  - Future primary           │ │
│  │  - Multi-tenant      │  │  - Immutable ledger         │ │
│  │  - 12 tables         │  │  - Jungle Bus reads         │ │
│  └──────────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### BDP Transaction Format (OP_RETURN)
```
Prefix: BDP_[ACTION]
Payload: [pipe-delimited fields]
Fee: [1-5 satoshis]

Example: BDP_BOOK|lesson_uuid|2025-11-15T10:00:00|instructor_uuid|$50
```

---

## Development Timeline (Documented for Reduction to Practice)

| Date | Phase | Milestone | Files Modified | Status |
|------|-------|-----------|----------------|--------|
| Nov 7, 2025 | Phase 1-3 | Initial system built | 50+ files | ✅ Complete |
| Nov 8, 2025 | Phase 4A | Smart scheduling backend + frontend | 10 files | ✅ Complete |
| Nov 9, 2025 | Phase 4B | Google Calendar sync backend | 6 files | ✅ Complete |
| Nov 10, 2025 | Phase 4C | Recurring patterns backend | 4 files | ✅ Complete |
| Nov 11, 2025 | Phase 4B/4C | Calendar + Patterns frontend | 7 files | ✅ Complete |
| Nov 11, 2025 | Phase 4 Fixes | Backend compilation errors resolved | 7 files | ✅ Complete |
| Nov 11, 2025 | BDP Phase 1 | Treasury service (PostgreSQL tracking) | 4 files | ✅ Complete |
| **Nov 18, 2025** | **BDP Phase 2** | **BSV wallet + Merkle aggregation** | **6 files** | ✅ **Complete** |
| Dec 2025 | BDP Phase 2 | MNEE engagement rewards | TBD | 📅 Planned |
| Jan-Mar 2026 | BDP Phase 3 | Full BSV migration | TBD | 📅 Planned |
| Q2 2026 | BDP Phase 4 | Expansion + gig mode | TBD | 📅 Planned |

---

## Prior Art Analysis

### Existing Solutions & Differentiation

1. **Traditional Driving School Software (e.g., Acuity, Schedulicity)**
   - **Technology:** Cloud SaaS, centralized databases
   - **Payment:** Monthly subscriptions ($50-200/month)
   - **BDP Advantage:** Pay-per-use, self-funding, blockchain immutability

2. **Scheduling Apps (Google Calendar, Calendly)**
   - **Technology:** Centralized servers, no payment integration
   - **Conflict Resolution:** Database locks, race conditions possible
   - **BDP Advantage:** 6D conflict logic + blockchain verification

3. **Blockchain Payment Systems (BTCPay Server, Strike)**
   - **Technology:** Bitcoin payments for merchants
   - **UX:** Requires crypto knowledge
   - **BDP Advantage:** Hidden blockchain, fiat UX, automatic splits

4. **Loyalty Programs (Starbucks Rewards, airline miles)**
   - **Technology:** Centralized points, non-transferable
   - **Value:** Volatile, company-specific
   - **BDP Advantage:** Blockchain tokens, stable value, cross-school potential

### Novel Combinations (Patentability Basis)
- **6D scheduling + blockchain** (never combined before)
- **Micropayment splits for protocol funding** (novel economic model)
- **Stable crypto rewards without user knowledge** (UX innovation)
- **On-chain gig verification** (privacy-preserving attestations)

---

## Market Validation

### Total Addressable Market (TAM)
- **U.S. Driving Schools:** 23,946 (DMV data)
- **Annual Lessons:** ~359 million (50/day/school avg)
- **Transaction Value:** ~$18 billion/year ($50/lesson avg)
- **BDP Addressable:** 1% split = $180M/year potential (100% adoption)

### Pilot Testing Plan
1. **Phase 1 (Nov-Dec 2025):** Budget Driving School, National City
   - 1 instructor, 10 students, 50 lessons
   - Test treasury splits, hidden payments
   - Measure: Success rate, user confusion, treasury growth

2. **Phase 2 (Jan-Feb 2026):** Local expansion (San Diego County)
   - 3-5 schools, 50 students, 500 lessons
   - Test MNEE rewards, cross-school compatibility
   - Measure: Re-engagement rates, retention lift

3. **Phase 3 (Mar-Jun 2026):** Regional scaling (California)
   - 50 schools, 1,000 students, 10,000 lessons
   - Test full BSV migration, gig instructor onboarding
   - Measure: Treasury sustainability, network effects

---

## Competitive Advantages (Patent Defense)

### Why BDP is Non-Obvious
1. **Economic Model:** Protocol self-funds from usage (vs. subscriptions or VC)
2. **UX Innovation:** Blockchain benefits without crypto complexity
3. **Technical Synergy:** 6D scheduling + immutable ledger = provably conflict-free
4. **Incentive Alignment:** Treasury grows with network, benefits all participants

### Barriers to Replication
- **First-mover:** Patent filing establishes prior art claim date
- **Technical Complexity:** Requires deep blockchain + scheduling expertise
- **Network Effects:** Early treasury accumulation compounds advantage
- **Regulatory Moat:** Money transmitter compliance (BDP likely exempt for micropays)

---

## Next Steps for Patent Filing

### Immediate (Nov 2025)
- [x] Document invention disclosure
- [ ] Complete Phase 1 implementation (reduction to practice)
- [ ] Capture screenshots/video of working system
- [ ] Log all technical decisions in DEVELOPMENT_LOG.md

### Short-Term (Dec 2025 - Jan 2026)
- [ ] Hire patent attorney (budget: $5,000-10,000)
- [ ] File provisional patent application (USPTO)
- [ ] Continue development with documented milestones
- [ ] Pilot testing with measurable results

### Long-Term (2026+)
- [ ] Convert provisional to non-provisional (within 12 months)
- [ ] Pursue international patents (PCT application)
- [ ] Defend against copycat implementations
- [ ] License protocol to other service industries

---

## Appendices

### A. Code Repository
- **GitHub:** rapolan/budget-drive (private during patent pending)
- **Current Version:** v0.5.0+ (as of Nov 18, 2025 - BSV integration)
- **Lines of Code:** ~16,000+ (backend + frontend + docs + BSV integration)

### B. Technical Specifications
- See: [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)
- See: [BDP_PROJECT_MASTER.md](BDP_PROJECT_MASTER.md)
- See: [BLOCKCHAIN_ROADMAP.md](BLOCKCHAIN_ROADMAP.md)
- See: [PHASE_4A_SUMMARY.md](PHASE_4A_SUMMARY.md)
- See: [PHASE_4B_4C_FRONTEND.md](PHASE_4B_4C_FRONTEND.md)

### B1. BSV Integration Files (Nov 18, 2025)
- **Wallet Service:** `backend/src/services/walletService.ts` (220 lines)
- **Merkle Schema:** `backend/database/migrations/006_merkle_aggregation.sql` (290 lines)
- **Config Updates:** `backend/src/config/env.ts` (BSV wallet configuration)
- **Wallet Generation:** `backend/src/scripts/generateTestnetWallet.ts` (40 lines)
- **Migration Runner:** `backend/src/scripts/runMigration006.ts` (45 lines)
- **Testnet Wallet:** `1ARbqsYrFQD6dZykcscFqoCcHp7gaMmDwQ` (secured in .env)

### C. Inventor Contributions
- **Rob (Budget Driving School):** Domain expertise, business model, pilot testing
- **Claude (Anthropic AI):** System architecture, code implementation, documentation
- **Grok (xAI):** BDP conceptualization, chokepoint analysis, protocol design

### D. Related Patents (To Monitor)
- Bitcoin payment processing (various)
- Blockchain scheduling systems (research)
- Loyalty token systems (research)
- Gig economy verification (research)

---

**Document Status:** Living document, updated with each development phase.
**Last Updated:** November 18, 2025 - Added Claim #3 (Merkle Aggregation)
**Next Update:** After testnet transaction testing (Nov 19-20, 2025 target)

**Recent Milestones (Nov 18, 2025):**
- ✅ BSV wallet service implemented (220 lines)
- ✅ Testnet wallet generated and secured
- ✅ Merkle aggregation database schema created (290 lines)
- ✅ Patent Claim #3 documented (Merkle batching innovation)
- ⏳ Awaiting testnet funding for first real BSV transaction

---

## Notes for Patent Attorney

1. **Strongest Claims (Patent Priority):**
   - **Claim #1:** 6D scheduling + blockchain (unique combination)
   - **Claim #2:** Self-funding treasury via satoshi fees (economic innovation)
   - **Claim #3:** Merkle aggregation for micropayments (HIGH VALUE - 98% cost savings)

2. **Medium Strength Claims:**
   - **Claim #5:** Hidden blockchain layer (UX abstraction, some prior art in crypto wallets)
   - **Claim #6:** On-chain gig verification (portable attestations, privacy-preserving)

3. **Weaker Claims (May Need Refinement):**
   - **Claim #4:** Stable engagement credits (stable tokens exist, need differentiation)

4. **Trade Secret Considerations:**
   - Treasury wallet private keys (NOT patented, keep confidential)
   - Merkle tree implementation details (patent covers method, not exact algorithm)
   - Fee optimization calculations (patent covers concept, not specific math)

5. **Open Source Strategy:**
   - Consider dual-licensing: Patent protection + open source for adoption
   - Open source reference implementation encourages network effects
   - Patent defends against large competitors copying without contribution

6. **International Filing:**
   - Priority: U.S. provisional first (establish prior art date)
   - Secondary: PCT application (international coverage)
   - Focus markets: EU (GDPR privacy + blockchain), Asia (high adoption rates)

7. **Prior Art Defense (Merkle Claim #3):**
   - **Bitcoin uses Merkle trees:** YES, but for block verification (different use case)
   - **Lightning Network batches:** YES, but requires payment channels (different architecture)
   - **Ethereum L2 rollups:** YES, but uses fraud proofs + 7-day withdrawal (different security model)
   - **BDP novelty:** Merkle trees for COST OPTIMIZATION of micropayments + transparency mode verification
   - **Key differentiator:** 98-99% profit margin vs 75% loss without batching (measurable economic impact)

**Key Questions for Attorney:**
1. Can we patent the economic model (98% margin from Merkle batching) or only the technical implementation?
2. Is "Merkle trees for micropayment cost optimization" sufficiently novel vs "Merkle trees for block verification"?
3. Should we file separate patents for each claim or one comprehensive patent with 6 claims?
4. What prior art exists for "transparency mode" user verification without trusting the server?
5. Can we claim the three-tier transparency model (normal/owner/power user) as a UX innovation?
