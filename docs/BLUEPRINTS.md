# Budget Drive Protocol (BDP) - Technical Blueprints

**Status:** Research & Development  
**Confidentiality:** Patent Pending (USPTO Q1 2026)

---

## 0. Built Features

Everything in this section is shipped and running today, distinct from the patent-pending research/roadmap sections below.

### Jurisdiction-Aware Student Progress
Progress is derived live at read time, never stored as a running total (`students.total_hours_completed` is a dead column). A student's age is computed from `date_of_birth`: minors progress on an **hours track** against a tenant-configurable `default_hours_required`; adults (18+) have no mandated hours and progress on a **lessons track** (booked vs. completed lesson count). `computeStudentProgress` in `backend/src/services/studentProgressService.ts` is the single source of truth — every UI surface (student list, cards, detail view) consumes its output rather than recomputing. An admin can pin a student to either track via `track_override`, independent of age.

**Display rule — one language in the list, hours preserved on the record.** The Students list (table and card views, both rendered through the single shared `StudentProgressBar` component) always speaks in **lesson counts** — `"X / Y lessons"` — for every student regardless of track, since mixing "X of Y hrs" and "X of Y lessons" in the same list read inconsistently. For a minor, `Y` is `lessonsRequired`, derived by `computeStudentProgress` as `ceil(hoursRequired * 60 / standardLessonLengthMinutes)` (a new tenant setting, default 120 minutes — see ARCHITECTURE.md §6). The underlying **hours figure is never dropped**: it remains on the `StudentProgress` payload (`hoursCompleted`/`hoursRequired`/`hoursScheduled`), stays visible on the student detail record alongside the lesson count (it's the legally binding number for California minors, not the lesson count), and is still what the turning-18 alert compares against. Because lesson durations vary, a minor can satisfy their required lesson *count* while still short of their required *hours* (three 90-minute lessons is 4.5 of a 6-hour requirement) — the detail record flags this mismatch explicitly so a program is never marked complete on lesson count alone.

### Turning-18 Alerts
The dashboard surfaces students who are 18+ but still mid-program on the hours track with unbooked required hours remaining, so an admin can consciously decide whether to keep them on the hours track, switch them to the lessons track, or mark the program complete — a decision the system never makes automatically.

### No-Show Follow-Up Alerts
Marking a lesson `no_show` creates a dismissable notification (using the platform's existing, previously-unused `notifications` table) surfaced on the dashboard. The alert clears automatically once that student's next lesson is booked, or can be dismissed manually.

### Program Completion with Verification
Completion is an explicit admin action (`POST /students/:id/complete`, reversible via `POST /students/:id/reopen`) with an optional reason, not an automatic hours-threshold inference — an admin verifies and records why a student's program ended.

### Guardians as First-Class Records
Students can be linked to one or more guardian records (parents/legal guardians), replacing flat emergency-contact strings with structured, searchable, many-to-many data. See `docs/ARCHITECTURE.md` for the schema. Key principles:
- **Guardian matching and linking logic lives entirely in the backend service layer** — never in a UI component — so the same logic can be reused by a future public signup form without risking duplicate guardian records.
- **Matching never merges automatically.** Searching by name/email/phone surfaces candidate guardians with disambiguating context (which students they're already linked to); a human always makes the explicit decision to link.
- Minors require at least one linked guardian before their program can be marked complete (not before creation — a new minor student can exist guardian-less while the guardian is being set up, surfaced via a `needsGuardian` flag).
- Exactly one guardian per student can be marked primary.
- A combined `GET /search/people` endpoint searches students and guardians together by name, email, or phone, so front-desk staff don't have to choose a page before searching.
- **Atomic creation:** `POST /students/with-guardian` creates a student and creates-or-links a guardian in a single database transaction — a failure at any step leaves nothing persisted, so a student can never end up saved with a guardian half-linked. This is additive alongside the original `POST /students`, which is unchanged and still used whenever a guardian isn't being linked at creation time (adults; minors whose guardian setup is deferred to a walk-in-style follow-up).
- **Full frontend UI**: a Students | Guardians segmented tab (sharing the Students page's shell, not a new nav item), guardian detail with linked-students and an "Enroll another student" action, a student-form guardian type-ahead (walk-in flow) and guardian-first prefilled enrollment (phone-call flow), a duplicate-guardian confirmation step, sibling display, and the unified cross-entity search wired into the shared search bar.

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

## 3. Future Ecosystem

### Advanced Onboarding
- **Automated Verification:** Self-service registration with automated wallet generation.
- **Dynamic Portals:** White-label, tenant-specific subdomains with custom branding.

### Agentic Marketplace
- **Global Discovery:** AI-driven student-to-school matching.
- **ACO (Agentic Commerce Optimization):** Machine-readable protocol feeds.
- **Engagement Rewards:** Stable credit tokens (MNEE) for retention.

---

## 4. Identity & Verifiable Credentials (BRC-52)
BDP will issue digital certificates for:
- Course Completion (Students)
- Teaching Credentials (Instructors)
- Fleet Maintenance Records (Vehicles)

These credentials are cryptographically signed and stored in a privacy-preserving format, allowing for instant third-party verification (e.g., by insurance companies or DMVs) without sharing PII.

---

**This document represents the long-term vision and patent-protected innovations of the BDP project.**
