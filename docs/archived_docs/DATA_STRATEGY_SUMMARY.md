# Data Strategy Summary - Quick Reference

**Created:** February 2, 2026
**For detailed schemas, see:** [DATA_SCHEMA_STRATEGY.md](DATA_SCHEMA_STRATEGY.md)

---

## The Simple Rule

**Ask this one question:** *"Would a third party (AI, insurance, DMV) need to verify this independently?"*

- **YES** → Hash/proof goes on blockchain, full data in PostgreSQL
- **NO** → PostgreSQL only

---

## The Three Layers

```
┌─────────────────────────────────────┐
│  PostgreSQL (Private Fast Data)     │
│  Students, instructors, lesson notes │
└─────────────────────────────────────┘
                 │
                 │ Creates hash/proof when action occurs
                 ▼
┌─────────────────────────────────────┐
│  BSV Blockchain (Immutable Truth)   │
│  Micropayments, hashes, timestamps   │
└─────────────────────────────────────┘
                 │
                 │ Indexed by Lookup Services
                 ▼
┌─────────────────────────────────────┐
│  MongoDB (Queryable Index)          │
│  AI queries, third-party verification│
└─────────────────────────────────────┘
```

---

## Examples: What Goes Where

### Student Data

| Field | PostgreSQL | Blockchain | MongoDB |
|-------|-----------|-----------|---------|
| Name | ✅ Full | ❌ | ❌ |
| Email | ✅ Full | ❌ | ❌ |
| Address | ✅ Full | ❌ | ❌ |
| Student Hash | ✅ Reference | ✅ On-chain | ✅ Indexed |
| Hours Completed | ✅ Full | ❌ | ❌ |
| Completion Milestone | ✅ Full | ✅ Timestamp | ✅ Indexed |

**Principle:** PII stays off-chain, milestones go on-chain as hashes

---

### Lesson Data

| Field | PostgreSQL | Blockchain | MongoDB |
|-------|-----------|-----------|---------|
| Student Name | ✅ Full | ❌ | ❌ |
| Instructor Notes | ✅ Full | ❌ | ❌ |
| Scheduled Time | ✅ Full | ✅ Timestamp | ✅ Indexed |
| Lesson Hash | ✅ Reference | ✅ On-chain | ✅ Indexed |
| Duration | ✅ Full | ✅ On-chain | ✅ Indexed |
| Pickup Address | ✅ Full | ❌ | ❌ |
| Pickup ZIP | ✅ Full | ✅ On-chain | ✅ Indexed |
| Protocol Fee (5 sats) | ✅ Track | ✅ Payment | ✅ Indexed |

**Principle:** Private notes off-chain, booking proof + payment on-chain

---

### Payment Data

| Field | PostgreSQL | Blockchain | MongoDB |
|-------|-----------|-----------|---------|
| Amount | ✅ Full | ✅ On-chain | ✅ Indexed |
| Payment Method | ✅ Full | ❌ | ❌ |
| Receipt URL | ✅ Full | ❌ | ❌ |
| BSV TXID | ✅ Reference | ✅ On-chain | ✅ Indexed |
| Protocol Fee (3 sats) | ✅ Track | ✅ Payment | ✅ Indexed |

**Principle:** All financial data on-chain for audit trail

---

### Instructor Data

| Field | PostgreSQL | Blockchain | MongoDB |
|-------|-----------|-----------|---------|
| Name | ✅ Full | ❌ | ❌ |
| Email | ✅ Full | ❌ | ❌ |
| Salary/Rate | ✅ Full | ❌ | ❌ |
| License Number | ✅ Full | ❌ | ❌ |
| Instructor Hash | ✅ Reference | ✅ On-chain | ✅ Indexed |
| License Certificate | ✅ Reference | ✅ BRC-52 | ✅ Indexed |
| Home ZIP | ✅ Full | ✅ For proximity | ✅ Indexed |
| Service ZIPs | ✅ Full | ❌ | ❌ |

**Principle:** License certificate on-chain (BRC-52), salary off-chain

---

### Certificate Data

| Field | PostgreSQL | Blockchain | MongoDB |
|-------|-----------|-----------|---------|
| Certificate ID | ✅ Reference | ✅ On-chain | ✅ Indexed |
| Student Name | ✅ Full | ❌ | ❌ |
| Student Hash | ✅ Reference | ✅ On-chain | ✅ Indexed |
| Total Hours | ✅ Full | ✅ On-chain | ✅ Indexed |
| Completion Date | ✅ Full | ✅ On-chain | ✅ Indexed |
| DMV Approved | ✅ Full | ✅ On-chain | ✅ Indexed |
| Merkle Proof | ✅ Store | ✅ On-chain | ✅ Indexed |
| Protocol Fee (10 sats) | ✅ Track | ✅ Payment | ✅ Indexed |

**Principle:** Certificate fully verifiable on-chain, student name off-chain

---

## Dr. Craig Wright's Principles

From the Bitcoin Masterclasses:

