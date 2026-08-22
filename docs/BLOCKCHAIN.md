# Budget Drive Protocol (BDP) - Blockchain Implementation Manual

**Status:** Protocol Specification & Integration Guide
**Primary Standards:** BRC-100, BRC-52, BRC-22 (SHIP), BRC-24 (SLAP)

---

## 1. Integration Progress

### Core Protocol (Beta)
- **Infrastructure:** Overlay Express with MongoDB integration.
- **Topic Managers:** Production-ready `tm_bdp_lessons` and `tm_bdp_payments`.
- **Lookup Services:** Multi-tenant query layer for operational audit.
- **Wallet Integration:** BRC-100 compliant authentication and signing.

### Extended Functionality
- **Structured Data:** Schema.org JSON-LD profiles for global AI discoverability.
- **Active Micropayments:** Sub-satoshi fee models for agentic queries.
- **Verifiable Identity:** BRC-52 digital certificates for certified instruction.

### Automated Commerce
- **Agentic Booking:** Secure lesson booking via autonomous AI agents.
- **Network Growth:** Optimized for 10,000+ school nodes and high-frequency queries.

---

## 2. Micropayment Fee Schedule

BDP uses **fixed satoshi-level fees**, not percentage-based splits, to align with honest money principles.

| Prefix | Action | Fee (sats) | Purpose |
|--------|--------|------------|---------|
| `BDP_BOOK` | Lesson Booking | 5 | Computational cost of booking audit. |
| `BDP_PAY` | Payment Record | 3 | Financial audit trail verification. |
| `BDP_CERT` | Certificate | 10 | High-value identity/completion proof. |
| `BDP_NOTIFY`| Notification | 1 | Micro-cost for communication logs. |
| `BDP_QUERY` | AI Search | 0.5 | Passive income from market data queries. |

---

## 3. Developer Quick-Start

### Setting Up Local Development (LARS)
1.  **Install Tools:**
    ```bash
    npm install -g @bsv/lars
    npm install @bsv/sdk @bsv/overlay @bsv/overlay-express mongodb
    ```
2.  **Start Environment:**
    ```bash
    npx lars
    ```
    *LARS will launch local Docker containers for PostgreSQL and MongoDB, start your Overlay Express server, and provide an ngrok tunnel.*

> **Note:** `@bsv/bsv-claude-agents` is installed at repo root when BSV development resumes. The root `package.json`/lockfile were removed during a dependency cleanup while the ledger is disabled (`BSV_ENABLED=false`) — reintroduce them at that point.

### Creating a Topic Manager
```typescript
// backend/src/overlay/topic-managers/lessons.ts
export class BDPLessonTopicManager implements TopicManager {
  async identifyAdmissibleOutputs(beef: number[]): Promise<AdmittanceInstructions> {
    const tx = Transaction.fromBEEF(beef);
    // 1. Check for BDP_LESSON prefix
    // 2. Validate protocol fee (5 sats)
    // 3. Signal to admit output index to overlay
  }
}
```

---

## 4. Testing & Treasury Verification

### Treasury Action Logs
Use the following SQL to verify that Phase 1 "Virtual" satoshi fees are being tracked before Phase 2 "On-Chain" integration:

```sql
SELECT 
    bsv_action, 
    bsv_satoshis, 
    metadata->>'fee_model' as model,
    created_at 
FROM treasury_transactions 
ORDER BY created_at DESC;
```

### Verification Checklist
- [ ] Wallet connects via BRC-100
- [ ] Transaction broadcast via SHIP protocol
- [ ] Topic Manager admits output
- [ ] Lookup Service indexes hash in MongoDB
- [ ] Treasury balance reflects fee accumulation

---

## 5. Security Best Practices
- **No Private Keys in Git:** Use environment variables or HSMs.
- **PII Privacy:** Never put names, emails, or addresses on-chain. Store hashes only.
- **Rate Limiting:** Protect Lookup Services from query spam.

### Enrollment Completion as the Anchorable Attestation Unit

A student's program **enrollment** — not the student record itself — is the natural unit for future on-chain anchoring, per the Decision-Makers' Framework in [MISSION.md](MISSION.md): completion is a discrete, infrequent, high-value event (not a chokepoint, not a micro-fee action), and it's the fact a certificate would rest on. The groundwork for this is in place today with **no blockchain code written**:

- `enrollments.completion_hash` (nullable) is computed and stored by ordinary application code at completion time, via Node's built-in `crypto` module — no `@bsv/sdk`, no wallet, no network call. The hashed payload is exactly `{enrollmentId, programType, hoursCompleted, completedAt}` — internal IDs and non-PII scalars only, restating the "store hashes only" rule above concretely: no student name, email, phone, or address ever enters the hash or the row it's stored on.
- `enrollments.ledger_txid` (nullable) exists as a column but is written **nowhere** in the current codebase and stays permanently `NULL`. Populating it — the actual on-chain anchor — is deferred to a future session.
- **No PII on the enrollment row, ever.** `enrollments` carries only IDs, program-lifecycle enums/flags, numbers, and dates — no denormalized student name/email/address. A future anchor payload can reference an enrollment by its opaque `uuid` alone, with the person's identity resolvable only by an authorized lookup in PostgreSQL, never by the on-chain data itself.
- **The `LedgerService` interface needs zero changes** to support this in the future. `LedgerActionType` already reserves `'BDP_PROGRESS'` ("student progress update", 2 sats) with zero current callers — the natural landing spot for an enrollment-completion anchor call, whenever that's built. Until then, `enrollmentService.ts` (which owns completion) never imports `walletService`, `treasuryService`, or the `Ledger` seam directly — enforced by a static structural test, the same technique used elsewhere in this codebase to keep `fee_flags` isolated from revenue reporting.

### Certificate Recording as a Second Anchorable Attestation

Certificate issuance tracking (13 CCR §340.27 — see [ARCHITECTURE.md](ARCHITECTURE.md) §13 and [BLUEPRINTS.md](BLUEPRINTS.md)) follows the exact same groundwork-only pattern as enrollment completion above, applied to a second discrete, infrequent, high-value event: recording that a DMV certificate was issued.

- `certificates.completion_hash` (nullable) is computed and stored by ordinary application code the moment `certificateService.recordCertificate`/`recordVoid` runs, via the same Node `crypto` module, no `@bsv/sdk`, no wallet, no network call. The hashed payload is exactly `{certificateId, serialNumber, enrollmentId, issueDate}` — internal IDs and non-PII scalars only; a void certificate's payload simply omits `enrollmentId` (it has none), never substituting a student's name or other PII in its place.
- `certificates.ledger_txid` (nullable) exists as a column but is written **nowhere** in the current codebase and stays permanently `NULL`, identical to `enrollments.ledger_txid`'s status.
- **No PII on the certificate row, ever.** `certificates` carries only IDs, a serial number, dates, and lifecycle enums — no denormalized student name/email/address. A future anchor payload can reference a certificate by its opaque `uuid` alone.
- **No blockchain import anywhere in this path** — `certificateService.ts` and `transcriptService.ts` never import `walletService`, `treasuryService`, or the `Ledger` seam directly, matching the same isolation discipline as `enrollmentService.ts`'s own completion path and `fee_flags`' revenue isolation.
- `BDP_CERT` (10 sats, §2 above) is the fee schedule already reserved for a future certificate-issuance anchor call — like `BDP_PROGRESS`, currently unused by any real code path, since `BSV_ENABLED` stays `false` and nothing calls `LedgerService.issueCertificate` outside its own interface/no-op implementation and tests.

**For full technical specs, see [ARCHITECTURE.md](ARCHITECTURE.md).**
