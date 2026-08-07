# Budget Drive Protocol (BDP) - Technical Architecture

**Version:** 2.1  
**Last Updated:** March 2026  
**Status:** Authoritative Technical Reference

---

## 1. System Overview

BDP is a multi-tenant driving school management platform designed with a **Hybrid Data Layer**. It balances operational performance and privacy with blockchain-backed immutability and auditability.

### Core Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js 18, Express, TypeScript
- **Primary DB:** PostgreSQL 14 (Multi-tenant operational data)
- **Overlay DB:** MongoDB (Indexed blockchain data for AI/Third-party queries)
- **Blockchain:** BSV (Overlay Services architecture via `@bsv/sdk` and `@bsv/overlay-express`)

---

## 2. The Hybrid Data Layer

BDP uses a Three-Layer Architecture to manage data based on privacy, speed, and audit requirements.

| Layer | Technology | Purpose | Key Data |
|-------|------------|---------|----------|
| **Operational** | PostgreSQL | Fast queries, PII protection | Student names, addresses, performance notes, real-time schedule state. |
| **Audit/Financial** | BSV Blockchain | Immutable truth, timestamps | Booking hashes, payment proofs, Merkle proofs, certificates, protocol fees. |
| **Overlay Index** | MongoDB | Queryable audit trail | Indexed hashes, SPV proofs, aggregated stats for AI agents/DMV. |

### Data Sovereignty Framework
We follow a strict "Where Does This Data Go?" decision tree:
- **Financial/Payment?** → Blockchain + MongoDB index.
- **Provable/Verifiable?** → Hash on Blockchain, full data in PostgreSQL.
- **Personal Identifiable Info (PII)?** → PostgreSQL only (Private).
- **High-Volume Operational?** → PostgreSQL (Fast).

---

## 3. BSV Standards & Protocols

BDP adheres to modern BRC standards to ensure interoperability within the BSV ecosystem.

### Key Standards
- **BRC-100:** Unified Wallet-to-Application Interface. Used for user auth and transaction signing.
- **BRC-52:** Identity & Verifiable Credentials. Used for instructor licenses and course completion certificates.
- **BRC-22 (SHIP):** Synchronizes Hosting for Indexing Peers. Broadcasts transactions to overlay hosts.
- **BRC-24 (SLAP):** Service Lookup Availability Protocol. Discovers available lookup services.
- **BEEF:** Background Evaluation Extended Format. The standard transaction envelope format.

### Protocol Prefixes & Fees
| Prefix | Action | Fee (sats) |
|--------|--------|------------|
| `BDP_BOOK` | Lesson Booking | 5 |
| `BDP_PAY` | Payment Record | 3 |
| `BDP_CERT` | Certificate Issuance | 10 |
| `BDP_NOTIFY` | Notification Sent | 1 |
| `BDP_PROGRESS`| Student Milestone | 2 |

---

## 4. Overlay Services Architecture

The "Overlay" consists of **Topic Managers** (admittance) and **Lookup Services** (indexing/querying).

### Topic Managers (Validation)
Decide which transaction outputs enter the overlay.
- **`tm_bdp_lessons`**: Validates `BDP_BOOK` structure (tenantId, studentHash, fee >= 5 sats).
- **`tm_bdp_payments`**: Validates `BDP_PAY` structure (amount, currency, fee >= 3 sats).
- **`tm_bdp_certs`**: Validates BRC-52 certificate signatures and protocol fees.

### Lookup Services (Querying)
Answer queries about the admitted data.
- **`ls_bdp_lessons`**: Queries lessons by `studentHash`, `instructorHash`, or `date_range`.
- **`ls_bdp_payments`**: Queries financial history and payment proofs.

---

## 5. Security & Privacy

### Hashing Strategy
To maintain student privacy while providing a public audit trail, we use sha256 hashes for identifiers on-chain:
- **`blockchain_student_hash`**: `sha256(student_id + salt)`
- **`blockchain_lesson_hash`**: `sha256(lesson_id + start_time + parties)`

### Role-Based Access Control (RBAC)
- **Owners:** Full access to multi-tenant school settings and financial data.
- **Instructors:** Access restricted to their own schedules, students, and earnings.
- **Staff:** Configurable access to operational data (Students/Vehicles).

---

## 6. Student Progress & Lifecycle

Student progress is derived live, never stored as a running total. `students.total_hours_completed` is a dead legacy column — nothing writes to it.

- **Track derivation** (`backend/src/services/studentProgressService.ts`, `computeStudentProgress`): a student's age is computed live from `date_of_birth` (never persisted). Minors (under 18, or `date_of_birth` null) progress on an **hours track** against `students.hours_required`, defaulted at creation from the tenant's `tenant_settings.default_hours_required`. Adults (18+) progress on a **lessons track** — booked-lesson count vs. completed-lesson count, since adults have no mandated hour minimum. A `students.track_override` column (`'hours' | 'lessons' | null`) lets an admin pin a student to a track regardless of age (used at the turning-18 boundary).
- **Completion**: `students.completed`/`completed_at`/`completed_by`/`completion_reason` are the sole source of truth for program completion — not an hours-threshold auto-derivation. `POST /students/:id/complete` and `POST /students/:id/reopen` set/clear these columns.
- **Read-path attachment**: every student read path (`getAllStudents`, `getStudentById`, `getStudentsByStatus`, `getStudentsByInstructor`) attaches a computed `progress` object via one batched query against `lessons` (not N+1).
- **Notifications**: the `notifications` table (fully defined in the baseline schema, previously unused) is now live. `backend/src/services/notificationService.ts` creates a `follow_up_due` notification when a lesson is marked `no_show`, auto-dismissed when that student's next lesson is booked. `backend/src/services/dashboardService.ts` — the first dedicated backend aggregation service — joins `lessons.status='no_show'` against active notifications to surface a no-show follow-up alert list.
- **New endpoints**: `POST /api/v1/students/:id/complete`, `POST /api/v1/students/:id/reopen`, `GET /api/v1/dashboard/no-show-alerts`, `POST /api/v1/dashboard/alerts/:notificationId/dismiss`.

---

**Note:** For implementation guides and roadmaps, see [BLOCKCHAIN.md](BLOCKCHAIN.md). For operational user guides, see [OPERATIONS.md](OPERATIONS.md).
