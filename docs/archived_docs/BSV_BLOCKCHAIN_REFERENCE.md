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

### Agentic Commerce Optimization (ACO)

**The Future of Commerce is AI-Intermediated**

By 2028, 90% of B2B buying decisions will be AI-intermediated. This fundamental shift means:

- **AI Agents**, not humans, will discover and evaluate your services
- Traditional SEO is evolving into **ACO** - optimizing for AI agents, not search engines
- Agents will query your APIs, parse structured data, and calculate "Certainty Scores"
- Businesses not optimized for agents will become **invisible**

**What This Means for Budget Drive Protocol:**

1. **Machine-Readable Business Data**
   - Instructor availability as queryable API endpoints
   - Pricing, certifications, and service areas in structured formats
   - Real-time booking availability without human intervention

2. **Blockchain-Verified Credentials**
   - Instructor certifications provably authentic (BRC-52 certificates)
   - Student progress records cryptographically signed
   - Payment history and reputation scores on-chain
   - AI agents can verify credentials without human verification

3. **Autonomous Transaction Capability**
   - AI agents can discover, evaluate, and **book** lessons automatically
   - Parents' AI assistants can find optimal instructors based on:
     - Availability matching student's schedule
     - Proximity to student's location
     - Verified success rates and certifications
     - Transparent pricing and payment terms
   - Micropayment-enabled interactions (AI queries cost fractions of a penny)

4. **Certainty Score Optimization**
   - Structured data increases AI confidence
   - Blockchain verification provides tamper-proof evidence
   - Real-time API access shows current availability
   - Cryptographic signatures prove authenticity

**The ACO Advantage:** Blockchain + structured APIs = perfect discoverability for AI agents while maintaining human trust through cryptographic proof.

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

## ACO Architecture: Making Budget Drive Protocol AI-Discoverable

### The Problem Traditional Businesses Face

**2023-2025:** Humans browse websites, read reviews, call businesses, compare options
**2026-2028:** AI agents do all of the above, making decisions in milliseconds

**If your business data isn't:**
- Machine-readable
- API-accessible
- Cryptographically verifiable
- Structured according to standards

**Then you're invisible to 90% of future buyers.**

### Budget Drive Protocol's ACO Advantage

#### 1. **Structured Business Data (Schema.org + Custom)**

```json
// Example AI-queryable instructor profile
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Budget Drive Protocol - Instructor Sarah Johnson",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "San Francisco",
    "addressRegion": "CA",
    "postalCode": "94102"
  },
  "priceRange": "$$",
  "offers": {
    "@type": "Offer",
    "price": "75.00",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "validFrom": "2026-01-30T00:00:00Z"
  },
  "employee": {
    "@type": "Person",
    "name": "Sarah Johnson",
    "jobTitle": "Licensed Driving Instructor",
    "bsvCertificate": "bsv://certificate/abc123...",
    "yearsExperience": 12,
    "specialization": ["Teen Drivers", "Highway Training", "Defensive Driving"],
    "certifications": [
      {
        "@type": "EducationalOccupationalCredential",
        "credentialCategory": "CA DMV License #DL123456",
        "recognizedBy": "California DMV",
        "verificationMethod": "bsv://verify/cert/abc123",
        "issuedOn": "2014-03-15"
      }
    ],
    "metrics": {
      "totalStudents": 847,
      "passRateFirstAttempt": 0.94,
      "averageRating": 4.9,
      "verifiedOnChain": true
    }
  },
  "bsvOverlay": "budgetdrive.instructors.v1",
  "realTimeAvailability": "https://api.budgetdrive.com/v1/instructors/sarah-johnson/availability"
}
```

