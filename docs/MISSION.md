# Budget Drive Protocol (BDP) - Mission & Vision

**Status:** Official Project Manifest  
**Last Updated:** March 2026

---

## 🎯 The Core Vision

Budget Drive Protocol (BDP) is a **free-forever software protocol** for the driving instruction industry. We replace traditional, rent-seeking SaaS models with a decentralized system funded by satoshi-level micropayments on the **BSV Blockchain**.

### The Three Pillars

1.  **Massive Volume of Microtransactions**
    - **Usage-Based:** No monthly fees. Schools pay 5 satoshis (~$0.0000025) per lesson booking and 1 satoshi per notification.
    - **Scale-Driven:** Revenue is generated from volume (millions of actions), not by extracting high margins from individual users.
    - **Economic Viability:** Enabled only by BSV’s unlimited throughput and sub-cent fees.
    - **Status:** not live. `BSV_ENABLED=false`; no fees are being collected.

2.  **No Chokepoints (Sovereign Schools)**
    Decentralization here means no school depends on any single operator, including us, to keep its records, prove them, or leave. A school can always leave: export its records, verify its certificates independently through anchored proofs, and run the open-source software elsewhere. It is delivered in four layers:
    - **Ownership.** Each school's records belong to the school. The schema is open (it lives in this repository) and each school can export all of its data. *Status: schema done; per-school export planned.*
    - **Operational independence.** BDP is hosted for convenience, never as a requirement. The software is open source and configured through environment variables, so a school or a third-party host can run its own instance. A packaged installer will be built only if there is demand. *Status: hosted version done; self-hosting possible from source by a technical operator; deployment guide planned; installer on demand.*
    - **Verifiability.** Certificates and records are anchored on-chain so anyone can verify them without trusting the operator, and the proofs outlive the operator. *Status: planned; anchoring is not live yet.*
    - **Protocol openness.** A published specification so independent implementations can interoperate. *Status: future.*
    The unit of decentralization is the school. Inside a school, one shared source of truth is required (scheduling conflicts, roles, payments), so each school is a sovereign node, and the operator may host many nodes on their behalf.
    **Today:** BDP is hosted and operated centrally. This is a deliberate phase-1 choice, not the end state.

3.  **On-Chain Proof for Every Critical Action**
    Every critical business event (booking, completion, certificate issued or voided, record archived) is anchored on the BSV ledger as a proof: a hash plus non-personal facts such as certificate serial, school license number, and status. Personal data (names, contact details, addresses, individuals' license numbers, minors' records) never goes on-chain. It stays off-chain, where it can be corrected and deleted as the law requires.
    Third parties (insurers, regulators, AI agents) can pay to verify non-personal facts, for example "is certificate X valid, who issued it, has it been revoked." Personal details reach a verifier only with the student's consent, through selective disclosure (BRC-52 style certificates). Corrections and voids are new append-only status records, never edits.

---

## 🚀 Product Roadmap

### Operational Foundation (Implemented)
- **Multi-Tenant Core:** Complete isolation for individual driving schools.
- **Smart Scheduling:** Conflict-free booking with integrated instructor availability.
- **Admin Tools:** Management suites for students, instructors, vehicles, and payments.
- **Authentication:** Secure login (JWT + bcrypt).
- **Role-Based Access Control:** Enforced at the API layer (`owner` / `admin` / `instructor` / `staff` / `viewer`), with owner-role protections (last-owner cannot be removed or demoted, only an owner can grant ownership) and a team-management invite flow.
- **Driver Education Cohorts & Attendance:** Cohort scheduling (4 sessions per curriculum day) with per-session attendance tracking.
- **DMV Certificate Tracking:** Recording and void accounting for DL 400B/400C/400D certificates.
- **Archive:** Student record archiving with a stored hash of the archived state.
- **Payments Tracking:** Recording and reporting on payments received.
- **Google Calendar Sync:** Each instructor can connect their own Google account; lessons sync in real time to a dedicated calendar.
- **Dedicated Instructor Experience:** A focused My Schedule / My Students / My Profile shell, scoped to each instructor's own data.

### Blockchain Integration (groundwork in place, not yet live)

**Done:**
- Hashes computed at completion, certificate issuance, and archive (`enrollments.completion_hash`, `certificates.completion_hash`, `students.archive_hash`).
- Reserved `ledger_txid` columns, written nowhere today.
- The `LedgerService` seam, with a no-op implementation as the active default.
- `BSV_ENABLED=false`.
- Wallet-key startup safety (the app refuses to start if BSV is enabled without a configured key; no key is ever auto-generated or logged).

**Planned:**

- Overlay topic managers and lookup services.
- On-chain anchoring.
- Public verification.
- BRC-52 certificates.
- Treasury and micro-fee collection.
- School wallets.

### Network Ecosystem (Future)
- **Student Marketplace:** Direct booking portal connecting students with verified schools.
- **AI-Driven Optimization:** Automated route planning and resource allocation.
- **Enterprise Integration:** Direct data feeds to insurance and regulatory providers.

---

## 🧭 Decision-Makers’ Framework

When adding features or refactoring, we use these principles:
- **Does it increase transaction volume?** (Usage = Growth)
- **Is it a chokepoint?** (Avoid centralization at all costs)
- **Is it a micro-fee action?** (Every interaction should have a tiny, transparent cost)
- **Does it scale horizontally?** (Design for 100,000+ tenants)
- **Does personal data stay off-chain?**
- **Does every proof state what it establishes and what it does not?**

**How we apply this:**
1. Personal data stays in Postgres, where it can be corrected or deleted.
2. On-chain goes only hashes, certificate serials, the school's license number, and status events.
3. Voids and corrections are new append-only records, never edits.
4. Every proof states its scope and trust boundary: it shows that a record existed in this form at this time, as attested by a licensed school. It does not show the underlying facts are true.
5. Anchoring granularity follows fee economics: anchor each meaningful event, since BSV fees make that practical.
6. Verifiers see the minimum, and students control disclosure.

---

**"We are building the first real Bitcoin business. Every driving instructor on the planet will use this software because it's free and the best."**
