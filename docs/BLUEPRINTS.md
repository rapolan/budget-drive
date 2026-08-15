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
- **Multi-guardian support:** a student can have any number of linked guardians (e.g. divorced parents, or a parent plus a grandparent who does pickups), not just one. Exactly one guardian per student can be marked primary; setting a new primary demotes the previous one transactionally — the UI never shows two primaries.
- **A minor's last guardian cannot be unlinked.** Once a minor is down to exactly one linked guardian, the unlink action is disabled in the UI (with an explanation) and rejected by the backend (`unlinkGuardianFromStudent` in `studentGuardianService.ts`) even if called directly — the client-side disable is a UX courtesy, not the enforcement point. A minor's *second-to-last* guardian can still be unlinked freely; only the very last one is protected. An unknown/null date of birth is treated as a minor for this check, matching the existing `needsGuardian` convention.
- **Staged (create mode) vs. immediate (edit mode) guardian actions:** the reusable `GuardianSubPanel` component renders the same linked-guardian list and row actions (add, unlink, change relationship, set primary) in both places, but the two modes wire those actions differently:
  - **Edit mode** — the student already exists, so every action calls the API immediately (`guardiansApi.linkToStudent`/`unlinkFromStudent`/`updateRelationship`/`setPrimary`) and invalidates the guardian queries. This is what lets a student created *before* the guardian feature shipped (every seeded student) finally get a guardian through the UI — the guardian type-ahead picker is no longer gated to create-only.
  - **Create mode** — nothing is persisted until the student form is submitted. Adding a guardian stages it in local React state; unlinking, changing relationship, and setting primary all just mutate that staged list. On submit, every staged guardian is sent in a single `guardians: [...]` array to `POST /students/with-guardian`, created in one atomic transaction alongside the student (Constraint A — see below). The duplicate-guardian confirm step still runs per staged guardian at staging time, and staging the same guardian twice is blocked locally before it ever reaches the server.
- A combined `GET /search/people` endpoint searches students and guardians together by name, email, or phone, so front-desk staff don't have to choose a page before searching.
- **Atomic creation:** `POST /students/with-guardian` creates a student and creates-or-links **one or more** guardians (`guardians: [...]`, 1..N) in a single database transaction — a failure at any step (including a failure partway through the guardian array) rolls back everything, so a student can never end up saved with a guardian half-linked, and no earlier guardian in the array is left orphaned either. Duplicate guardian references within one request (same `guardianId`, or the same new-guardian email/phone) are rejected before the transaction opens. This is additive alongside the original `POST /students`, which is unchanged and still used whenever no guardian is being linked at creation time (adults; minors whose guardian setup is deferred to a walk-in-style follow-up).
- **Full frontend UI**: a Students | Guardians segmented tab (sharing the Students page's shell, not a new nav item), guardian detail with linked-students and an "Enroll another student" action, a student-form guardian type-ahead (walk-in flow) and guardian-first prefilled enrollment (phone-call flow), a duplicate-guardian confirmation step, sibling display, and the unified cross-entity search wired into the shared search bar.
- **Progressive emergency contacts:** the free-text emergency-contact fields (structurally separate from a linked guardian record) are collapsed behind an "Add an emergency contact" checkbox — unchecked by default on a blank form, checked automatically when the student already has emergency-contact data so nothing existing is ever hidden. The backup/secondary contact is only offered once the first contact has a name or phone. A "Same as guardian" shortcut copies from a linked/staged guardian; with exactly one guardian it copies immediately, with two or more it reveals a radio list so the user picks which guardian to copy from. Unchecking the main checkbox never clears already-entered data.

### Booking Workflow Improvements
The ranked slot-search wizard (`SmartBookingForm`) remains the only path to a booking and the 6D engine remains the only availability source — these additions change how a user *arrives* at a search or a confirm, never how availability or conflicts are computed.

- **Date-range control.** The setup step's search window is no longer a hardcoded "tomorrow + 14 days." Three server-computed preset chips — **Next 2 Weeks** (default, matches the old hardcoded behavior exactly), **This Month**, **Next Month** — plus an always-visible From/To date pair that acts as the readout for whichever preset is active. Editing either date directly switches the selection to **Custom** automatically. All three preset boundaries are computed server-side, in the tenant's own timezone, by `backend/src/utils/tenantTime.ts` (`tenantTomorrow`/`addTenantDays` for Next 2 Weeks, `tenantMonthBoundaries` for This Month, the new `tenantNextMonthBoundaries` for Next Month) and served once via `GET /availability/date-presets` — the browser never computes a boundary itself. The chosen range is passed to the existing ranked-slots endpoint as explicit `startDate`/`endDate` (replacing the old opaque `dateRange: number`); an inverted range or a span over 180 days is rejected server-side (180 days chosen to comfortably cover multi-month advance planning like a state permit/road-test window, while still bounding the per-day-per-instructor scan against an unbounded "anytime this year" query).
- **Book another lesson (same student, same session).** After a booking is confirmed, the wizard now shows a success step offering **Book Another Lesson** instead of immediately closing. Choosing it keeps the student, instructor selection, duration, lesson type, time preference, and date range exactly as they were, clears only the booked slot, and returns to **slot selection** (not setup) with the list refreshed — the just-booked slot is gone and any newly created conflict is reflected, because it's the same `handleFindSlots` re-search the wizard already uses for stale-slot recovery. This is repeatable for a third, fourth lesson; each one is still an independent, fully conflict-checked create through the normal booking path — nothing is batched. **Done** stays a one-click exit at any point. The one visible tradeoff: a page that shows a single "booking confirmed" toast (e.g. the Lessons page) still shows just one toast for the whole session, not one per lesson booked via the loop.
- **Book again (returning customer).** A **Book Again** action on a student's record (visible only once that student has at least one prior lesson) opens the booking wizard prefilled from their most recent lesson — instructor, duration, lesson type, time preference (bucketed from the lesson's start time), and pickup address — landing on the **setup** step, ready to search, not auto-searched. The previous instructor is preselected as the continuity default but stays a free, changeable choice via a normal dropdown (including "any available instructor"); this is deliberately distinct from the Reschedule flow's locked instructor display, which is unaffected. A student with no prior lessons opens the wizard with no prefill — never an error state.

