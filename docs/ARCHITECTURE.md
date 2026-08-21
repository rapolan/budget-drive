# Budget Drive Protocol (BDP) - Technical Architecture

**Version:** 2.2  
**Last Updated:** August 2026  
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

A `student` is a **person** — identity, address, date of birth, guardians, permit details. Program state (required hours, progress, completion, license type) lives on that person's **enrollments**, not on the student row. This split exists because a driving school actually offers two distinct programs a person may take independently: see §11 "Enrollments" for the full model. This section covers the progress-calculation and completion mechanics that now operate on an enrollment.

Progress is derived live, never stored as a running total. `enrollments` has no hours-completed column at all — carrying one forward from the old `students.total_hours_completed` (a dead legacy column that nothing wrote to) would have recreated the exact stale-cache trap this design avoids.

- **Track derivation** (`backend/src/services/studentProgressService.ts`, `computeStudentProgress`): unchanged in algorithm, changed in input — it takes an enrollment's `hoursRequired`/`completed`/`completedAt`/`completionReason`/`trackOverride` plus the person's `dateOfBirth` (passed separately, since identity stays on the student). A student's age is computed live from `date_of_birth` (never persisted). Minors (under 18, or `date_of_birth` null) progress on an **hours track** against the enrollment's `hours_required`, defaulted at creation from the tenant's `tenant_settings.default_hours_required`. Adults (18+) progress on a **lessons track** — booked-lesson count vs. completed-lesson count, since adults have no mandated hour minimum. `enrollments.track_override` (`'hours' | 'lessons' | null`) lets an admin pin a track regardless of age (used at the turning-18 boundary), scoped to the specific enrollment.
- **Lesson-equivalent view** (`tenant_settings.standard_lesson_length_minutes`, integer, default 120): `computeStudentProgress` uses it to derive `lessonsRequired = ceil(hoursRequired * 60 / standardLessonLengthMinutes)` for minors, attached to the `StudentProgress` payload alongside the existing hours fields. Adults' `lessonsRequired` is simply an alias for their existing `lessonsBooked`. `percentComplete` is derived from the lesson-count view on both tracks.
- **Completion**: `enrollments.completed`/`completed_at`/`completed_by`/`completion_reason` are the sole source of truth for program completion on that enrollment — not an hours-threshold auto-derivation. `POST /api/v1/enrollments/:id/complete` sets these columns and computes `completion_hash` (see §12). The minor-needs-guardian gate (§8) still evaluates against the **person**, resolved from the enrollment's `student_id`.
- **Reopen is a guarded write**, not a plain undo: `POST /api/v1/enrollments/:id/reopen` requires a non-empty `reason` in the body and is restricted to `owner`/`admin` roles (`requireRole`). It records `reopened_at`/`reopened_by`/`reopened_reason` — a new event, not an erasure — and deliberately never clears `completion_hash`, since the historical fact "a completion occurred" must survive a later reopen. It returns `certificateExists: boolean` (a lookup against `certificates.student_id` — see the TODO in §11 on why this is person-scoped, not yet enrollment-scoped) so the caller can warn the user; the endpoint itself does not touch the certificate row.
- **Read-path attachment**: every student list/detail read (`getAllStudents`, `getStudentById`, `getStudentsByStatus`, `getStudentsByInstructor`) attaches a `progress` object derived from that student's **active** `driver_training` enrollment, via one batched query (not N+1). A student with no active `driver_training` enrollment (their prior one completed and no new one has started — a legitimate, common state, not an error) gets `progress: undefined`; `StudentProgressBar` renders "No active enrollment" for it, distinct from the zero-progress state.
- **Notifications**: the `notifications` table (fully defined in the baseline schema, previously unused) is now live. `backend/src/services/notificationService.ts` creates a `follow_up_due` notification when a lesson is marked `no_show`, auto-dismissed when that student's next lesson is booked. `backend/src/services/dashboardService.ts` — the first dedicated backend aggregation service — joins `lessons.status='no_show'` against active notifications to surface a no-show follow-up alert list.
- **New endpoints**: `POST /api/v1/enrollments/:id/complete`, `POST /api/v1/enrollments/:id/reopen`, `GET /api/v1/dashboard/no-show-alerts`, `POST /api/v1/dashboard/alerts/:notificationId/dismiss`.

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

