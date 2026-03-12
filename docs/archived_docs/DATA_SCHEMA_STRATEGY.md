# Data Schema Strategy - Budget Drive Protocol

**Created:** February 2, 2026
**Purpose:** Definitive guide for data storage decisions across PostgreSQL, MongoDB, and BSV Blockchain

---

## Table of Contents

1. [Storage Decision Framework](#storage-decision-framework)
2. [PostgreSQL Schemas (Operational Data)](#postgresql-schemas-operational-data)
3. [MongoDB Schemas (Overlay Index)](#mongodb-schemas-overlay-index)
4. [Blockchain Schemas (Financial & Proofs)](#blockchain-schemas-financial--proofs)
5. [Data Flow Examples](#data-flow-examples)
6. [Migration Strategy](#migration-strategy)

---

## Storage Decision Framework

### Decision Tree: Where Does This Data Go?

```
Is this financial/payment data?
├─ YES → Blockchain (BSV) + MongoDB index
└─ NO → Is this provable/verifiable by third parties?
    ├─ YES → Hash/proof on Blockchain + MongoDB index, full data in PostgreSQL
    └─ NO → Is this personal identifiable information (PII)?
        ├─ YES → PostgreSQL only (encrypted, access-controlled)
        └─ NO → Is this high-volume operational data?
            ├─ YES → PostgreSQL (fast queries, frequent updates)
            └─ NO → Consider Blockchain for immutability
```

### The Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: OPERATIONAL (PostgreSQL)                           │
│ Purpose: Fast queries, private data, operational state      │
│ Contains: Student PII, scheduling, availability, notes      │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ When action occurs → Create hash/proof
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: BLOCKCHAIN (BSV)                                   │
│ Purpose: Immutable audit trail, financial truth, timestamps │
│ Contains: Micropayments, hashes, Merkle proofs, signatures  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Topic Managers admit → Lookup Services index
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: OVERLAY INDEX (MongoDB)                            │
│ Purpose: Fast queries, SPV proofs, AI/third-party access    │
│ Contains: Indexed blockchain data, queryable references     │
└─────────────────────────────────────────────────────────────┘
```

---

## PostgreSQL Schemas (Operational Data)

### Students Table (PRIVATE - Never on blockchain)

```sql
CREATE TABLE students (
  -- Core Identity (PRIVATE)
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,

  -- Address (PRIVATE - used for pickup, not on-chain)
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(10),

  -- Emergency Contacts (PRIVATE)
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_2_name VARCHAR(255),
  emergency_contact_2_phone VARCHAR(20),

  -- Learner's Permit (PRIVATE - hash goes on-chain for verification)
  learner_permit_number VARCHAR(50),
  learner_permit_issue_date DATE,
  learner_permit_expiration DATE,

  -- Progress Tracking (PRIVATE - milestones go on-chain)
  hours_required DECIMAL(5,2) DEFAULT 6,
  hours_completed DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',

  -- Internal Notes (PRIVATE)
  notes TEXT,

  -- Blockchain Reference (links to on-chain records)
  blockchain_student_hash VARCHAR(64), -- sha256(id + email) for privacy

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Index for blockchain lookups (hash only, not PII)
CREATE INDEX idx_students_blockchain_hash ON students(blockchain_student_hash);
```

**Why PostgreSQL:**
- Contains PII (names, addresses, contacts)
- Requires privacy protection (GDPR/CCPA)
- Fast queries for scheduling operations
- Frequent updates (hours completed, status changes)

**Blockchain Connection:**
- `blockchain_student_hash` = sha256(id + email)
- Hash goes on-chain for certificate verification
- Third parties verify completion without seeing name/address

---

### Instructors Table (MOSTLY PRIVATE)

```sql
CREATE TABLE instructors (
  -- Core Identity (PRIVATE)
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,

  -- Address (PRIVATE)
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(10),

  -- Service Area (OPERATIONAL - used for proximity matching)
  home_zip_code VARCHAR(10), -- Starting point for route calculations
  service_zip_codes TEXT, -- Comma-separated, used for filtering

  -- License (PRIVATE - certificate hash goes on-chain)
  license_number VARCHAR(50),
  license_expiration DATE,

  -- Employment (PRIVATE - payroll data)
  employment_type VARCHAR(50) DEFAULT 'w2_employee',
  hire_date DATE NOT NULL,
  hourly_rate DECIMAL(10,2),

  -- Internal Notes (PRIVATE)
  notes TEXT,
  status VARCHAR(50) DEFAULT 'active',

  -- Blockchain Reference
  blockchain_instructor_hash VARCHAR(64), -- sha256(id + license_number)
  blockchain_certificate_txid VARCHAR(64), -- TXID of BRC-52 certificate

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_instructors_blockchain_hash ON instructors(blockchain_instructor_hash);
CREATE INDEX idx_instructors_home_zip ON instructors(home_zip_code);
```

**Why PostgreSQL:**
- Contains PII (name, contact, employment data)
- Privacy-sensitive (salary, hire date)
- Operational queries (availability, proximity)

**Blockchain Connection:**
- Instructor certification (BRC-52) → `blockchain_certificate_txid`
- Third parties verify license without seeing salary/personal info

---

### Lessons Table (HYBRID - operational + blockchain proof)

```sql
CREATE TABLE lessons (
  -- Core Identity
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  student_id UUID NOT NULL,
  instructor_id UUID NOT NULL,
  vehicle_id UUID,

  -- Scheduling (PRIVATE - timestamps go on-chain)
  scheduled_start TIMESTAMP NOT NULL,
  scheduled_end TIMESTAMP NOT NULL,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  duration_hours DECIMAL(4,2),

  -- Location (PRIVATE - pickup address for routing)
  pickup_address TEXT, -- Student's home address
  pickup_zip_code VARCHAR(10), -- Used for next-lesson proximity

  -- Status Tracking (OPERATIONAL)
  status VARCHAR(50) DEFAULT 'scheduled',
  -- scheduled, in_progress, completed, cancelled, no_show

  -- Lesson Details (PRIVATE)
  lesson_type VARCHAR(50), -- behind_wheel, classroom, road_test
  notes TEXT, -- Instructor's private notes
  student_performance_rating INTEGER, -- 1-5 scale

  -- Blockchain Reference
  blockchain_lesson_hash VARCHAR(64), -- sha256(id + scheduled_start + parties)
  blockchain_txid VARCHAR(64), -- TXID of on-chain booking record
  blockchain_proof JSON, -- Merkle proof for verification

  -- Payment Tracking (links to blockchain)
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_txid VARCHAR(64), -- BSV transaction ID

  -- BDP Protocol Fee
  protocol_fee_sats INTEGER DEFAULT 5, -- 5 sats per booking
  protocol_fee_txid VARCHAR(64), -- Micropayment TXID

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id)
);

CREATE INDEX idx_lessons_blockchain_hash ON lessons(blockchain_lesson_hash);
CREATE INDEX idx_lessons_blockchain_txid ON lessons(blockchain_txid);
CREATE INDEX idx_lessons_student ON lessons(student_id, scheduled_start);
CREATE INDEX idx_lessons_instructor ON lessons(instructor_id, scheduled_start);
CREATE INDEX idx_lessons_status ON lessons(status);
```

**Why Hybrid:**
- **PostgreSQL:** Private lesson notes, addresses, performance ratings
- **Blockchain:** Booking timestamp, payment proof, protocol fee
- **MongoDB:** Indexed for AI queries ("show instructor's availability")

**What Goes On-Chain:**
```json
{
  "protocol": "BDP_BOOK",
  "lessonHash": "sha256(lesson.id + scheduled_start + student_hash + instructor_hash)",
  "timestamp": "2026-02-02T10:00:00Z",
  "duration": 2,
  "studentHash": "sha256(student.id)",
  "instructorHash": "sha256(instructor.id)",
  "protocolFee": 5,
  "signature": "instructor_wallet_signature"
}
```

**What Stays Private:**
- Student name, address, phone
- Instructor notes, performance ratings
- Pickup address details

---

### Payments Table (HYBRID - financial data on-chain)

```sql
CREATE TABLE payments (
  -- Core Identity
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  lesson_id UUID,
  student_id UUID NOT NULL,

  -- Financial Data (BLOCKCHAIN)
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  payment_method VARCHAR(50), -- cash, card, check, bsv

  -- BSV Blockchain Reference
  blockchain_txid VARCHAR(64), -- BSV transaction ID
  blockchain_amount_sats BIGINT, -- Amount in satoshis (if BSV payment)
  blockchain_proof JSON, -- SPV proof

  -- Payment Status
  status VARCHAR(50) DEFAULT 'pending',
  processed_at TIMESTAMP,

  -- BDP Protocol Fee
  protocol_fee_sats INTEGER DEFAULT 3, -- 3 sats per payment record
  protocol_fee_txid VARCHAR(64),

  -- Internal Tracking (PRIVATE)
  notes TEXT,
  receipt_url TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT fk_student FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX idx_payments_blockchain_txid ON payments(blockchain_txid);
CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_status ON payments(status);
```

**Why Blockchain:**
- Financial audit trail required
- Immutable payment records
- Regulatory compliance (provable to auditors)

**What Goes On-Chain:**
```json
{
  "protocol": "BDP_PAY",
  "paymentId": "sha256(payment.id)",
  "amount": 150.00,
  "currency": "USD",
  "timestamp": "2026-02-02T12:00:00Z",
  "studentHash": "sha256(student.id)",
  "lessonHash": "sha256(lesson.id)",
  "protocolFee": 3,
  "signature": "tenant_wallet_signature"
}
```

---

## MongoDB Schemas (Overlay Index)

### Purpose
MongoDB stores **indexed blockchain data** for fast queries by:
- AI agents (searching for instructors)
- Third parties (insurance, DMV verification)
- Internal analytics (aggregated stats)

MongoDB does NOT store PII - only hashes and blockchain references.

---

### Overlay: Lessons Collection

```javascript
// MongoDB: overlay_lessons
{
  _id: ObjectId("..."),

  // Blockchain Reference
  txid: "abc123...", // BSV transaction ID
  blockHeight: 782341,
  timestamp: ISODate("2026-02-02T10:00:00Z"),

  // Hashed Identifiers (privacy-preserving)
  lessonHash: "sha256(lesson.id + scheduled_start + parties)",
  studentHash: "sha256(student.id + student.email)",
  instructorHash: "sha256(instructor.id + instructor.license)",
  tenantHash: "sha256(tenant.id)",

  // Queryable Metadata (NOT PII)
  duration: 2, // hours
  lessonType: "behind_wheel",
  status: "completed",

  // Location Data (ZIP only, not address)
  pickupZipCode: "92101", // For proximity queries

  // Protocol Fee
  protocolFeeSats: 5,
  protocolFeeTxid: "def456...",

  // SPV Proof (for verification)
  merkleProof: {
    root: "...",
    path: [...]
  },

  // Indexed for queries
  createdAt: ISODate("2026-02-02T10:00:00Z"),
  updatedAt: ISODate("2026-02-02T12:00:00Z")
}

// Indexes for AI queries
db.overlay_lessons.createIndex({ instructorHash: 1, timestamp: -1 });
db.overlay_lessons.createIndex({ studentHash: 1, timestamp: -1 });
db.overlay_lessons.createIndex({ pickupZipCode: 1 });
db.overlay_lessons.createIndex({ status: 1, timestamp: -1 });
db.overlay_lessons.createIndex({ txid: 1 }, { unique: true });
```

**Query Example (AI Agent):**
```javascript
// ChatGPT asks: "Find instructors near 92101 with availability this week"
const instructors = await db.overlay_lessons.aggregate([
  {
    $match: {
      pickupZipCode: { $in: ["92101", "92102", "92103"] },
      timestamp: {
        $gte: new Date("2026-02-03"),
        $lte: new Date("2026-02-09")
      },
      status: "completed"
    }
  },
  {
    $group: {
      _id: "$instructorHash",
      totalLessons: { $sum: 1 },
      avgDuration: { $avg: "$duration" },
      lastLesson: { $max: "$timestamp" }
    }
  }
]);

// AI pays 0.5 sats for this query (payment channel)
// Returns: Instructor hashes + stats, NO PII
```

---

### Overlay: Certificates Collection

```javascript
// MongoDB: overlay_certificates
{
  _id: ObjectId("..."),

  // Blockchain Reference
  txid: "xyz789...",
  blockHeight: 782500,
  timestamp: ISODate("2026-06-15T14:00:00Z"),

  // Certificate Details
  certificateId: "CERT-2026-001234",
  certificateType: "completion", // completion, dmv_approval, background_check

  // Hashed Identifiers
  studentHash: "sha256(student.id + student.email)",
  instructorHash: "sha256(instructor.id)",
  tenantHash: "sha256(tenant.id)",

  // Verifiable Metrics (NOT PII)
  totalHours: 40,
  completionDate: ISODate("2026-06-15"),
  dmvApproved: true,

  // BRC-52 Standard Fields
  issuerSignature: "...", // Instructor's signature
  merkleRoot: "...", // Proof of all lessons completed

  // SPV Proof
  merkleProof: {
    root: "...",
    path: [...]
  },

  // Protocol Fee
  protocolFeeSats: 10,
  protocolFeeTxid: "ghi012...",

  // Verification Tracking (for passive income)
  verificationCount: 0, // Increments each time third party verifies
  lastVerifiedAt: null,

  createdAt: ISODate("2026-06-15T14:00:00Z")
}

// Indexes for verification
db.overlay_certificates.createIndex({ certificateId: 1 }, { unique: true });
db.overlay_certificates.createIndex({ studentHash: 1 });
db.overlay_certificates.createIndex({ txid: 1 }, { unique: true });
```

**Query Example (Insurance Verification):**
```javascript
// Insurance company verifies: "Did this student complete training?"
const certificate = await lookupService.verifyCertificate({
  certificateId: "CERT-2026-001234",
  studentEmailHash: "sha256(john@example.com)"
});

// Returns:
{
  verified: true,
  completionDate: "2026-06-15",
  totalHours: 40,
  dmvApproved: true,
  blockchainProof: {
    txid: "xyz789...",
    blockHeight: 782500,
    merkleProof: "..."
  },
  queryCost: 1 // sat (deducted from payment channel)
}

// Insurance CANNOT see:
// - Student name, address, phone
// - Lesson notes, performance ratings
// - Instructor details
```

---

## Blockchain Schemas (Financial & Proofs)

### Transaction Types

#### 1. Lesson Booking (BDP_BOOK)

```json
{
  "protocol": "BDP_BOOK",
  "version": 1,

  // Hashed Identifiers (privacy-preserving)
  "lessonHash": "sha256(lesson_id + scheduled_start + student_id + instructor_id)",
  "studentHash": "sha256(student.id + student.email)",
  "instructorHash": "sha256(instructor.id + instructor.license_number)",
  "tenantHash": "sha256(tenant.id)",

  // Timestamp & Duration
  "timestamp": "2026-02-02T10:00:00Z",
  "duration": 2,

  // Lesson Type (not PII)
  "lessonType": "behind_wheel",

  // Location (ZIP only, not address)
  "pickupZipCode": "92101",

  // Protocol Fee
  "protocolFee": 5,

  // Signatures
  "instructorSignature": "...", // Instructor's wallet signature
  "tenantSignature": "...", // Tenant's wallet signature

  // Merkle Proof (optional - for batching)
  "merkleRoot": "...",
  "merkleProof": [...]
}
```

**BSV Output Script:**
```
OP_RETURN
<protocol_prefix: "BDP_BOOK">
<json_payload>
```

**Micropayment:** 5 sats to BDP treasury wallet

---

#### 2. Payment Record (BDP_PAY)

```json
{
  "protocol": "BDP_PAY",
  "version": 1,

  // Payment Details
  "paymentId": "sha256(payment.id)",
  "amount": 150.00,
  "currency": "USD",
  "timestamp": "2026-02-02T12:00:00Z",

  // Linked Records
  "studentHash": "sha256(student.id)",
  "lessonHash": "sha256(lesson.id)",
  "tenantHash": "sha256(tenant.id)",

  // Protocol Fee
  "protocolFee": 3,

  // Signatures
  "tenantSignature": "..."
}
```

**Micropayment:** 3 sats to BDP treasury wallet

---

#### 3. Certificate Issuance (BDP_CERT - BRC-52)

```json
{
  "protocol": "BDP_CERT",
  "standard": "BRC-52",
  "version": 1,

  // Certificate Details
  "certificateId": "CERT-2026-001234",
  "certificateType": "completion",
  "issueDate": "2026-06-15",

  // Hashed Identifiers
  "studentHash": "sha256(student.id + student.email)",
  "instructorHash": "sha256(instructor.id)",
  "tenantHash": "sha256(tenant.id)",

  // Verifiable Metrics
  "totalHours": 40,
  "completionDate": "2026-06-15",
  "dmvApproved": true,

  // Merkle Root (proof of all lessons)
  "merkleRoot": "sha256(all_lesson_hashes)",

  // BRC-52 Fields
  "issuerPublicKey": "...",
  "issuerSignature": "...",
  "revocationEndpoint": "https://api.budgetdrive.com/v1/certs/revoke",

  // Protocol Fee
  "protocolFee": 10
}
```

**Micropayment:** 10 sats to BDP treasury wallet

---

## Data Flow Examples

### Example 1: Booking a Lesson

```
1. FRONTEND (React)
   User books lesson via SmartBookingFormV2
   ↓
2. BACKEND API (Express)
   POST /api/lessons
   ↓
3. POSTGRESQL
   INSERT INTO lessons (...)
   lesson_id = uuid_generate_v4()
   blockchain_lesson_hash = sha256(lesson_id + timestamp + parties)
   ↓
4. BSV WALLET SERVICE
   Create transaction:
   - OP_RETURN with lesson hash
   - 5 sats to BDP treasury
   ↓
5. TOPIC MANAGER (tm_bdp_lessons)
   Receives transaction from wallet
   Validates against PostgreSQL
   Admits to overlay (if valid)
   ↓
6. BSV BLOCKCHAIN
   Transaction mined in block
   txid = "abc123..."
   ↓
7. LOOKUP SERVICE (ls_bdp_lessons)
   Indexes transaction in MongoDB
   overlay_lessons.insert({ txid, lessonHash, metadata })
   ↓
8. POSTGRESQL UPDATE
   UPDATE lessons SET blockchain_txid = 'abc123...' WHERE id = lesson_id
```

---

### Example 2: AI Agent Queries Instructor Availability

```
1. AI AGENT (ChatGPT)
   User: "Find driving instructor near 92101"
   ↓
2. PAYMENT CHANNEL
   AI has open channel with BDP API
   Balance: 10,000 sats (~$5)
   ↓
3. LOOKUP SERVICE QUERY
   GET /api/v1/overlay/instructors/search
   {
     "zipCode": "92101",
     "radius": 10,
     "availability": "next_7_days"
   }
   ↓
4. MONGODB QUERY
   db.overlay_lessons.aggregate([
     { $match: { pickupZipCode: { $in: ["92101", ...] } } },
     { $group: { _id: "$instructorHash", ... } }
   ])
   ↓
5. RESPONSE + DEDUCTION
   Returns: [{
     instructorHash: "sha256(...)",
     totalLessons: 250,
     avgRating: 4.8,
     nextAvailable: "2026-02-05T10:00:00Z"
   }]

   Deduct: 0.5 sats from payment channel

   AI CANNOT SEE:
   - Instructor name
   - Student details
   - Lesson notes
   ↓
6. AI RESPONSE TO USER
   "I found a highly rated instructor (250 lessons, 4.8★)
    available near ZIP 92101 on Feb 5th at 10am"
```

---

### Example 3: Insurance Verifies Student Certificate

```
1. INSURANCE COMPANY
   Verify: Did John Doe complete driver training?
   Input: student email (john@example.com), certificate ID
   ↓
2. PAYMENT CHANNEL
   Insurance has open channel: 50,000 sats
   ↓
3. LOOKUP SERVICE QUERY
   POST /api/v1/overlay/certificates/verify
   {
     "certificateId": "CERT-2026-001234",
     "studentEmailHash": "sha256(john@example.com)"
   }
   ↓
4. MONGODB LOOKUP
   db.overlay_certificates.findOne({
     certificateId: "CERT-2026-001234",
     studentHash: "sha256(john@example.com)"
   })
   ↓
5. SPV VERIFICATION
   Fetch Merkle proof from blockchain
   Verify certificate inclusion in block
   ↓
6. RESPONSE + DEDUCTION
   Returns: {
     verified: true,
     completionDate: "2026-06-15",
     totalHours: 40,
     dmvApproved: true,
     blockchainProof: { txid, blockHeight, merkleProof }
   }

   Deduct: 1 sat from payment channel

   INSURANCE CANNOT SEE:
   - Student address
   - Lesson notes
   - Instructor payroll
   ↓
7. INSURANCE DECISION
   "Certificate verified via blockchain. Approve policy discount."
```

---

## Migration Strategy

### Phase 1: Current State (PostgreSQL Only)
- ✅ All data in PostgreSQL
- ✅ Treasury table tracks fees (not on-chain yet)
- ✅ Application works without blockchain

### Phase 2: Add Blockchain Hashes
**Goal:** Prepare PostgreSQL for blockchain integration

```sql
-- Add blockchain reference columns
ALTER TABLE students ADD COLUMN blockchain_student_hash VARCHAR(64);
ALTER TABLE instructors ADD COLUMN blockchain_instructor_hash VARCHAR(64);
ALTER TABLE lessons ADD COLUMN blockchain_lesson_hash VARCHAR(64);
ALTER TABLE lessons ADD COLUMN blockchain_txid VARCHAR(64);
ALTER TABLE lessons ADD COLUMN protocol_fee_txid VARCHAR(64);

-- Populate hashes for existing data
UPDATE students SET blockchain_student_hash = encode(digest(id::text || email, 'sha256'), 'hex');
UPDATE instructors SET blockchain_instructor_hash = encode(digest(id::text || license_number, 'sha256'), 'hex');
UPDATE lessons SET blockchain_lesson_hash = encode(digest(id::text || scheduled_start::text || student_id::text || instructor_id::text, 'sha256'), 'hex');

-- Create indexes
CREATE INDEX idx_students_blockchain_hash ON students(blockchain_student_hash);
CREATE INDEX idx_instructors_blockchain_hash ON instructors(blockchain_instructor_hash);
CREATE INDEX idx_lessons_blockchain_hash ON lessons(blockchain_lesson_hash);
CREATE INDEX idx_lessons_blockchain_txid ON lessons(blockchain_txid);
```

### Phase 3: Setup Overlay Services
**Goal:** Deploy Topic Managers + Lookup Services

```bash
# Install dependencies
npm install @bsv/sdk @bsv/overlay @bsv/overlay-express mongodb

# Create overlay structure
mkdir -p backend/src/overlay/{topic-managers,lookup-services}

# Start LARS for local development
npx lars
```

### Phase 4: Implement Topic Managers
**Goal:** Admit blockchain transactions to overlay

```typescript
// backend/src/overlay/topic-managers/lessons.ts
import { TopicManager } from '@bsv/overlay-express';

export class LessonsTopicManager extends TopicManager {
  async admit(tx: Transaction): Promise<boolean> {
    // 1. Extract lesson hash from OP_RETURN
    const lessonHash = extractLessonHash(tx);

    // 2. Validate against PostgreSQL
    const lesson = await db.query(
      'SELECT * FROM lessons WHERE blockchain_lesson_hash = $1',
      [lessonHash]
    );

    if (!lesson) return false; // Reject unknown lessons

    // 3. Verify protocol fee payment (5 sats)
    const feePaid = await verifyProtocolFee(tx, 5);
    if (!feePaid) return false;

    // 4. Admit to overlay
    return true;
  }
}
```

### Phase 5: Implement Lookup Services
**Goal:** Index blockchain data in MongoDB for queries

```typescript
// backend/src/overlay/lookup-services/lessons.ts
import { LookupService } from '@bsv/overlay-express';

export class LessonsLookupService extends LookupService {
  async index(tx: Transaction) {
    // 1. Parse transaction data
    const data = parseTransaction(tx);

    // 2. Store in MongoDB
    await mongodb.collection('overlay_lessons').insertOne({
      txid: tx.id,
      blockHeight: tx.blockHeight,
      lessonHash: data.lessonHash,
      studentHash: data.studentHash,
      instructorHash: data.instructorHash,
      timestamp: data.timestamp,
      duration: data.duration,
      pickupZipCode: data.pickupZipCode,
      merkleProof: data.merkleProof,
      createdAt: new Date()
    });

    // 3. Update PostgreSQL with blockchain reference
    await db.query(
      'UPDATE lessons SET blockchain_txid = $1 WHERE blockchain_lesson_hash = $2',
      [tx.id, data.lessonHash]
    );
  }

  async query(params: QueryParams) {
    // AI/third-party queries go here
    return await mongodb.collection('overlay_lessons')
      .find(params)
      .toArray();
  }
}
```

### Phase 6: Integrate Frontend (BRC-100 Wallet)
**Goal:** User-controlled keys, micropayments

```typescript
// frontend/src/lib/wallet.ts
import { createAction } from '@bsv/sdk';

export class BDPWallet {
  async bookLesson(lessonData: LessonData) {
    // 1. Request user signature via BRC-100
    const action = await createAction({
      protocol: 'BDP_BOOK',
      data: {
        lessonHash: lessonData.hash,
        timestamp: lessonData.scheduledStart,
        duration: lessonData.duration
      },
      outputs: [{
        satoshis: 5, // Protocol fee
        to: 'bdp-treasury-wallet-address'
      }]
    });

    // 2. User approves in wallet (MetaMask-style)
    // 3. Transaction signed & broadcast
    return action.txid;
  }
}
```

### Phase 7: Enable AI Queries (Payment Channels)
**Goal:** Passive income from third-party queries

```typescript
// backend/src/api/overlay-queries.ts
app.get('/api/v1/overlay/instructors/search',
  paymentChannelMiddleware, // Deducts 0.5 sats
  async (req, res) => {
    const instructors = await lookupService.searchInstructors({
      zipCode: req.query.zipCode,
      radius: req.query.radius
    });

    res.setHeader('X-Query-Cost', '0.5'); // sats
    res.json(instructors);
  }
);
```

---

## Summary: Three-Layer Data Model

| Data Type | PostgreSQL | Blockchain | MongoDB |
|-----------|-----------|-----------|---------|
| **Student PII** | ✅ Full data | ❌ Never | ❌ Never |
| **Student Hash** | ✅ Reference | ✅ On-chain | ✅ Indexed |
| **Lesson Details** | ✅ Full data | ❌ Never | ❌ Never |
| **Lesson Hash** | ✅ Reference | ✅ On-chain | ✅ Indexed |
| **Lesson Timestamp** | ✅ Full | ✅ On-chain | ✅ Indexed |
| **Payment Amount** | ✅ Full | ✅ On-chain | ✅ Indexed |
| **Protocol Fees** | ✅ Tracking | ✅ On-chain | ✅ Indexed |
| **Certificates** | ✅ Reference | ✅ BRC-52 | ✅ Indexed |
| **Instructor Notes** | ✅ Full data | ❌ Never | ❌ Never |
| **Instructor License** | ✅ Full | ✅ Hash only | ✅ Hash only |
| **Search Indexes** | ❌ Too slow | ❌ Not needed | ✅ Optimized |

---

**Last Updated:** February 2, 2026
**Status:** Design Complete, Ready for Phase 2 Implementation
**Next Steps:** Execute Phase 2 migration (add blockchain hash columns)