**Why AI agents love this:**
- Standard Schema.org vocabulary (every AI knows this)
- Blockchain-verifiable credentials (bsv:// URIs)
- Real-time availability API endpoint
- Structured metrics (pass rate, students, ratings)
- No ambiguity - machines can parse 100% accurately

#### 2. **Real-Time Availability API**

```javascript
// AI agent query
GET /api/v1/availability/search
{
  "location": { "lat": 37.7749, "lng": -122.4194, "radius": 10 },
  "dateRange": { "start": "2026-02-01", "end": "2026-02-15" },
  "daysOfWeek": ["Monday", "Wednesday", "Friday"],
  "timePreference": "afternoon",
  "minimumPassRate": 0.90,
  "studentAge": 16,
  "specialization": "Teen Drivers"
}

// Response (optimized for AI certainty scoring)
{
  "results": [
    {
      "instructorId": "sarah-johnson",
      "certaintyScore": 0.97,  // AI-calculated match quality
      "matchReasons": [
        "Specializes in teen drivers",
        "94% pass rate (exceeds minimum)",
        "12 available slots in date range",
        "Average 4.9 rating from 847 students",
        "Credentials verified on-chain"
      ],
      "availableSlots": [
        {
          "date": "2026-02-03",
          "startTime": "15:00",
          "endTime": "17:00",
          "price": 75.00,
          "bookingUrl": "https://api.budgetdrive.com/v1/bookings/create",
          "reservationHoldMinutes": 15
        }
      ],
      "verificationProof": {
        "certificateTxid": "abc123...",
        "blockHeight": 1245678,
        "merkleProof": "..."
      }
    }
  ]
}
```

**AI agent can now:**
1. Query availability for its user's schedule
2. Calculate confidence ("certainty score")
3. Verify credentials on blockchain
4. Book autonomously (if authorized)
5. All in under 500ms

#### 3. **Autonomous Booking Flow**

```
Parent's AI Assistant                Budget Drive API
        │                                   │
        │  1. Search available slots        │
        ├──────────────────────────────────►│
        │                                   │
        │  2. Return matches + certainty    │
        │◄──────────────────────────────────┤
        │                                   │
        │  3. Reserve top slot (15min hold) │
        ├──────────────────────────────────►│
        │                                   │
        │  4. Present to parent for approval│
        │                                   │
        │  5. Create booking (OAuth token)  │
        ├──────────────────────────────────►│
        │                                   │
        │  6. Request BSV payment           │
        │◄──────────────────────────────────┤
        │                                   │
        │  7. Send payment (via BRC-100)    │
        ├──────────────────────────────────►│
        │                                   │
        │  8. Booking confirmed + TXID      │
        │◄──────────────────────────────────┤
        │                                   │
        │  9. Calendar invite sent          │
        │◄──────────────────────────────────┤
```

**Key difference from traditional booking:**
- AI agent does the comparison shopping (not parent)
- AI verifies credentials automatically (blockchain proof)
- AI executes payment (if authorized)
- Parent just approves final choice
- **Total time: 2-3 minutes instead of 2-3 hours**

#### 4. **Certainty Score Components**

AI agents calculate a "certainty score" based on:

```javascript
certaintyScore = weighted_average([
  availability_match * 0.25,        // Does schedule align?
  credential_verification * 0.20,   // Are certs blockchain-verified?
  success_metrics * 0.20,          // Pass rate, completion rate
  price_competitiveness * 0.15,    // Within budget range?
  social_proof * 0.10,             // Reviews, ratings
  response_time * 0.10             // How fast can booking be confirmed?
])
```

**Budget Drive's advantages:**
- ✅ Real-time availability (higher match probability)
- ✅ Blockchain-verified certs (100% certainty on credentials)
- ✅ On-chain success metrics (tamper-proof)
- ✅ Instant booking confirmation (API-driven)
- ✅ Automated payment settlement (BSV micropayments)

**Competitor without blockchain:**
- ⚠️ Outdated calendars (manual updates)
- ⚠️ Unverified credentials (AI must trust claims)
- ⚠️ Self-reported metrics (could be fabricated)
- ⚠️ Slow booking (phone/email required)
- ⚠️ Payment friction (credit cards, fees)

**Result:** Budget Drive gets a 0.92 certainty score, competitor gets 0.61 → **You win the booking**

#### 5. **Micropayment API Queries**

```javascript
// AI agent pays 0.0001 cents per search query
// This prevents spam while generating revenue

POST /api/v1/search/instructors
Headers:
  Authorization: Bearer {ai_agent_token}
  X-Payment-Channel: bsv://channel/xyz

Response Headers:
  X-Query-Cost: 0.00000001 BSV (paid from channel)
  X-Channel-Balance: 0.00009991 BSV (remaining)
```

**Benefits:**
- Revenue from every AI search (even if they don't book)
- Prevents abuse (spam costs money)
- Encourages quality queries (AI optimizes to reduce searches)
- No credit card fees (BSV micropayments)

#### 6. **Machine Learning Feedback Loop**

```
AI Agent Books Lesson
        ↓
Student Attends
        ↓
Lesson Completed (recorded on-chain)
        ↓
AI Agent Receives Confirmation
        ↓
AI Updates Internal Model
    (Sarah Johnson has 95% reliability)
        ↓
AI Ranks Her Higher Next Time
```

**The network effect:**
- More AI bookings → more on-chain data
- More data → better AI certainty scores
- Better scores → more visibility
- More visibility → more bookings
- **Virtuous cycle**

### ACO Implementation Checklist

**Phase 1: Data Structuring (Q1-Q2 2026)**
- [ ] Convert instructor profiles to Schema.org format
- [ ] Add blockchain certificate references to all credentials
- [ ] Create machine-readable pricing models
- [ ] Build real-time availability API
- [ ] **Goal: 100 schools, $0 fees** (adoption first)

**Phase 2: API Optimization (Q3 2026)**
- [ ] Implement GraphQL for flexible queries
- [ ] Add certainty score calculation endpoints
- [ ] Create batch availability checking
- [ ] Build autonomous booking endpoints
- [ ] **Turn on micropayments at 2 sats** (low friction)
- [ ] **Goal: 1,000 schools**

**Phase 3: Verification Layer (Q4 2026 - Q1 2027)**
- [ ] Mint BRC-52 certificates for all instructors
- [ ] Create on-chain success metric snapshots
- [ ] Build verification API (check certs without downloading blockchain)
- [ ] Implement Merkle proof responses
- [ ] **Increase to 5 sats** (normal rates)

**Phase 4: AI Agent Support (Q2-Q3 2027)**
- [ ] OAuth 2.0 for AI agent authentication
- [ ] Micropayment channels for query fees (0.5-10 sats)
- [ ] Webhook notifications for booking changes
- [ ] Rate limiting and abuse detection
- [ ] **Goal: 10,000 schools, $1M+ passive income/year**

**Phase 5: Network Effects (2028+)**
- [ ] Feedback loop for AI booking success rates
- [ ] Public API documentation for AI integration
- [ ] Partner with AI assistant platforms (Anthropic, OpenAI, etc.)
- [ ] Create AI-specific marketing (developer portal)
- [ ] **Goal: 50,000 schools, $5M+ passive income/year**

---

### Micropayment Pricing Strategy

**The Golden Rule:**
- **If a human approves it** → Keep price LOW (2-5 sats)
- **If a machine auto-pays it** → Price higher (0.5-10 sats, AI doesn't care)

**Recommended Fee Schedule (Phase 3+):**

| Action Type | Fee | Who Pays | Why This Price |
|-------------|-----|----------|----------------|
| **Human Actions** |
| Lesson booking | 5 sats | School | Humans notice, keep low |
| Notification | 1 sat | School | Very frequent, tiny fee |
| Certificate | 10 sats | School | One-time, higher value |
| **AI Actions** |
| Basic search | 0.5 sats | AI agent | 400,000x cheaper than web scraping |
| Verification | 1 sat | Anyone | High value, instant proof |
| Premium query | 5-10 sats | AI/Enterprise | Complex calculations |

**Why AI pays without resistance:**
- 1 sat = $0.0000005 (literally unnoticeable)
- Payment channels = automatic (no approval dialog)
- Better than alternatives (web scraping costs $0.10 in compute)
- Higher confidence data (verified = better AI decisions)
- Enterprise AI budgets include $1,000/month for queries

---

### Revenue Milestones

| Schools | Phase | Annual Revenue | Passive % | Strategy |
|---------|-------|----------------|-----------|----------|
| 100 | 2 | $25,000 | 10% | Low fees, focus on adoption |
| 1,000 | 3 | $250,000 | 30% | Normal fees, build AI APIs |
| 10,000 | 4 | $2,500,000 | 45% | Full AI ecosystem |
| 50,000 | 5 | $12,500,000 | 50% | Market dominance, pure passive |

**The Magic:** Passive income % increases as AI adoption grows, even with same fee structure.

### Competitive Moat

**Traditional competitor's process for AI to book a lesson:**
1. AI scrapes website (unreliable, may violate ToS)
2. AI parses unstructured HTML (error-prone)
3. AI can't verify instructor credentials (low certainty)
4. AI must call/email for availability (slow, human-dependent)
5. AI can't execute payment (requires human)
6. **Result:** AI gives up, suggests human handle it

**Budget Drive's process:**
1. AI queries structured API (reliable, encouraged)
2. AI gets JSON response (100% parseable)
3. AI verifies blockchain certificates (instant, cryptographic proof)
4. AI gets real-time availability (fast, accurate)
5. AI executes BSV payment (autonomous, instant)
6. **Result:** Booking complete in 30 seconds, parent just approves

**Winner:** Budget Drive Protocol, every time.

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

### Phase 2: ACO-Ready API Layer (AI Agent Optimization)
**Goal:** Make Budget Drive Protocol discoverable and usable by AI agents

- [ ] **Structured Data Endpoints**
  - GraphQL or OpenAPI 3.0 spec for all business data
  - Machine-readable instructor profiles (certifications, availability, rates)
  - Real-time lesson availability API
  - Pricing models in standardized format (Schema.org pricing)
  
- [ ] **AI-Friendly Query Interface**
  - Natural language to structured query conversion
  - Semantic search for instructors by attributes (location, specialization, availability)
  - Batch availability checking (AI can check multiple time slots at once)
  - "Certainty Score" data: reviews, completion rates, certifications
  
- [ ] **Autonomous Booking Capability**
  - API endpoints allowing agents to book lessons programmatically
  - OAuth 2.0 for secure AI agent authentication
  - Webhook notifications for booking confirmations
  - Rate limiting and abuse prevention for automated systems

- [ ] **Blockchain-Verified Metadata**
  - BRC-52 certificate proofs in API responses
  - On-chain credential verification endpoints
  - Tamper-proof instructor success metrics
  - Payment history verification (without exposing PII)

### Phase 3: BSV Wallet Integration
- [ ] Install `@bsv/sdk` package
- [ ] Wallet creation flow (for certificate claim)
- [ ] NFT certificate minting with BRC-52 identity
- [ ] Wallet-based auth option for admins
- [ ] Micropayment API for AI agent queries (charge AI 0.0001 cents per search)

### Phase 4: Referral System
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
