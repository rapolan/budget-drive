# BSV Blockchain Integration Reference

**Created:** January 2026
**Purpose:** Comprehensive reference for BSV blockchain concepts and integration plans for Budget Drive Protocol

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [BRC Standards Reference](#brc-standards-reference)
3. [Architecture Components](#architecture-components)
4. [Integration Roadmap](#integration-roadmap)
5. [Implementation Details](#implementation-details)
6. [Resources & Links](#resources--links)

---

## Core Concepts

### What is the Metanet?

The Metanet is Project Babbage's vision for a "secure, value-aware upgrade path for today's Web":

- **Every packet can be signed** - Cryptographic proof of authenticity
- **Every action can move money** - Micropayments in satoshis (fractions of a cent)
- **Every user controls a provable identity** - Anchored to Bitcoin SV

### UTXO Model

BSV uses **Unspent Transaction Outputs** (UTXOs), different from Ethereum's account model:

> "A UTXO is like an envelope to hold tokens. Once opened, it cannot be reused. Tokens move from one envelope to another."

**Key characteristics:**
- Each payment creates new UTXOs
- UTXOs can only be spent once
- Wallets manage collections of UTXOs ("baskets")
- No account balances - just collections of spendable outputs

### SPV (Simplified Payment Verification)

Instead of running a full node, applications use SPV to:
- Validate transactions using Merkle proofs
- Verify inclusion in blocks without downloading entire blockchain
- Scale efficiently for high transaction volumes

---

## BRC Standards Reference

### Critical Standards for Budget Drive Protocol

| BRC | Name | Purpose | Priority |
|-----|------|---------|----------|
| **BRC-100** | Wallet-to-Application Interface | Standard API for app↔wallet communication | **HIGH** |
| **BRC-52** | Certificates | Identity verification without exposing PII | **HIGH** |
| **BRC-62** | BEEF Transactions | Efficient transaction format with SPV proofs | **MEDIUM** |
| **BRC-64** | Transaction History Tracking | How overlays track transaction history | **MEDIUM** |
| **BRC-65** | Transaction Labels | Organizing/categorizing transactions | **LOW** |

### BRC-100: Wallet-to-Application Interface (Deep Dive)

This is the **primary standard** we'll use. It defines:

**What it provides:**
- Vendor-neutral API (works with any BRC-100 wallet)
- Key management (wallet handles cryptography)
- Transaction signing (app doesn't touch private keys)
- Payment orchestration (request payments from users)
- Certificate handling (identity verification)

**Core integrations within BRC-100:**
- BRC-2: Encryption
- BRC-3: Signatures
- BRC-29: Payment key derivation
- BRC-43: Security/protocol elements
- BRC-44: Internal protocols
- BRC-45: UTXOs as tokens
- BRC-52: Certificates (identity)
- BRC-56: HMACs
- BRC-62: BEEF transactions
- BRC-67: SPV

**Technical specifications:**
- Blockchain: BSV
- Elliptic Curve: secp256k1
- Public Keys: Compressed, DER-formatted
- Key Derivation: BKDS (BSV-specific key derivation scheme)

### BRC-52: Certificates

Enables identity verification without exposing sensitive data:
- User proves identity through cryptographic certificates
- No need to share email, phone, or other PII with servers
- Certificates can have different trust levels
- Revocable and time-limited

### BRC-64/65: Overlay Network Standards

**BRC-64 - Transaction History Tracking:**
- How overlay networks maintain transaction records
- Enables distributed synchronization across participants

**BRC-65 - Transaction Labels:**
- Mechanisms for wallets to organize transactions
- List-based actions for transaction management

### Other Relevant Standards

| BRC | Name | Purpose |
|-----|------|---------|
| BRC-1 | Transaction Creation | How to create valid transactions |
| BRC-22/24 | Overlay Sync | Data synchronization between overlay nodes |
| BRC-27 | Direct Payment Protocol | Peer-to-peer payment requests |
| BRC-28 | Paymail | Human-readable payment destinations |
| BRC-31 | Authrite | Mutual authentication protocol |
| BRC-42/43/44 | Key Derivation | BSV key derivation schemes |
| BRC-75 | Mnemonic Keys | Master private key from seed phrase |
| BRC-77/78 | Message Signatures | Signed/encrypted portable messages |

---

## Architecture Components

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   Budget Drive Protocol                    │
│                    (Your Application)                      │
├────────────────────────────────────────────────────────────┤
│                    BRC-100 Interface                       │
│              (Wallet Communication Layer)                  │
├────────────────────────────────────────────────────────────┤
│                 Overlay Services Engine                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Topic Manager │  │Topic Manager │  │Topic Manager │      │
│  │  (Payments)  │  │  (Identity)  │  │  (Lessons)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │Lookup Service│  │Lookup Service│  (Query Layer)         │
│  │  (Payments)  │  │  (Students)  │                        │
│  └──────────────┘  └──────────────┘                        │
├────────────────────────────────────────────────────────────┤
│              BSV Blockchain (via SPV)                      │
└────────────────────────────────────────────────────────────┘
```

### Overlay Services Engine

The engine enables "dynamic tracking and management of UTXO-based systems on top of the BSV blockchain."

**Core Components:**

1. **Topic Managers** - Gatekeepers that decide which UTXOs to track
   - Define what data qualifies for inclusion
   - Filter incoming transactions
   - Each manager handles a specific use case

2. **Lookup Services** - Query engines for specific data types
   - Respond to different query patterns
   - Maintain optimized storage for their use case
   - Custom logic per service

3. **Storage Engine** - Global UTXO storage layer
   - Maintains transactions, UTXOs, headers, Merkle paths
   - Metadata storage

4. **Additional Components:**
   - Web API - HTTP endpoints for submission/lookup
   - Validator - SPV validation + business rules
   - Listener - Header announcements, alerts
   - Synchronizer - State sync between nodes
   - Path Confirmer - Merkle proof requests

### Overlay Processing Flow

```
Transaction Submitted
        ↓
   Topic Manager
   (Filter/Validate)
        ↓
   SPV Validation
        ↓
   Storage Engine
   (Persist UTXO)
        ↓
   BSV Node Network
   (Broadcast)
        ↓
   Merkle Path
   (Confirmation)
```

### Wallet Architecture

**Metanet Desktop** - Reference implementation wallet:
- Cross-platform application
- Exposes JSON API on TCP port 3321
- Handles signing, payment, encryption

**Key concepts:**
- Identity key per wallet (unique, provable)
- ProtoMap - Protocol metadata registry
- CertMap - Certificate schema registry
- Consent dialogs for data access transparency

---

## Integration Roadmap

### Phase 1: Foundation (Current MVP Focus)
**Goal:** Working app without blockchain (traditional backend)

- [x] PostgreSQL database
- [x] REST API with Express
- [x] React frontend
- [x] Multi-tenant architecture
- [ ] Authentication (JWT)
- [ ] Core workflows (lessons, payments, scheduling)

### Phase 2: Wallet Integration
**Goal:** Connect to BRC-100 wallets

**Tasks:**
- [ ] Install `@bsv/sdk` package
- [ ] Install `@bsv/auth-express-middleware`
- [ ] Create wallet connection UI
- [ ] Implement BRC-100 authentication flow
- [ ] Replace/augment JWT auth with wallet-based auth

**User flow:**
1. User has Metanet Desktop wallet installed
2. App requests connection via BRC-100
3. Wallet shows consent dialog
4. User approves → authenticated session

### Phase 3: Payment Processing
**Goal:** Accept BSV payments for lessons

**Tasks:**
- [ ] Create payment request flow
- [ ] Implement lesson payment via wallet
- [ ] Track payment UTXOs
- [ ] Handle payment confirmations
- [ ] Create payment receipts (on-chain proof)

**Payment flow:**
1. Student books lesson ($150)
2. App creates payment request via BRC-100
3. Student's wallet shows payment dialog
4. Student confirms → transaction broadcast
5. App receives payment notification
6. Lesson marked as paid (with TXID)

### Phase 4: Overlay Services
**Goal:** Custom overlays for driving school data

**Potential Topic Managers:**
- `PaymentTopicManager` - Track lesson payments
- `LessonTopicManager` - Track completed lessons on-chain
- `CertificateTopicManager` - Student completion certificates

**Potential Lookup Services:**
- `PaymentLookupService` - Query payment history
- `StudentProgressLookupService` - Query training records
- `InstructorEarningsLookupService` - Query instructor payouts

### Phase 5: Identity & Certificates
**Goal:** Verified identities without PII exposure

**Tasks:**
- [ ] Implement BRC-52 certificate verification
- [ ] Create student identity certificates
- [ ] Create instructor credential certificates
- [ ] Issue completion certificates (on-chain)

**Certificate types:**
- Student enrollment certificate
- Instructor qualification certificate
- Course completion certificate
- Road test readiness certificate

---

## Implementation Details

### Development Environment

**Tools:**
- **LARS** - Local development environment for overlays
- **CARS** - Cloud deployment for production
- **Stageline** - BSV testnet for development

**NPM Packages:**
```json
{
  "@bsv/sdk": "BSV TypeScript SDK",
  "@bsv/overlay": "Overlay Services Engine",
  "@bsv/auth-express-middleware": "Express auth middleware",
  "hello-services": "Example topic/lookup services"
}
```

### Example: Basic Wallet Connection

```typescript
// Future implementation reference
import { Wallet } from '@bsv/sdk';

// Check if wallet is available
const wallet = await Wallet.connect({
  network: 'stageline', // testnet for development
});

// Get user's identity
const identity = await wallet.getIdentity();

// Request payment
const payment = await wallet.requestPayment({
  amount: 5000, // satoshis
  description: 'Driving Lesson - 2 hours',
  outputs: [
    { to: instructorAddress, amount: 4500 },
    { to: schoolAddress, amount: 500 },
  ],
});
```

### Example: Overlay Service Setup

```typescript
// Future implementation reference
import { Engine } from '@bsv/overlay';
import { PaymentTopicManager } from './topics/PaymentTopicManager';
import { PaymentLookupService } from './lookups/PaymentLookupService';

const engine = new Engine(
  { payments: new PaymentTopicManager() },
  { payments: new PaymentLookupService() },
  storageEngine
);

// HTTP endpoints
app.post('/submit', engine.submit);
app.get('/lookup', engine.lookup);
```

### Database Schema Considerations

When integrating BSV, add these fields:

```sql
-- Students table additions
ALTER TABLE students ADD COLUMN wallet_identity_key TEXT;
ALTER TABLE students ADD COLUMN identity_certificate_txid TEXT;

-- Lessons table additions
ALTER TABLE lessons ADD COLUMN payment_txid TEXT;
ALTER TABLE lessons ADD COLUMN payment_status TEXT DEFAULT 'pending';
ALTER TABLE lessons ADD COLUMN completion_certificate_txid TEXT;

-- Payments table additions
ALTER TABLE payments ADD COLUMN bsv_txid TEXT;
ALTER TABLE payments ADD COLUMN bsv_amount_satoshis BIGINT;
ALTER TABLE payments ADD COLUMN merkle_proof TEXT;

-- Instructors table additions
ALTER TABLE instructors ADD COLUMN wallet_identity_key TEXT;
ALTER TABLE instructors ADD COLUMN payout_address TEXT;
```

---

## Resources & Links

### Official Documentation
- [Project Babbage Docs](https://docs.projectbabbage.com/docs)
- [BSV Skills Center](https://docs.bsvblockchain.org)
- [BRC Standards Hub](https://hub.bsvblockchain.org/brc)
- [BRC GitHub](https://bsv.brc.dev/)

### GitHub Repositories
- [BSV Overlay Services](https://github.com/bsv-blockchain/overlay-services)
- [Overlay Example](https://github.com/bitcoin-sv/overlay-example)
- [BSV TypeScript SDK](https://github.com/bsv-blockchain)

### Articles & Tutorials
- [Project Babbage Overview](https://bsvblockchain.org/news/project-babbage-creating-a-peer-to-peer-based-internet/)
- [The Metanet At a Glance](https://blog.projectbabbage.com/p/the-metanet-at-a-glance)
- [BSV Ecosystem BRC-100 Tools](https://t.signalplus.com/crypto-news/detail/bsv-ecosystem-developer-tools-brc-100-interface)

### Community
- Metanet Academy - Learning resources
- Babbage Hackathons - Developer events (October 2025 in Oregon)

---

## Glossary

| Term | Definition |
|------|------------|
| **BSV** | Bitcoin SV - the blockchain network |
| **UTXO** | Unspent Transaction Output - spendable "envelope" of value |
| **SPV** | Simplified Payment Verification - lightweight validation |
| **Satoshi** | Smallest unit of BSV (1 BSV = 100,000,000 satoshis) |
| **Overlay** | Virtual network on top of BSV for specific use cases |
| **Topic Manager** | Gatekeeper that filters which UTXOs to track |
| **Lookup Service** | Query engine for overlay data |
| **BRC** | Bitcoin Request for Comments - standards proposals |
| **Merkle Proof** | Cryptographic proof of transaction inclusion in block |
| **BEEF** | Background Evaluation Extended Format - transaction format |
| **Authrite** | Mutual authentication protocol (BRC-31) |
| **Paymail** | Human-readable payment addresses |
| **LARS** | Local development environment for overlays |
| **CARS** | Cloud deployment for overlay services |

---

## Budget Drive Protocol - BSV Value Proposition

### Why BSV for a Driving School?

| Traditional System | BSV-Enabled System |
|-------------------|-------------------|
| 2-3% credit card fees | Near-zero transaction fees |
| 2-3 day settlement | Instant settlement |
| Chargebacks possible | No chargebacks (final) |
| Paper certificates | On-chain verifiable certificates |
| Trust school's records | Cryptographically provable records |
| Manual instructor payouts | Automatic instant splits |
| Siloed student data | Portable student-owned data |

### Concrete Use Cases

1. **Instant Lesson Payments**
   - Student pays directly to instructor + school split
   - No payment processor middleman
   - Immediate confirmation

2. **Verifiable Completion Certificates**
   - "John completed 30 hours of Driver's Ed" - on-chain proof
   - Insurance companies can verify
   - DMV can verify (future integration)

3. **Student-Owned Progress Records**
   - Student controls their training data
   - Portable between schools
   - Privacy-preserving (show only what's needed)

4. **Instructor Credential Verification**
   - Prove instructor is certified
   - Background check attestations
   - License verification

5. **Audit Trail**
   - Every lesson, payment, certificate timestamped
   - Immutable record
   - Compliance-friendly

---

## Student Portal & Progressive Wallet Adoption

### Design Philosophy

**Key Insight:** Don't force blockchain complexity on users. Let them experience value first, then introduce wallets when there's a clear benefit.

### User Types & Access Levels

| User Type | Access Method | Wallet Required? |
|-----------|---------------|------------------|
| Owner/Admin | Email + Password login | No (optional later) |
| Instructor | Email + Password login | No (optional later) |
| Student/Parent | Magic link (no password) | No - until completion |

### Magic Link Student Portal

**What it is:** A simple, passwordless way for students/parents to access their info.

**How it works:**
1. Admin creates student record
2. System generates unique `portal_access_token`
3. Student receives link: `app.com/portal/{token}`
4. No account creation, no password needed

**Portal capabilities:**
- View upcoming lesson schedule
- See progress (hours completed / hours required)
- Request schedule changes (24hr minimum notice)
- View payment history
- Contact school

**Schedule Change Request Rules:**
- Must be 24+ hours before lesson
- Creates a "pending" request for admin approval
- Student notified of approval/denial
- Prevents last-minute cancellations

### Progressive Wallet Introduction

```
STAGE 1: Magic Link (No Wallet)
│
│  Student uses portal throughout training
│  Zero blockchain complexity
│
▼
STAGE 2: Training Complete - NFT Offer
│
│  "Congratulations! Claim your verified certificate"
│  - 3D NFT badge showing completion
│  - Verifiable by insurance/employers/DMV
│  - THIS is when wallet is created
│
▼
STAGE 3: Wallet Unlocks Features
│
│  Now that student has wallet:
│  - Generate referral links
│  - Receive BSV rewards
│  - Pay for future services via BSV
│  - Portable identity for other schools
```

### NFT Certificate Incentive

**Why students will WANT to claim it:**
- Visual 3D badge they can share
- Verifiable proof (insurance discounts potential)
- Bragging rights on social media
- Gateway to referral rewards

**Certificate data (on-chain):**
- Student's wallet identity (not PII)
- School's wallet identity
- Completion date
- Hours completed
- Course type (Driver's Ed, Behind-the-Wheel, etc.)
- Instructor attestation signature

---

## Referral System with Wallet Rewards

### The Viral Growth Loop

```
COMPLETED STUDENT                    REFERRED FRIEND
      │                                    │
      ▼                                    ▼
┌──────────────────┐              ┌──────────────────┐
│ Claims NFT cert  │              │ Clicks referral  │
│ Gets wallet      │──────────────│ link             │
│                  │  unique      │                  │
│                  │  ref link    │                  │
└──────────────────┘              └──────────────────┘
      │                                    │
      ▼                                    ▼
┌──────────────────┐              ┌──────────────────┐
│ Shares link:     │              │ Wallet created   │
│ budgetdrive.com/ │              │ automatically    │
│ ref/{wallet_id}  │              │                  │
│                  │              │ Gets discount on │
│                  │              │ first booking    │
└──────────────────┘              └──────────────────┘
      │                                    │
      ▼                                    ▼
┌──────────────────┐              ┌──────────────────┐
│ When friend      │◀─────────────│ Completes        │
│ completes...     │   triggers   │ training         │
│                  │              │                  │
│ Referrer gets    │              │                  │
│ BSV reward       │              │                  │
│ (instant!)       │              │                  │
└──────────────────┘              └──────────────────┘
```

### Referral Rewards Structure

**For the referrer (completed student):**
- Instant BSV micropayment when friend completes
- OR credit toward future services (road test prep)
- OR upgraded NFT badge ("Ambassador" tier)
- Referral chain tracked on-chain (provable)

**For the referred friend:**
- Discount on first lesson package
- Pre-created wallet (ready for payments)
- Streamlined enrollment

### Why BSV Makes This Better

| Traditional Referral | BSV Referral |
|---------------------|--------------|
| Pay payment processor fees to send $20 | Near-zero fees for any amount |
| Manual tracking in spreadsheets | On-chain proof of referral chain |
| Fraud risk (fake referrals) | Cryptographically verified |
| Days to process rewards | Instant settlement |
| You control nothing | You control everything |

### Referral Data Model

```
referrals table:
- id
- referrer_wallet_id (student who shared)
- referred_wallet_id (friend who signed up)
- referral_code
- status (pending, enrolled, completed, rewarded)
- discount_amount
- reward_amount
- reward_txid (BSV transaction when paid)
- created_at
- completed_at
- rewarded_at
```

### Anti-Fraud Measures

- Referral only valid if referred student completes training
- One referral credit per unique wallet
- Rate limiting on referral link generation
- School can review/approve before reward payout

---

## Updated Implementation Phases

### Phase 1: Foundation (Current)
- [x] PostgreSQL database
- [x] REST API with Express
- [x] React frontend
- [x] Multi-tenant architecture
- [x] JWT Authentication
- [ ] Magic link student portal
- [ ] Schedule change requests

### Phase 2: BSV Wallet Integration
- [ ] Install `@bsv/sdk` package
- [ ] Wallet creation flow (for certificate claim)
- [ ] NFT certificate minting
- [ ] Wallet-based auth option for admins

### Phase 3: Referral System
- [ ] Referral link generation
- [ ] Referred friend wallet creation
- [ ] Discount application
- [ ] Reward tracking
- [ ] BSV payout automation

### Phase 4: Advanced Features
- [ ] BSV lesson payments
- [ ] Instructor BSV payouts
- [ ] Insurance verification integration
- [ ] Multi-school certificate portability

---

## Next Steps

1. **Complete MVP (Current Focus)**
   - Finish auth system ✅
   - Build magic link student portal
   - Implement schedule change requests
   - Polish UI/UX

2. **Research Phase**
   - Install Metanet Desktop wallet
   - Explore Stageline testnet
   - Run overlay-example project

3. **Prototype Integration**
   - NFT certificate design (3D model)
   - Wallet creation flow UX
   - Referral link generation

4. **Production Planning**
   - Design overlay architecture
   - Plan migration strategy
   - Security audit

---

*This document will be updated as we progress through the integration.*