One exception is explicitly safe and does **not** go through the helper: extracting the calendar date from a plain Postgres `DATE` column value (e.g. `lessons.date`). A `Date` instance `pg` returns for a `DATE`-typed column is always UTC midnight of that calendar date — there's no wall-clock time attached, so `toISOString().split('T')[0]` carries no roll risk there specifically. This is called out inline with a comment everywhere it's used, so it isn't "fixed" by a future reader who doesn't realize the distinction. Contrast this with the same pattern applied to a real timestamp/instant value (e.g. a lesson's resolved start time), which *is* a live bug this module exists to eliminate.

### Where this applies

- **Scheduling** (`schedulingService.ts`): slot generation, date-range interpretation, "today"/"tomorrow" search-window origin, and conflict-detection date/time-string derivation all resolve in the tenant's zone.
- **Lesson storage** (`lessonService.ts`): a lesson's stored `date`/`start_time`/`end_time` are derived from the tenant zone consistently (previously the most severe bug found — the date was read in UTC while the time was read in server-local time, an internal inconsistency that could store a lesson on the wrong calendar day).
- **Lesson invites and calendar feeds** (`lessonInviteService.ts`, `calendarFeedService.ts`): invite date text and `.ics` `DTSTART`/`DTEND` resolve in the tenant zone. Both emit `DTSTART`/`DTEND` as UTC instants (`Z`-suffixed, RFC-5545-legal) rather than hand-rolling a `VTIMEZONE` block with baked-in DST transition rules for one hardcoded zone — every mainstream calendar client renders a UTC-suffixed `DTSTART` correctly in the viewer's own local time, and this approach doesn't require re-deriving IANA's DST rules for 400+ zones.
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

**Guardians link to the person, not the program.** `student_guardians.student_id` references `students.id` — the person — and this did not change when program state moved to `enrollments` (§11). A person with two enrollments (e.g. driver training now, driver education completed years ago) still has exactly one set of guardians. The minor-requires-guardian gate at program completion likewise evaluates against the person, resolved from the enrollment being completed.

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
- **`fee_flags`** (`backend/database/migrations/015_add_fee_flags.sql`; `enrollment_id` added by `018_add_enrollments.sql`): `id`, `tenant_id`, `student_id`, `enrollment_id`, `lesson_id`, `amount`, `reason`, `status` (`outstanding | cleared | waived | paid`, CHECK-constrained), plus nullable resolution-detail columns (`waived_by`/`waived_reason`/`waived_at`, `paid_payment_id`/`paid_at`). FKs to `tenants`/`students`/`enrollments`/`lessons` (`ON DELETE CASCADE`), `users` (`waived_by`, `ON DELETE SET NULL`), `payments` (`paid_payment_id`, `ON DELETE SET NULL`). Indexes on `student_id`, `tenant_id`, plus a partial index on `student_id WHERE status = 'outstanding'` (the hot-path "does this student owe anything" lookup). **`student_id` and `enrollment_id` are deliberately both present and mean different things**, unlike the plain duplication that `lessons.student_id`/`payments.student_id` represent (an enrollment already identifies its student on those two tables): `enrollment_id` is *provenance* — which program's lesson generated this fee, relevant to CVC §11108's cost-of-instruction record — while `student_id` is *who owes it*. A fee can clear against a **later** enrollment than the one that generated it (the student's next lesson, however it's booked, resolves the flag), so every student-facing query in `feeFlagService.ts` (`getOutstandingFlagsForStudent`, `clearOutstandingFlagsForStudent`, `recordPaymentForFeeFlag`) is intentionally person-scoped, not enrollment-scoped — this is not dead-column cleanup waiting to happen.
- **Structural isolation from revenue (Constraint A).** `fee_flags` is never joined into, or referenced by, `instructorService.getInstructorEarnings` (sums `lessons.cost` scoped to `status='completed'`) or any query touching `students.total_paid`/`outstanding_balance`. This isn't an application-level exclusion rule — nothing in `feeFlagService.ts` writes to those columns or tables at all, verified by both a runtime test suite (`backend/src/__tests__/feeFlags.test.ts`) and a static source-grep test asserting `instructorService.ts`'s source never contains the string `fee_flags`.
- **Write paths, all internal to `feeFlagService.ts`** (modeled on `studentGuardianService.ts`'s tenant-scoped-everywhere shape): `createFeeFlag` is called only from `lessonService`'s status-transition side effects (no-show; a cancellation inside the fee window), never a public endpoint of its own. `waiveFeeFlag(id, tenantId, userId, reason)` mirrors `markStudentCompleted`'s waive-with-attribution shape exactly. `recordPaymentForFeeFlag` re-checks `cancellation_fee_payee === 'school'` server-side (403 otherwise) before calling the existing `paymentService.createPayment` — the school-payee path is the only place a `fee_flags` row and a real `payments` row are ever connected, via `paid_payment_id`. `clearOutstandingFlagsForStudent` runs from `completeLesson` as a non-blocking side effect, clearing every outstanding flag for that student at once.
- **New endpoints**: `POST /lessons/:id/cancel` (replaces `DELETE /lessons/:id`), `GET /dashboard/review-queue`, `POST /dashboard/review-queue/:date/complete-all`, `GET /students/:studentId/fee-flags`, `GET /instructors/:instructorId/fee-flags`, `POST /fee-flags/:id/waive`, `POST /fee-flags/:id/record-payment`.

---

## 10. Instructor Licensing, Service Areas, and Expiry Notifications

- **`instructors.instructor_license_number` / `instructor_license_expiration`** (plain nullable columns, present since `001_baseline.sql`): the instructor's **Driving School Instructor License** (California DMV) — the credential to *teach*, distinct from the Driving School Operator License that licenses whoever manages the school. Renews every 3 years, via exam or an 18-hour DMV-approved continuing-education program. `createInstructor`/`updateInstructor` (`backend/src/services/instructorService.ts`) now read and persist both fields — previously the form collected a license number and the service silently discarded it (same bug class as the earlier `employmentType` fix). `instructors.drivers_license_number`/`drivers_license_expiration` also exist on the row but are intentionally left unwired in the UI — see BLUEPRINTS.md for why.
- **`instructor_service_areas`** (`backend/database/migrations/016_add_instructor_service_areas.sql`): `id`, `tenant_id`, `instructor_id`, `zip_code` (`varchar(5)`, CHECK-constrained to exactly 5 digits), `created_at`. `UNIQUE (instructor_id, zip_code)`; FKs to `instructors`/`tenants` (`ON DELETE CASCADE`); indexes on `instructor_id`, `tenant_id`, and `zip_code` (the last for the batched membership lookup `findRankedAvailableSlots` performs — see §"Where this applies" below). **No rows for an instructor means "serves everywhere"** — an empty result from `instructorServiceAreaService.getServiceAreas` is the normal unconfigured state, not an error, enforced entirely in application code rather than a sentinel row. Managed via `GET`/`PUT /instructors/:id/service-areas` (`instructorServiceAreaService.ts`'s `setServiceAreas` bulk-replaces the whole list transactionally, validating every entry's 5-digit format and rejecting duplicates before opening the transaction — no partial save).
- **`instructor_license_notifications`** (`backend/database/migrations/017_add_instructor_license_notifications.sql`): dedup tracking for escalating license-expiry reminders. `id`, `tenant_id`, `instructor_id`, `expiration_date` (`date`), `threshold` (signed `integer` — days relative to expiry: `180`/`90`/`30`/`14`/`7` pre-expiry, `0` on the expiry date, a negative multiple of 7 post-expiry), `notified_at`. `UNIQUE (instructor_id, expiration_date, threshold)` is the actual dedup enforcement — `instructorLicenseNotificationService.ts`'s daily cron always attempts `INSERT ... ON CONFLICT DO NOTHING`, and only creates admin-facing notifications when that insert genuinely records a new row, so even a concurrent or retried run can't double-fire. Including `expiration_date` in the key is what makes editing an instructor's expiration reset the schedule for free: a new date has no matching rows yet, so every threshold fires fresh against it. Rows for a superseded date are left in place (audit trail), never queried again. FKs to `instructors`/`tenants` (`ON DELETE CASCADE`); index on `(instructor_id, expiration_date)`. The same migration widens `notifications.type`'s CHECK constraint to add `'license_expiring'` — the type these reminders create, one row per active owner/admin user in the tenant, via the same `notifications` table the no-show alert already uses (not the separate, unused `notification_queue` email pipeline — see BLUEPRINTS.md for why).
- **`backend/src/jobs/instructorLicenseCron.ts`**: a `node-cron` job, daily (`INSTRUCTOR_LICENSE_CRON_SCHEDULE`, default `0 8 * * *` server time), started from `backend/src/index.ts` at server startup. The schedule string is inherently server-local (cron scheduling always is), but the work inside resolves "today" per-tenant via `tenantToday(timezone)` before ever comparing dates — which server instant the job happens to fire at never affects which tenant-calendar-day a threshold is evaluated against.
- **`GET /api/v1/dashboard/license-expiry-alerts`**: live-computed on every call from `instructors.instructor_license_expiration` + tenant "today" (same pattern as the review queue, not the no-show alert's join-against-persisted-notification-state pattern) — instructors already expired or expiring within 180 days, sorted soonest-first. No dismiss endpoint; the alert clears itself the moment an expiration is edited past the window.

---

## 11. Enrollments

`students` carried `hours_required`, progress, and completion state directly for most of this project's history, which implicitly assumed one program per person. That's false: a driving school sells two distinct programs — **driver education** (30 hours, classroom/online) and **driver training** (6 hours, behind-the-wheel) — and a person may take either, both, or one here and one elsewhere, sometimes years apart. Certificates are issued per program on different DMV form types, so certificates will eventually attach to a program, not a person — that attachment is **future work**; `certificates.student_id` is unchanged this session.

- **`enrollments`** (`backend/database/migrations/018_add_enrollments.sql`): `id` (opaque `uuid`), `tenant_id`, `student_id`, `program_type` (`'driver_education' | 'driver_training'`, CHECK-constrained), `status` (`'active' | 'completed' | 'inactive' | 'suspended'`), `enrollment_date`, `hours_required`, `track_override`, `assigned_instructor_id`, `license_type` (`'car' | 'motorcycle' | 'commercial'` — moved here from `students`, since it describes the program, not the person), `total_cost` (nullable — see below), completion columns (`completed`/`completed_at`/`completed_by`/`completion_reason`), reopen-audit columns (`reopened_at`/`reopened_by`/`reopened_reason`), the external-DE-prerequisite columns (below), and the BSV forward-compat columns (§12). FKs to `tenants`/`students` (`ON DELETE CASCADE`), `instructors`/`users` (`ON DELETE SET NULL`).
- **At most one *active* `driver_training` enrollment per student** — a partial unique index on `(student_id) WHERE program_type = 'driver_training' AND status = 'active'`, not "one ever." A completed, inactive, or suspended enrollment does not block a new active one for the same program type — this is what lets a returning student (e.g. car training in 2026, motorcycle training in 2028) get a second `driver_training` enrollment. Every "resolve the student's driver_training enrollment" call site (lesson/payment/fee-flag creation, progress attachment, completion) resolves the active one specifically; a student with none gets a clean `400` on write, or `progress: undefined` on read (§6), never a silent failure.
- **Scope this session**: `driver_training` is built fully — hours, progress, completion, lessons, fee flags, review queue. `driver_education` exists as a program type and can be created with manually entered completion date and hours (`enrollments.manual_completed_hours`) — no lesson tracking, no scheduling, no curriculum for it yet.
- **External driver education prerequisite**: `driver_training` enrollments carry `external_de_completed`/`external_de_completed_date`/`external_de_provider`, recording whether DE was completed elsewhere (a different school, before this system was in use). Display-only — surfaced on the student record, not enforced or blocked on at booking time.
- **Derived payment totals, not stored**: `total_paid`/`outstanding_balance`/`payment_status` do not exist as columns on `enrollments` (or, as of migration `019`, on `students` either — the old `students.total_paid`/`outstanding_balance`/`payment_status` were confirmed stale, uncached columns, only ever written by a generic PATCH path and never kept in sync with `payments`). They're computed at read time (`enrollmentService.computePaymentSummary`) from `SUM(payments.amount) WHERE enrollment_id = ... AND status = 'confirmed'`, compared against `total_cost` — itself derived from the enrollment's own `lessons.cost` when not explicitly overridden (`tenant_settings.default_lesson_cost` is confirmed to be only a booking-wizard prefill, not an enforced formula, so it cannot substitute for summing actual lesson costs). `outstandingBalance` is `null` — not `0` — when neither an override nor any lessons exist yet, since "not computable" and "zero" are different facts. This mirrors `computeStudentProgress`'s derive-don't-cache precedent exactly.
- **`lessons.student_id` and `payments.student_id` are pure duplication** of `enrollments.student_id` and are slated for removal, but were **not** dropped in migration `019` — doing so safely requires rewriting roughly a dozen read sites in `lessonService.ts` plus three `WHERE student_id = $1` filters inside `schedulingService.ts`'s ranked-slot search (one of which runs on every single search), and that rewrite wasn't done with enough confidence in this session to touch a hot path. Both `lessons.student_id`/`payments.student_id` are still written alongside `enrollment_id` on every insert, so they stay in sync; see the `TODO(students-refactor-followup)` comment in `019_drop_student_program_columns.sql` for the exact follow-up scope. `fee_flags.student_id` is a different case and is not part of this cleanup at all — see §9.
- **New endpoints**: `GET/POST /api/v1/students/:id/enrollments` (list/create, nested — matches the `/students/:id/guardians` pattern), `GET/PATCH /api/v1/enrollments/:id`, `POST /api/v1/enrollments/:id/complete`, `POST /api/v1/enrollments/:id/reopen` (flat — an enrollment id is already tenant-unique, and this matches how lesson actions are routed, e.g. `POST /lessons/:id/cancel`).
- **Frontend**: the student modal gained an Enrollments tab (`EnrollmentSubPanel.tsx`, following `GuardianSubPanel.tsx`'s dumb-component-plus-parent-owns-mutations contract) alongside the existing Details/Progress/History tabs — edit-mode-only, since a new student already gets exactly one `driver_training` enrollment automatically at creation (no create-mode staging needed, unlike guardians). "Add enrollment" is gated independently per program type and is always an explicit two-step action. The Students list page is unchanged — it reads `student.progress`/`student.activeEnrollment`/`student.paymentSummary`, all still attached in list responses in the same shape as before.

## 12. BSV Forward-Compatibility (Enrollment Completion)

No blockchain code was written for this — this section documents groundwork only. An enrollment's **completion** is a point-in-time attestation, the fact a future certificate would rest on, and is the natural anchor unit per docs/MISSION.md's decision framework (it's a discrete, infrequent, high-value event — not a chokepoint, not a micro-fee action).

- `enrollments.completion_hash` (nullable `text`) is computed and stored by ordinary application code the moment `markEnrollmentCompleted` runs, using Node's built-in `crypto` module (`sha256`) over a small canonical JSON object: `{enrollmentId, programType, hoursCompleted, completedAt}` — internal IDs and non-PII scalars only, never a student's name, email, phone, or address. Reopening an enrollment never clears `completion_hash` — it's a historical record that a completion occurred, not something a reopen erases.
- `enrollments.ledger_txid` (nullable `character varying(255)`, matching the existing `bsv_transaction_id` nullable-column convention elsewhere) is written **nowhere** in this codebase and stays permanently `NULL`. A future session will populate it once real anchoring is wired.
- **No blockchain import anywhere in this path**: `enrollmentService.ts` never imports `walletService`, `treasuryService`, or the `Ledger` seam (`backend/src/services/Ledger/`) — enforced by a structural test (`backend/src/__tests__/enrollmentBsvForwardCompat.test.ts`), the same static-source-scan technique `feeFlags.test.ts` uses for revenue isolation.
- **The `LedgerService` interface needs zero changes** to support a future anchor call: `LedgerActionType` already reserves `'BDP_PROGRESS'` ("student progress update", 2 sats) with zero current callers — the natural landing spot. The two real production `anchorAction`/`recordPayment` call sites today (`lessonService.ts`'s booking side effect, `paymentService.ts`'s payment side effect) already demonstrate the "internal IDs only, never PII" calling convention this would follow.
- Enrollment IDs are opaque `uuid`s (`gen_random_uuid()`), and no student PII is denormalized onto the `enrollments` row anywhere — a future anchor payload can reference an enrollment by ID alone.

---

**Note:** For implementation guides and roadmaps, see [BLOCKCHAIN.md](BLOCKCHAIN.md). For operational user guides, see [OPERATIONS.md](OPERATIONS.md).
