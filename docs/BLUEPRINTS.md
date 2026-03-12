# Budget Drive Protocol (BDP) - Technical Blueprints

**Status:** Research & Development  
**Confidentiality:** Patent Pending (USPTO Q1 2026)

---

## 1. The 6-Dimensional (6D) Scheduling Engine

BDP implements a novel scheduling algorithm designed for high-availability fleets.

### Technical Specification
The engine resolves availability by checking six independent data dimensions:
- **I**nstructor (Schedule + Time Off)
- **V**ehicle (Fleet Availability)
- **S**tudent (Personal Schedule)
- **W**orking Hours (School Policy)
- **B**uffer Time (Transition Logistics)
- **C**apacity (Max students per day)

### Implementation Note
Unlike traditional calendars that manage time ranges, BDP is **Capacity-Based**. Admins set a start time, and the engine automatically generates optimal lesson slots based on the school's configured capacity and duration.

---

## 2. Merkle Tree Micropayment Aggregation

To enable sustainable micropayments (1-10 satoshis) without losing revenue to miner fees, BDP utilizes **Merkle Batching**.

### The Innovation
1.  **Leaf Generation:** Each protocol action (booking, payment, certify) generates a deterministic SHA-256 hash.
2.  **Aggregation:** Hashes are accrued in the database until a batch threshold (1 hour or 100 actions) is met.
3.  **Merkle Commitment:** A binary Merkle tree is built. The **Root Hash** is committed to the BSV blockchain in a single OP_RETURN transaction.
4.  **Verification:** Schools and students can verify their individual action against the on-chain Merkle Root using a provided proof path (sibling hashes).

### Economic Impact
- **Without Batching:** ~4,500 satoshi loss per 100 actions due to miner fees.
- **With Merkle Batching:** ~98% profit margin for the protocol.

---

## 3. Scale-Up Roadmap

### Phase 2: Essential Onboarding (Current)
- **Self-Service:** Automated sign-up, email verification, and wallet generation.
- **Branding:** Tenant-specific subdomains and custom-branded portals.

### Phase 3: Marketplace & AI
- **Student Portal:** A global marketplace where students discover schools via AI agents.
- **ACO (Agentic Commerce Optimization):** Machine-readable availability and pricing feeds for digital assistants (Siri, Alexa, ChatGPT).
- **Incentives:** Stable engagement credits (MNEE) to reward student retention.

---

## 4. Identity & Verifiable Credentials (BRC-52)
BDP will issue digital certificates for:
- Course Completion (Students)
- Teaching Credentials (Instructors)
- Fleet Maintenance Records (Vehicles)

These credentials are cryptographically signed and stored in a privacy-preserving format, allowing for instant third-party verification (e.g., by insurance companies or DMVs) without sharing PII.

---

**This document represents the long-term vision and patent-protected innovations of the BDP project.**