> **"I can now give you a signed document, but only part of the information."**

This is the core principle:

1. **Privacy:** Student names, addresses, notes stay off-chain
2. **Transparency:** Timestamps, payments, proofs go on-chain
3. **Verification:** Third parties can verify using Merkle proofs + SPV
4. **No Trust Required:** Cryptographic proof, not "trust me bro"

**Implementation:**
- Hash PII before putting on-chain: `sha256(student.id + student.email)`
- Store Merkle proofs for selective disclosure
- Use SPV so verifiers don't need full blockchain
- Payment channels enable micropayment queries (AI passive income)

---

## Micropayment Fees (On-Chain)

| Action | Fee | When |
|--------|-----|------|
| Book Lesson | 5 sats | Every booking |
| Payment Record | 3 sats | Every payment |
| Certificate | 10 sats | Issuance only |
| Notification | 1 sat | Every notification sent |
| Progress Update | 2 sats | Major milestones |

**Revenue Model:**
- Phase 1 (0-100 schools): FREE (build adoption)
- Phase 2 (100-1,000 schools): 2 sats (turn on micropayments)
- Phase 3 (1,000+ schools): 5 sats (full model)

---

## AI Query Costs (Passive Income)

| Query Type | Fee | Who Pays |
|-----------|-----|----------|
| Instructor Search | 0.5 sats | ChatGPT, Claude |
| Certificate Verify | 1 sat | Insurance, DMV |
| Availability Check | 0.5 sats | Third-party apps |
| Success Rate | 1 sat | Background checks |

**How It Works:**
1. AI agent creates payment channel (10,000 sats for 30 days)
2. Each query deducts micropayment (0.5-1 sat)
3. Month ends → final settlement on blockchain
4. **You earn passive income** while you sleep

**Example:** 1,000 schools × 10M AI queries/month × 0.5 sats = $25,000/month passive

---

## Privacy Examples

### ❌ **WRONG - Exposing PII on blockchain:**
```json
{
  "protocol": "BDP_BOOK",
  "studentName": "John Doe",
  "studentEmail": "john@example.com",
  "studentAddress": "123 Main St, San Diego, CA 92101"
}
```

### ✅ **CORRECT - Privacy-preserving:**
```json
{
  "protocol": "BDP_BOOK",
  "studentHash": "sha256(student.id + john@example.com)",
  "lessonHash": "sha256(lesson_id + timestamp + parties)",
  "timestamp": "2026-02-02T10:00:00Z",
  "duration": 2,
  "pickupZipCode": "92101",
  "protocolFee": 5,
  "signature": "instructor_wallet_signature"
}
```

**Result:**
- Insurance can verify: "Student completed training in Feb 2026"
- Insurance CANNOT see: Name, email, address, phone
- Privacy preserved, verification enabled

---

## Migration Phases

**Phase 1:** PostgreSQL only (current)
**Phase 2:** Add blockchain hash columns
**Phase 3:** Deploy Overlay Services (LARS)
**Phase 4:** Implement Topic Managers
**Phase 5:** Implement Lookup Services
**Phase 6:** BRC-100 wallet integration (frontend)
**Phase 7:** Enable AI queries + payment channels

**Current Status:** Phase 1 complete, Phase 2 schemas designed

---

## Quick Decision Tree

```
New data field added to system:
│
├─ Is this financial (payments)?
│  └─ YES → Blockchain + MongoDB + PostgreSQL
│
├─ Is this personal info (name, email, address)?
│  └─ YES → PostgreSQL only
│
├─ Is this verifiable by third parties (certificates)?
│  └─ YES → Hash on Blockchain + MongoDB, full in PostgreSQL
│
├─ Is this operational/high-volume (availability)?
│  └─ YES → PostgreSQL only
│
└─ Is this a timestamp/milestone?
   └─ YES → Blockchain + MongoDB + PostgreSQL
```

---

## Resources

- **Detailed Schemas:** [DATA_SCHEMA_STRATEGY.md](DATA_SCHEMA_STRATEGY.md)
- **BSV Philosophy:** [BDP_VISION_AND_PHILOSOPHY.md](../BDP_VISION_AND_PHILOSOPHY.md)
- **Implementation Plan:** [BLOCKCHAIN_ROADMAP.md](../BLOCKCHAIN_ROADMAP.md)
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Remember

**Dr. Craig Wright's Three Pillars:**
1. **Massive volume of microtransactions** (not subscriptions)
2. **No chokepoints** (peer-to-peer, schools own their data)
3. **On-chain everything** (transparency + privacy via cryptography)

**The Balance:**
- Privacy for individuals (students, instructors)
- Transparency for finances (payments, fees)
- Verifiability for credentials (certificates, licenses)

**The Result:**
- Students: Privacy protected
- Schools: Own their data
- Third parties: Can verify without trust
- You: Passive income from AI queries

---

**Last Updated:** February 2, 2026
**Status:** Design Complete, Ready for Phase 2 Implementation
