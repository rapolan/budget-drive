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
- **Lesson-equivalent view** (`tenant_settings.standard_lesson_length_minutes`, integer, default 120): a new tenant setting, same discrete-column pattern as `default_hours_required` — deliberately a separate column from `scheduling_settings.default_lesson_duration` (which drives the booking form's default duration; different table, different purpose, may hold a different value on purpose). `computeStudentProgress` uses it to derive `lessonsRequired = ceil(hoursRequired * 60 / standardLessonLengthMinutes)` for minors, attached to the `StudentProgress` payload alongside the existing hours fields (never replacing them) so every UI surface can display a lesson count without any surface recomputing it. Adults' `lessonsRequired` is simply an alias for their existing `lessonsBooked`. `percentComplete` is derived from the lesson-count view on both tracks, so display surfaces never need to branch on track to pick which percent to trust.
- **Completion**: `students.completed`/`completed_at`/`completed_by`/`completion_reason` are the sole source of truth for program completion — not an hours-threshold auto-derivation. `POST /students/:id/complete` and `POST /students/:id/reopen` set/clear these columns.
- **Read-path attachment**: every student read path (`getAllStudents`, `getStudentById`, `getStudentsByStatus`, `getStudentsByInstructor`) attaches a computed `progress` object via one batched query against `lessons` (not N+1).
- **Notifications**: the `notifications` table (fully defined in the baseline schema, previously unused) is now live. `backend/src/services/notificationService.ts` creates a `follow_up_due` notification when a lesson is marked `no_show`, auto-dismissed when that student's next lesson is booked. `backend/src/services/dashboardService.ts` — the first dedicated backend aggregation service — joins `lessons.status='no_show'` against active notifications to surface a no-show follow-up alert list.
- **New endpoints**: `POST /api/v1/students/:id/complete`, `POST /api/v1/students/:id/reopen`, `GET /api/v1/dashboard/no-show-alerts`, `POST /api/v1/dashboard/alerts/:notificationId/dismiss`.

---

## 7. Tenant Timezone Authority

Every date, "today"/"tomorrow" calculation, wall-clock interpretation, and derived age in this codebase resolves against the **tenant's** configured timezone (`tenant_settings.timezone`) — never the server's own timezone, and never the browser's. This must hold regardless of what physical machine or region the Node process happens to run in, since the product is sold to driving schools nationwide. `timezone` is nullable and, as of migration 011, has no DB-level default — a newly created tenant starts with it genuinely unset (see "Timezone auto-detect" below); `resolveTenantTimezone` is what turns that `null` into a concrete zone for actual date math.

### Wall-clock storage, tenant-relative interpretation

**Storage is unchanged and does not encode a timezone.** The 84 `timestamp without time zone` columns, plus every `date`/`time` column, remain exactly as they are — a 2pm lesson is stored as wall-clock `14:00:00` and stays `14:00:00` across a daylight-saving transition. This is the correct design for scheduling: a lesson booked for "2pm" means 2pm in the tenant's own clock, not a fixed instant that would silently drift an hour twice a year. What changed is **interpretation** — which timezone a stored wall-clock value or a computed "today" is understood to mean when it's read, compared, or converted to/from a real UTC instant.

### The helper module — the single entry point

All tenant-timezone date math lives in **one** module: `backend/src/utils/tenantTime.ts`. No other backend file reimplements offset/DST logic, and none of it is ported into the frontend. Built on `date-fns` + `date-fns-tz`, which read the IANA tzdata bundled with Node's own ICU build — the same source of truth browsers and operating systems use, rather than hand-rolled and inevitably incomplete offset arithmetic.

Primitives exported:
- `resolveTenantTimezone(timezone)` — the configured zone, or the documented default (`DEFAULT_TENANT_TIMEZONE = 'America/Los_Angeles'`) when `null`/`undefined`/empty. This is the only place an unset timezone becomes a concrete zone for real date math.
- `tenantToday(timezone, reference?)` / `tenantTomorrow(timezone, reference?)` — today's/tomorrow's date as `YYYY-MM-DD` in the tenant's zone.
- `addTenantDays(dateStr, days, timezone)` — walks a date string forward/backward within the tenant's zone (used for day-by-day iteration instead of mutating a `Date` with `setDate`).
- `formatInTenantZone(date, timezone, formatStr?)` — formats a real UTC instant (a `Date`) as a string in the tenant's zone. Never `toISOString().split('T')[0]` for this — that reads the UTC calendar date, which differs from the tenant's for roughly half of every day.
- `zonedWallClockToUtc(dateStr, timeStr, timezone)` — the inverse: given a tenant wall-clock date+time, returns the correct UTC instant. This is the primitive that fixes slot serialization and lesson storage; it replaces both `new Date(); date.setHours(...)` (which sets the *process's* local time) and naive `` `${date}T${time}` `` string parsing (ambiguous — parsed as either UTC or process-local depending on the exact string shape).
- `tenantMonthBoundaries(timezone, reference?)` — start/end of a month in the tenant's zone, correct even when the reference instant's UTC month differs from the tenant's.
- `tenantDayOfWeek(dateStr, timezone)` — day-of-week for a date string, resolved in the tenant's zone rather than the process's.
- `parseTenantDateOnly(dateStr)` — parses a `YYYY-MM-DD` string into a `Date` at UTC midnight of that calendar date, for callers (e.g. `calculateAge`) that need to compare year/month/day components, not a real instant.

One exception is explicitly safe and does **not** go through the helper: extracting the calendar date from a plain Postgres `DATE` column value (e.g. `lessons.date`, `recurring_lesson_patterns.start_date`). A `Date` instance `pg` returns for a `DATE`-typed column is always UTC midnight of that calendar date — there's no wall-clock time attached, so `toISOString().split('T')[0]` carries no roll risk there specifically. This is called out inline with a comment everywhere it's used, so it isn't "fixed" by a future reader who doesn't realize the distinction. Contrast this with the same pattern applied to a real timestamp/instant value (e.g. a lesson's resolved start time), which *is* a live bug this module exists to eliminate.

### Where this applies

- **Scheduling** (`schedulingService.ts`): slot generation, date-range interpretation, "today"/"tomorrow" search-window origin, and conflict-detection date/time-string derivation all resolve in the tenant's zone.
- **Lesson storage** (`lessonService.ts`): a lesson's stored `date`/`start_time`/`end_time` are derived from the tenant zone consistently (previously the most severe bug found — the date was read in UTC while the time was read in server-local time, an internal inconsistency that could store a lesson on the wrong calendar day).
- **Lesson invites and calendar feeds** (`lessonInviteService.ts`, `calendarFeedService.ts`): invite date text and `.ics` `DTSTART`/`DTEND` resolve in the tenant zone. Both emit `DTSTART`/`DTEND` as UTC instants (`Z`-suffixed, RFC-5545-legal) rather than hand-rolling a `VTIMEZONE` block with baked-in DST transition rules for one hardcoded zone — every mainstream calendar client renders a UTC-suffixed `DTSTART` correctly in the viewer's own local time, and this approach doesn't require re-deriving IANA's DST rules for 400+ zones.
- **Recurring lesson patterns** (`recurringPatternService.ts`): generated lessons' end-time computation (start time + duration) resolves in the tenant zone.
- **Student age** (`studentProgressService.ts`'s `calculateAge`): a student's age — which gates the adult-email requirement and the hours/lessons progress track — transitions on the tenant's calendar day, not the server's or UTC's.
- **Review queue** (`dashboardService.ts`'s `getLessonsNeedingReview`): "has this scheduled lesson's end time already passed" resolves in the tenant zone via `zonedWallClockToUtc`, then plain instant comparison against "now" — never a client-side date check.
- **Cancellation fee window** (`lessonService.ts`'s `cancelLesson`): "is this cancellation within N hours of the lesson's start" resolves the lesson's start as a real UTC instant the same way, then compares the millisecond delta against `tenant_settings.cancellation_fee_window_hours`.

### Server timezone is irrelevant by design

The server process runs with `TZ=UTC` (`.env.example`, `.env.test`, and the CI workflow's job-level `env`) — not because UTC is privileged, but to make "the server's own timezone must never matter" an enforced, testable fact rather than an incidental one that happens to hold only on whichever machine a developer's shell defaults to. A structural test (`backend/src/__tests__/noServerLocalDateDerivation.test.ts`) statically scans every file in the list above for `toISOString().split('T'`, `.getFullYear()`/`.getMonth()`/`.getDate()`/`.getDay()`, and bare `new Date()` outside a small, explicitly documented allowlist (DATE-column extraction, RFC 5545 `DTSTAMP`, instant-vs-"now" comparisons, and the helper module's own default-reference parameters). A companion hostile-clock test suite (`tenantTimeHostileClock.test.ts`) exercises the helper primitives, `calculateAge`, and slot generation against `America/New_York` (DST-observing) and `America/Phoenix` (no DST) tenants while the process itself runs UTC, including at instants where the UTC calendar date and the tenant's disagree.

### Timezone auto-detect (Settings UI convenience, not an exception to the rule above)

`frontend/src/pages/Settings.tsx`'s General tab is the one place the frontend is allowed to call `Intl.DateTimeFormat().resolvedOptions().timeZone` — and even there, the result is never used for date math, only to pre-populate a suggestion an admin must explicitly accept and then explicitly save. The suggestion banner renders only while `tenant_settings.timezone` is `null` (never configured — see migration 011, which dropped the column's DB-level default so a new tenant starts unset instead of silently landing on the old Pacific default). Accepting the suggestion sets the ordinary form field; nothing is persisted or treated as authoritative until the existing `PUT /tenant/settings` save path runs, going through the same `Intl.supportedValuesOf('timeZone')` validation as any manually-typed zone. Existing tenants already sitting at the pre-migration default value are not backfilled to `null` and so never see the suggestion — there's no way to tell whether that value was an explicit choice.

### Frontend consumption: `tenantNow`, never the browser's own clock

The frontend never computes a timezone boundary itself — every "today"/"this week"/"this month" surface renders a value the backend already resolved. `GET /api/v1/tenant/settings` returns a `tenantNow` object (`tenantService.getTenantNow`, a thin composition of the primitives above) alongside the existing settings payload:

```ts
interface TenantNow {
  timezone: string;
  today: string;       // YYYY-MM-DD
  tomorrow: string;     // YYYY-MM-DD
  currentTime: string;  // HH:MM, tenant wall-clock
  weekStart: string;    // YYYY-MM-DD, Sunday-start (see note below)
  weekEnd: string;      // YYYY-MM-DD, weekStart + 6
  monthBoundaries: { start: string; end: string };
}
```

`frontend/src/contexts/TenantContext.tsx` exposes this via `useTenant().tenantNow`, refetched every 5 minutes alongside the rest of `TenantSettings` (no separate API call). Sunday week-start is a documented convention inside `getTenantNow`, not a hardcoded law — it may become a tenant setting later, mirroring `cancellation_fee_window_hours` and similar.

Every previously browser-local surface now consumes `tenantNow` (or a value derived from it) instead of `new Date()`:
- **`Dashboard.tsx`**: renders a loading state until `tenantNow` resolves — deliberately no browser-`Date` fallback, since a brief wrong-day flash is worse than a brief spinner. Today's-lessons count, the 30-day permit-expiry boundary, monthly revenue, and the "Next 7 Days" grid all key off `tenantNow`.
- **`Lessons.tsx`**: status counts, stats, and `groupLessonsByDate`'s Today/Tomorrow/This Week/Later/Past buckets compare `lesson.date` (a plain `YYYY-MM-DD` string) directly against `tenantNow` fields — never `new Date(lesson.date).toISOString().split('T')[0]`, which UTC-shifts a date-only value.
- **`LessonsCalendarView.tsx`** / **`InstructorWeeklySchedule.tsx`**: month/week navigation and the "today" highlight seed from `tenantNow.today`/`tenantNow.weekStart` via `parseLocalDate`; subsequent calendar-grid math (`.getDay()`, `.getDate()`, `setDate`) operates on that already-tenant-anchored `Date`, which is safe — it's pure calendar arithmetic on a resolved value, not a fresh read of the browser's instant (the same distinction `parseLocalDate`/`formatLocalDate`/`addCalendarDays` in `timeFormat.ts` document for themselves).
- **`utils/studentStatus.ts`**: `computeStudentStatus`/`studentNeedsFollowup`/`getFollowupReason` all take a **required** `now: Date` parameter — no default — so a caller that forgets to pass tenant time is a compile error, not a silent browser-time fallback. Callers (`Dashboard.tsx`, `Students.tsx`) pass `parseLocalDate(tenantNow.today)`.
- **`SmartBookingForm`**: `findAvailableSlots`'s response gained `startTimeLocal`/`endTimeLocal` (tenant wall-clock `HH:MM`, sibling fields to the existing ISO `startTime`/`endTime`) on `TimeSlot`/`RankedTimeSlot`. The wizard's booking payload and every displayed slot time now read these directly, eliminating the old `new Date(iso).getHours()` parse that was correct only when the browser's zone happened to match the instant's encoding.
- **`DateRangeFilter.tsx`**: stays presentational — takes `tenantToday`/`tenantWeekStart`/`tenantWeekEnd`/`tenantMonthStart`/`tenantMonthEnd` as props rather than calling `useTenant()` or `date-fns`'s `new Date()`-based boundary helpers itself.

**Enforcement**: `frontend/src/__tests__/noBrowserLocalDateDerivation.test.ts` mirrors `noServerLocalDateDerivation.test.ts`'s static-scan mechanism against these same files, with an explicit per-file allowlist for the legitimate calendar-grid-math cases described above. Hostile-clock test suites (`*.hostileClock.test.tsx`/`.ts`, one per surface above) reassign `process.env.TZ` at runtime to simulate a disagreeing browser timezone (verified to genuinely affect every `Date.prototype` getter and `Intl.DateTimeFormat`, including across DST transitions) while a separately mocked `tenantNow` simulates the backend-resolved value, asserting each surface renders the *tenant's* boundaries in both directions (tenant Pacific/browser Eastern and the reverse). **`date-fns-tz` must never be added to the frontend** — plain `date-fns` remains fine only for calendar-day arithmetic on an already-resolved string, never for converting an instant.

---

## 8. Guardians

Guardians are tenant-scoped records, independent of students, linked via a many-to-many junction table — the first such junction table in this schema.

- **`guardians`** (`backend/database/migrations/005_add_guardians_table.sql`): `id` (uuid), `tenant_id`, `first_name`, `last_name`, `email`, `phone`, audit columns (`created_by`/`updated_by`). A DB `CHECK` constraint requires at least one of `email`/`phone`. **Deliberately no unique constraint** on email or phone — two guardian records may legitimately share contact info (e.g. divorced parents), and enforcing uniqueness would force a merge decision at write time. Visible to all authenticated tenant roles; unlike students, there's no instructor-data-isolation branch, since a guardian isn't owned by one instructor.
- **`student_guardians`** (`backend/database/migrations/006_add_student_guardians.sql`): many-to-many link, `(student_id, guardian_id)` unique, `relationship` (`mother`/`father`/`grandparent`/`legal_guardian`/`other`), `is_primary`. A partial unique index on `(student_id) WHERE is_primary` enforces exactly one primary guardian per student; promoting a new primary demotes the old one inside a real transaction (`backend/src/services/studentGuardianService.ts`'s `setPrimaryGuardian`, built on the `getClient()` seam). Deleting a student cascades its links; deleting a guardian is blocked with a clear, student-naming error while links exist (`guardianService.deleteGuardian`'s proactive pre-check; the DB's `ON DELETE RESTRICT` is a backstop, not the primary UX).
- **Explicit linking only**: `linkGuardianToStudent(studentId, guardianId, ...)` is the function that writes a single new `student_guardians` row outside of student creation, and it requires both IDs from the caller. Guardian *matching* (`findGuardianCandidates`, `findExactGuardianMatch` in `guardianService.ts`) is read-only — it never links, only surfaces candidates with disambiguating context (linked student names) for a human to choose from. This split is deliberate: it's the seam a future public signup form will reuse without risking auto-merged/duplicate guardian records.
- **Changing an existing link**: `PUT /api/v1/students/:id/guardians/:guardianId` (`studentGuardianService.updateGuardianRelationship`) updates only the `relationship` column on an existing `student_guardians` row — relationship is a property of the link, not the guardian, so it's never edited on the guardian record itself. `PUT /api/v1/students/:id/guardians/:guardianId/primary` (`setPrimaryGuardian`) promotes a guardian to primary, demoting the previous primary in the same transaction. `DELETE /api/v1/students/:id/guardians/:guardianId` (`unlinkGuardianFromStudent`) removes a link; it first checks whether the student is a minor (age < 18 or null `date_of_birth`, same convention as `needsGuardian`) with exactly one linked guardian remaining, and rejects with a 400 rather than stripping a minor's last guardian. Every guardian-linked student's second-to-last guardian can still be unlinked freely — only the very last one on a minor is protected.
- **Atomic student+guardian(s) creation**: `POST /students/with-guardian` (`studentService.createStudentWithGuardian`) creates a student and creates-or-links **one or more** guardians inside one `BEGIN`/`COMMIT` transaction on the same `getClient()` connection. The request body is `{ student, guardians: [...] }` — an array of 1..N entries, each either `{ mode: 'existing', guardianId, relationship?, isPrimary? }` or `{ mode: 'new', firstName?, lastName?, email?, phone?, relationship?, isPrimary? }`. The response is `{ student, guardians: [{ guardian, link }, ...] }` (plural, one pair per array entry). All pre-transaction validation — contact-method/DOB/adult-email checks, duplicate guardian references within the request (same `guardianId`, or the same new-guardian email/phone), and a per-`mode: 'new'` exact-match check against existing guardians (409 on a match) — runs before `getClient()`/`BEGIN` is ever called, so an invalid request never opens a transaction. Inside the transaction, the student insert happens once, then every guardian in the array is inserted-or-looked-up and linked in a loop on the same client; a failure at **any** point — including partway through the guardian array — rolls back the student insert and every guardian/link processed so far, not just the first. Exactly one guardian ends up primary: the caller's explicit `isPrimary: true` if given (more than one is a 400), otherwise the first entry in the array. This is additive alongside the plain `POST /students` (unchanged, still used for adults and for minors whose guardian setup is deferred) and is the only path the frontend uses whenever a guardian is being linked at creation time — never a `create` call followed by separate link requests.
- **Guardian requirement for minors**: a minor student may still be created with zero guardians (a link needs a `student_id` that doesn't exist until after insert). A computed `needsGuardian` flag (true only for minors with no linked guardian) is attached to every student read, batched alongside `progress`. The only hard gate is at program completion — `markStudentCompleted` rejects while a minor still `needsGuardian`. The frontend surfaces this proactively (a warning banner on existing flagged records, a "Needs Guardian" badge/filter on the Students list) so admins can correct records predating the guardian UI — including students created before the multi-guardian sub-panel shipped, since the guardian picker is no longer gated to create-mode-only (see Frontend below).
- **`students.email` is now nullable**, protected by a partial unique index (`idx_students_email_tenant ... WHERE email IS NOT NULL`) instead of a plain unique index — this unblocks enrolling minor siblings who share a parent contact or have no email of their own. Required server-side for adults (18+ by `date_of_birth`), enforced at both create and update; can't be a DB constraint since age changes daily.
- **Cross-entity search**: `GET /api/v1/search/people?q=` (`backend/src/services/searchService.ts`) searches students and guardians together by name/email/phone in one `UNION ALL` query, returning typed (`'student' | 'guardian'`) results. The frontend wires this into the Students page's shared search bar — typing 2+ characters overlays mixed results regardless of which tab (Students/Guardians) is active.
- **Emergency contact cleanup**: the legacy `students.emergency_contact` combined string column is dropped; `emergency_contact_name`/`emergency_contact_2_name` are split into `_first_name`/`_last_name` pairs for consistency with how names are stored elsewhere (`students.first_name`/`last_name`, `guardians.first_name`/`last_name`). These fields are collapsed behind progressive disclosure in the UI (see BLUEPRINTS.md) but remain structurally unchanged in the schema and API.
- **Frontend**: `frontend/src/pages/Students.tsx` has a Students | Guardians segmented tab sharing one page shell (no new nav item). `frontend/src/components/guardians/` holds `GuardiansList`, `GuardianModal` (detail + "Enroll another student"), `DuplicateGuardianConfirm`, and `UnifiedSearchResults`. `frontend/src/components/students/GuardianSubPanel.tsx` is a reusable, presentation-only linked-guardians list (row per guardian: name, relationship select, contact, primary star, unlink) used by `StudentModal.tsx` in both modes: in edit mode its callbacks call the guardian API immediately (`linkToStudent`/`unlinkFromStudent`/`updateRelationship`/`setPrimary`); in create mode they mutate a local `stagedGuardians` array, with nothing sent to the server until the whole form (student + all staged guardians) is submitted in one `createWithGuardian` call. The type-ahead picker (`guardiansApi.findCandidates`) and its "Create new guardian instead" option are shared by both modes — selecting or creating a guardian never links/stages immediately by itself, only on the sub-panel's explicit "Add Guardian" confirmation (Constraint: matching surfaces candidates, it never auto-links).

---

## 9. Lesson Review, Cancellation Policy, and Fee Flags

- **`lessons.reviewed_by`/`reviewed_at`** (`backend/database/migrations/013_add_lesson_review_audit.sql`): nullable `uuid`/`timestamp`, `reviewed_by` FK to `users(id) ON DELETE SET NULL`, no index — the same audit-column shape as migrations 002/003. Set by `completeLesson`/`noShowLesson`/`cancelLesson` (`lessonService.ts`), each guarded by `assertLessonReviewable`, which rejects (409) transitioning a lesson that's already `completed`/`cancelled`/`no_show`.
- **Tenant settings** (`backend/database/migrations/014_add_lesson_review_settings.sql`, four discrete columns on `tenant_settings`, no settings jsonb):
  - `lesson_completion_mode` (`text`, default `'manual'`) — `'manual' | 'auto'` at the TypeScript layer; only `'manual'` has a job behind it (the review queue). `'auto'` is stored but inert.
  - `cancellation_fee_amount` (`numeric(10,2)`, default `50`).
  - `cancellation_fee_window_hours` (`integer`, default `24`).
  - `cancellation_fee_payee` (`text`, default `'instructor'`) — `'instructor' | 'school'`. No CHECK constraint on either enum-shaped column, matching the existing precedent (e.g. `country`) that tenant-settings enums are TS-union-typed only; `tenantService.updateTenantSettings` validates both against their allowed value sets.
- **`fee_flags`** (`backend/database/migrations/015_add_fee_flags.sql`): `id`, `tenant_id`, `student_id`, `lesson_id`, `amount`, `reason`, `status` (`outstanding | cleared | waived | paid`, CHECK-constrained), plus nullable resolution-detail columns (`waived_by`/`waived_reason`/`waived_at`, `paid_payment_id`/`paid_at`) — mirroring `students.completed`/`completed_at`/`completed_by`/`completion_reason`'s shape. FKs to `tenants`/`students`/`lessons` (`ON DELETE CASCADE`), `users` (`waived_by`, `ON DELETE SET NULL`), `payments` (`paid_payment_id`, `ON DELETE SET NULL`). Indexes on `student_id`, `tenant_id`, plus a partial index on `student_id WHERE status = 'outstanding'` (the hot-path "does this student owe anything" lookup).
- **Structural isolation from revenue (Constraint A).** `fee_flags` is never joined into, or referenced by, `instructorService.getInstructorEarnings` (sums `lessons.cost` scoped to `status='completed'`) or any query touching `students.total_paid`/`outstanding_balance`. This isn't an application-level exclusion rule — nothing in `feeFlagService.ts` writes to those columns or tables at all, verified by both a runtime test suite (`backend/src/__tests__/feeFlags.test.ts`) and a static source-grep test asserting `instructorService.ts`'s source never contains the string `fee_flags`.
- **Write paths, all internal to `feeFlagService.ts`** (modeled on `studentGuardianService.ts`'s tenant-scoped-everywhere shape): `createFeeFlag` is called only from `lessonService`'s status-transition side effects (no-show; a cancellation inside the fee window), never a public endpoint of its own. `waiveFeeFlag(id, tenantId, userId, reason)` mirrors `markStudentCompleted`'s waive-with-attribution shape exactly. `recordPaymentForFeeFlag` re-checks `cancellation_fee_payee === 'school'` server-side (403 otherwise) before calling the existing `paymentService.createPayment` — the school-payee path is the only place a `fee_flags` row and a real `payments` row are ever connected, via `paid_payment_id`. `clearOutstandingFlagsForStudent` runs from `completeLesson` as a non-blocking side effect, clearing every outstanding flag for that student at once.
- **New endpoints**: `POST /lessons/:id/cancel` (replaces `DELETE /lessons/:id`), `GET /dashboard/review-queue`, `POST /dashboard/review-queue/:date/complete-all`, `GET /students/:studentId/fee-flags`, `GET /instructors/:instructorId/fee-flags`, `POST /fee-flags/:id/waive`, `POST /fee-flags/:id/record-payment`.

---

## 10. Instructor Licensing and Service Areas

- **`instructors.instructor_license_number` / `instructor_license_expiration`** (plain nullable columns, present since `001_baseline.sql`): the instructor's **Driving School Instructor License** (California DMV) — the credential to *teach*, distinct from the Driving School Operator License that licenses whoever manages the school. Renews every 3 years, via exam or an 18-hour DMV-approved continuing-education program. `createInstructor`/`updateInstructor` (`backend/src/services/instructorService.ts`) now read and persist both fields — previously the form collected a license number and the service silently discarded it (same bug class as the earlier `employmentType` fix). `instructors.drivers_license_number`/`drivers_license_expiration` also exist on the row but are intentionally left unwired in the UI — see BLUEPRINTS.md for why.
- **`instructor_service_areas`** (`backend/database/migrations/016_add_instructor_service_areas.sql`): `id`, `tenant_id`, `instructor_id`, `zip_code` (`varchar(5)`, CHECK-constrained to exactly 5 digits), `created_at`. `UNIQUE (instructor_id, zip_code)`; FKs to `instructors`/`tenants` (`ON DELETE CASCADE`); indexes on `instructor_id`, `tenant_id`, and `zip_code` (the last for the batched membership lookup `findRankedAvailableSlots` performs — see §"Where this applies" below). **No rows for an instructor means "serves everywhere"** — an empty result from `instructorServiceAreaService.getServiceAreas` is the normal unconfigured state, not an error, enforced entirely in application code rather than a sentinel row. Managed via `GET`/`PUT /instructors/:id/service-areas` (`instructorServiceAreaService.ts`'s `setServiceAreas` bulk-replaces the whole list transactionally, validating every entry's 5-digit format and rejecting duplicates before opening the transaction — no partial save).

---

**Note:** For implementation guides and roadmaps, see [BLOCKCHAIN.md](BLOCKCHAIN.md). For operational user guides, see [OPERATIONS.md](OPERATIONS.md).