### Instructor Availability: Weekly Checkbox Grid
Editing an instructor's recurring weekly schedule was previously a one-day-at-a-time form (`AvailabilityEditor`) that only exposed a start time — the day's `end_time` was silently computed from the tenant's default max-students-per-day, lesson duration, and buffer time, so "I work 8am–2pm on Fridays" simply couldn't be expressed; the school could only ever describe a day's length via student capacity. A second, read-only component (`AvailabilityCalendar`) rendered directly below it as a "Weekly Calendar View," showing the same rows a second time.

Both are replaced by `WeeklyAvailabilityGrid` (`frontend/src/components/scheduling/WeeklyAvailabilityGrid.tsx`), a single component that both edits and displays the week: one row per day of week, a checkbox for "works this day," and — on checked days — real, independently-editable **start time**, **end time**, and **max students** inputs. Unchecking a day collapses it to a muted "Not working" label; a summary line ("4 days · 26 hrs") totals the checked days live. A per-row **copy to all checked days** action bundles that row's start time, end time, and max students onto every other checked day, entirely in local state — no request fires until the admin clicks **Save Week**, which saves the whole week in one call.

- **`end_time` is now real, not inferred.** The 6D engine's slot generator (`schedulingService.ts`'s `findSlotsInBlock`) was already treating a block's `end_time` as an authoritative ceiling — it has never derived it from `max_students` — so this was purely a frontend change: the grid's own end-time input is now the only source of what gets saved, and shortening a day's window immediately shrinks what the ranked slot search offers for it (verified live: a 60-minute lesson fits a shortened 09:00–10:00 window, a 120-minute lesson correctly does not).
- **Unchecking preserves the row.** A day's checkbox toggles `instructor_availability.is_active`, never a delete — re-checking within the same editing session instantly restores that day's last-known times from local component state. (`is_available`, a second boolean on the same table, is legacy/unused by the application layer and untouched by this feature.) The underlying row does still survive, inactive, across a page reload — but since `GET /availability/instructor/:id` (a shared read used elsewhere) only ever returns active rows, a fresh page load can't pre-fill an unchecked day's old times; "restores the previous times" is scoped to the current session, not persisted across a reload.
- **Bulk save, at most one row touched per day.** `PUT /availability/instructor/:instructorId/week` (`availabilityService.setWeekAvailability`) validates all seven days before opening a transaction — one invalid day rejects the whole request, there is no partial-week save — then upserts the single newest active row per day (`SELECT ... FOR UPDATE`, then `UPDATE` or `INSERT`). Any additional pre-existing active row for that day (manually-created split-shift data, which the schema has always allowed via the absence of a `(instructor_id, day_of_week)` uniqueness constraint) is left completely untouched rather than being merged or destroyed — this grid deliberately doesn't build split shifts or the seasonal `effective_from`/`effective_until` date ranges the table also supports, and is designed not to corrupt either if they're ever used by a future feature or direct data edit.

### Tenant Settings: Default Lesson Cost & Timezone Auto-Detect
- **Default lesson cost.** `tenant_settings.default_lesson_cost` (a discrete typed numeric column, `NOT NULL DEFAULT 150` — no settings jsonb, matching `default_hours_required`/`standard_lesson_length_minutes`) prefills the booking wizard's Confirm step cost field via `useTenant().settings.defaultLessonCost`, replacing the old hardcoded `50`. The field stays freely editable per lesson; "Book Another" resets it back to the tenant default rather than the old hardcoded fallback. No backfill — existing lessons keep whatever cost was recorded at booking time, since this setting only affects what a *new* booking's cost field starts at. Configurable in Settings → General → Training Defaults, alongside the other two tenant defaults. Postgres numeric columns serialize as strings over the API (e.g. `"150.00"`), so both the wizard and the Settings form explicitly coerce with `Number(...)` before use — reading this value directly without coercion will throw on any code path that calls `.toFixed()` on it.
- **Timezone auto-detect (convenience only).** A newly created tenant's `tenant_settings.timezone` now starts genuinely `NULL` (the column's DB-level default was dropped in migration 011) instead of silently defaulting to `'America/Los_Angeles'` at row-creation time — this makes "never configured" a real, distinguishable state rather than indistinguishable from "explicitly chose Pacific." While `timezone` is `null`, the Settings page's timezone picker shows a suggestion banner using the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`, clearly labeled "Suggested, based on your browser," with an explicit **Use this timezone** button — it never auto-applies, and accepting it is still just an ordinary form edit that only takes effect once the admin clicks Save. `backend/src/utils/tenantTime.ts`'s `resolveTenantTimezone()` remains the sole authority for what an unset timezone resolves to for real date math (falls back to the same `DEFAULT_TENANT_TIMEZONE` constant as before); detection is never read by anything other than that one Settings-page suggestion. Existing tenants already sitting at the old default value are not backfilled to `NULL` — there is no way to tell whether that was ever an explicit choice, so they simply never see the suggestion.

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
BDP is **Capacity-Based** within an explicit time window: admins set both a start time and an end time for each working day (see § Instructor Availability: Weekly Checkbox Grid), and within that real window the engine automatically generates up to the configured capacity's worth of lesson slots, never letting a generated slot run past the window's own end time.

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
