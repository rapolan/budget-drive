# Manual UI/UX Testing Guide

This document covers two things:

1. **Setup** — the exact commands to get a clean local environment running, from an empty database to both dev servers up.
2. **Checklist** — a manual test pass through the app's core flows, in the order a real user would hit them.

---

## 1. Setup — clean local environment

Run these in order. Commands are shown from the repo root unless noted.

### 1.1 Prerequisites

- PostgreSQL running locally, reachable with the credentials in `backend/.env`
- Node.js 20+ (see `backend/package.json` → `engines`)
- `backend/.env` configured (copy `backend/.env.example` if you don't have one — you need at minimum `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`)
- `frontend/.env` configured (copy `frontend/.env.example`; `VITE_API_URL` should point at your backend, e.g. `http://127.0.0.1:4000/api/v1`)

### 1.2 Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 1.3 Create/reset the database

If the database doesn't exist yet:

```bash
cd backend
node database/setup-db.js
```

If you want a **fully clean slate** (drops and recreates — local dev data only, never run this against anything real):

```bash
cd backend
node -e "
const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'postgres', user: process.env.DB_USER, password: process.env.DB_PASSWORD });
(async () => {
  await client.connect();
  await client.query('DROP DATABASE IF EXISTS ' + process.env.DB_NAME);
  await client.query('CREATE DATABASE ' + process.env.DB_NAME);
  console.log('Database reset: ' + process.env.DB_NAME);
  await client.end();
})();
"
```

### 1.4 Run migrations

The full schema now lives in a single `001_baseline.sql` file, so either the direct migration runner or the "run all" script works:

```bash
cd backend
node database/run-all-migrations.js
```

Expected output: `001_baseline.sql` listed with `✅ ... completed` (or `⏭️ already applied` on a re-run).

### 1.5 Seed the database

```bash
cd backend
node database/run-seed.js
```

This runs every file in `backend/database/seeds/` in order (`000_admin_user.sql` → `001_budget_driving_school.sql` → `002_demo_lessons_payments.sql` → `003_manual_test_dataset.sql`) and finishes with a data-integrity validation pass. Expected tail of the output:

```
📊 Database Summary:
  - 1 Tenant(s)
  - 8 Students
  - 3 Instructors
  - 3 Vehicles
  - 40 Lessons
  - 20 Payments
  - 0 Active Recurring Patterns

✅ All data integrity checks passed!
```

**Admin login credentials** (printed by the seed, also documented here):

```
Email:    admin@budgetdrivingschool.com
Password: AdminPassword123!
```

Other seeded logins (all use the same password): `InstructorPass123!` for `john.smith@budgetdrivingschool.com`, `maria.rodriguez@budgetdrivingschool.com`, and `priya.patel@budgetdrivingschool.com`.

### 1.6 Start the backend

```bash
cd backend
npm run dev
```

Expected: `Server running on port: 4000` (or whatever `PORT` is set to in `.env`) and `[ledger] BSV disabled — using NoopLedgerService`. Confirm with:

```bash
curl http://localhost:4000/health
```
→ `{"success":true,"status":"UP",...}`

### 1.7 Start the frontend

In a second terminal:

```bash
cd frontend
npm run dev
```

Expected: Vite prints `Local: http://localhost:5173/`. Open that URL in a browser.

### 1.8 Or: start both servers with one script

Once dependencies are installed and the database is seeded (steps 1.2–1.5), `./start-dev.ps1` from the repo root does steps 1.6 and 1.7 for you — it frees ports 4000/5173 if anything stale is holding them, then launches backend and frontend each in their own window. Stop both with `./start-dev.ps1 -Stop`.

### 1.9 Full command sequence (copy-paste)

```bash
# Terminal 1 — one-time setup
cd backend
npm install
node database/setup-db.js
node database/run-all-migrations.js
node database/run-seed.js

# Terminal 1 — backend server
npm run dev

# Terminal 2 — frontend server
cd frontend
npm install
npm run dev
```

---

## 2. Manual test checklist

Work through these in order — later steps assume earlier ones passed. Use the admin login (`admin@budgetdrivingschool.com` / `AdminPassword123!`) unless a step says otherwise.

### 2.1 Login

**Do:** Go to `http://localhost:5173`, you should land on `/login`. Enter the admin credentials and submit.

**Pass looks like:** Redirected to the dashboard (`/`). No console errors. A JWT is visible in the login network response (`POST /api/v1/auth/login` → `200`, `data.token` present, `data.tenantId` matches the seeded tenant).

**Also check:** Submitting a wrong password shows an inline error and stays on `/login` (no redirect, no crash).

### 2.2 Dashboard

**Do:** Land on `/` after login.

**Pass looks like:** Stats cards render (lessons, students, revenue, etc.) without "undefined" or "NaN". Today's schedule widget shows the 3 lessons seeded for today (John Smith/Jessica Park, Maria Rodriguez/Tyler Brooks, Priya Patel/Noah Kim). No infinite loading spinners.

**Note:** the seed data's lesson dates are relative to `CURRENT_DATE` at the moment `run-seed.js` runs, not to whenever you happen to be testing. If time has passed since seeding, "today's" seeded lessons will no longer be dated today and the widget will correctly show nothing — re-seed (§1.5) immediately before this check if you need to see it populated.

### 2.3 Students

**Do:** Go to `/students`.

**Pass looks like:** All 8 seeded students appear (Sarah, Michael, Jessica, Tyler, Aisha, Noah, Olivia, Marcus), with progress stages visibly different — Noah at 0 lessons, Olivia near her lesson count, Marcus at `completed` status. Every progress bar (table and card view — both render the same shared component) reads `"X / Y lessons"` with a percentage next to it, in one consistent color (blue, or green only at 100%) regardless of whether the student is a minor or an adult — there is no amber tier, and no student should ever show a raw decimal like `"30.00"`. Search and status filter both narrow the list correctly. Opening a student shows their lesson history including a mix of completed/cancelled entries for students who have them (e.g. Michael Chen has a cancelled lesson).

**Note on ages:** Noah Kim's and Olivia Garcia's dates of birth are seeded *relative to the current date* (`CURRENT_DATE - INTERVAL 'N years'`), not fixed calendar dates, specifically so they stay minors (and therefore stay on the hours track) no matter how much real time has passed since the repo was cloned. Every other seeded student has a fixed date of birth and will drift into adulthood over the years — that's expected, not a bug to chase.

### 2.3a Progress, completion, and alerts

**Do:** Open Noah Kim's or Olivia Garcia's detail record (the two seeded minors) and check their Progress tab. Then open the Dashboard.

**Pass looks like:** Their "Training Progress" figure at the top reads a lesson count (e.g. `"0 / 15 lessons"`), same as the list. Below it, a separate **"Required Hours"** box shows the underlying hours figure (e.g. `"0 / 30 hrs"`) with a caption noting California requires that many behind-the-wheel hours for minors — this box only appears for minors, since it's the legally meaningful number the list's lesson count doesn't capture on its own. An adult student's Progress tab instead shows only a lessons-style label (e.g. `"2 of 3 lessons (67%)"`, or `"No lessons booked"` if they have none — not `"0%"`), no hours box. The Dashboard's Alerts card shows a "Turning 18" row for **Aisha Williams** — she's seeded as an adult but pinned to the hours track via `track_override` (so this alert has a stable example regardless of how her literal age drifts over time) and is permanently under-booked (28 completed + 8 scheduled hours < 30 required) — this alert still compares hours underneath, unaffected by the list's lesson-count display. Clicking the alert filters the Students list. From that student's Progress tab, the three admin actions (keep on hours track / switch to lessons track / mark program complete) are visible and each calls through to `PUT /students/:id` or `POST /students/:id/complete`.

**Also check — short-lesson mismatch:** Book a minor three lessons of 90 minutes each (shorter than the tenant's 120-minute standard length) and mark all three `completed`. Their required lesson count (`ceil(hoursRequired * 60 / 120)`) is now met, but their hours total (4.5 of a typical 6-hour requirement) is not. Opening that student's Progress tab should show a clear warning banner — *"Lesson count met, but only 4.5 of 6 required hours logged — do not mark this program complete yet."* — distinct from the "Required Hours" box above it. This is the intended behavior when lesson durations are shorter than standard, not a bug.

**Also check — no-show follow-up:** Mark a scheduled lesson as `no_show` (via its lesson actions). The Dashboard's Alerts card should show a "No-Show Follow-Up" row for that student, with a dismiss button. Dismissing it removes the row. Separately, booking that student a new lesson should also clear the alert automatically (refresh the Dashboard to confirm) without needing to dismiss it manually.

**Also check — completion:** Use the "Mark program complete" action (requires a non-empty reason) on any student. The student's status becomes `completed` and they still appear in bookable lists. This is a manual admin decision — there is no automatic hours-threshold completion.

### 2.3b Guardians tab

**Do:** Go to `/students`. Click the **Guardians** segment in the header toggle (next to **Students**, in the same header row — there is no separate top-level nav item for this).

**Pass looks like:** The page body swaps to a guardians list (name, email/phone, paginated) with its own search box behavior — typing filters the currently-loaded page client-side. The "Add Student" button relabels to "Add Guardian" and opens a blank `GuardianModal`. Clicking any guardian row opens that guardian's detail modal.

**Also check — guardian detail:** Open **Grace Kim**, the one seeded guardian — she's linked to Noah Kim as primary mother. The modal shows editable first/last/email/phone fields and a **Linked Students** section listing every student currently linked to them (relationship badge, a star icon on the primary), *not* labeled "past and present" — this app has no unlink history, so the section only ever shows current links. Olivia Garcia (also a minor) is seeded with zero guardians on purpose — she's the example for the `needsGuardian` check in 2.3f.

### 2.3c Guardian-first enrollment (the phone-call flow)

**Do:** From an existing guardian's detail modal (2.3b), click **Enroll another student**.

**Pass looks like:** The student form opens in create mode with that guardian already selected in the Guardian section (shown as a name + "Change" link, not the search box). The **last name**, **home address**, and **emergency contact** fields are pre-filled from the guardian's primary (or most-recently-added) linked student. **Date of birth, training hours, and permit fields are blank** — confirm these are never carried over. Fill in the remaining required fields and submit; the student is created and linked to the guardian in one request (`POST /api/v1/students/with-guardian` — check the Network tab, there should be no separate follow-up `POST /students/:id/guardians` call).

**Note if using the seeded Grace Kim / Noah Kim pair:** Noah's seeded address only fills the legacy free-text `address` field, not the structured `address_line1`/city/state/zip columns the student form actually prefills from — so the home-address fields will come up blank. That's expected given the seed data, not a bug; pick a student with a structured address if you want to see the prefill populate.

### 2.3d Student-first guardian entry (the walk-in flow) - fields first, link existing as the secondary path

**Do:** Click **Add Student** (Students tab). In the new "Guardian" section, look at what's showing by default.

**Pass looks like:** Blank **first/last/email/phone** fields and a **Relationship** dropdown are already open - no click needed to reach them. Most guardians being added are new people, not a returning family's existing guardian, so the fields are the default landing spot rather than a search box. A **"Link existing guardian"** action sits above the fields for the rarer returning-family case.

**Also check — link existing guardian:** Click **Link existing guardian**. It swaps to a search box; type a name, email, or phone that matches an existing guardian (e.g. one created in 2.3b). Candidates appear below the box as you type, each showing email/phone and, if applicable, "Parent of: <names>" for disambiguation. A **"Create new guardian instead"** option at the bottom of the list returns you to the blank fields. Clicking a candidate selects it (shown as name + "Change") and reveals the Relationship dropdown. Neither the search nor a selection does anything by itself — no network request fires until you click **Add Guardian**, which stages it into the sub-panel's list (still nothing saved to the server yet).

**Also check — inline match hint:** Back on the blank fields (not the search box), start typing a last name, email, or phone that matches an existing guardian (e.g. type "Rodriguez" if a guardian with that last name exists). Below the fields, an unobtrusive line appears: "<name> ... already exists - link instead?" (with "parent of <student>" context if applicable, same as the search picker shows). Confirm: typing is never blocked or interrupted by the hint appearing. Clicking the hint links that guardian and collapses the form back to the sub-panel's row list, the same as picking it from "Link existing guardian" would. Typing a name with **no** match shows no hint at all.

**Also check — emergency contact "same as guardian":** Check the new "Add an emergency contact" checkbox to reveal the emergency-contact fields (it's unchecked by default on a blank form). With one guardian staged, check "Same as guardian" — confirm it copies name and phone into the emergency-contact fields immediately, with no radio list, and that unchecking the emergency-contact checkbox does *not* clear those fields afterward.

### 2.3e Duplicate guardian confirm (the save-time backstop)

**Do:** Start creating a new student. In the Guardian section's blank fields (no click needed to reach them), enter an email or phone that already belongs to an existing guardian, but **ignore** the inline match hint that appears - don't click it. Click **Add Guardian** anyway.

**Pass looks like:** Instead of staging it, the picker swaps to a confirmation panel naming the matched guardian and their linked students (e.g. "Jane Doe, parent of Alice Smith"), with two buttons: **Link to this guardian** and **Create separate record**, plus Cancel. Confirm: this panel never appears for a name-only match (only email/phone), and nothing is staged until you click one of the two buttons. "Link to this guardian" stages the existing record; "Create separate record" stages a brand-new guardian sharing that contact info (this app allows that on purpose — e.g. divorced parents). This is the same backstop whether the inline hint appeared and was ignored, or the match wasn't visible as a hint at all (e.g. it only matched on phone while you were focused on the email field) - the confirm panel is the final safety net either way. Repeat this same check in **edit mode** (open an existing student, add a guardian via the sub-panel) - the backstop fires there too, immediately rather than at form submit, since edit-mode guardian actions hit the API right away.

### 2.3f Siblings and unified search

**Do:** Using 2.3c or 2.3d, enroll two students under the same guardian. Open either student's detail view.

**Pass looks like:** A "Siblings: <name>" line appears (details view) listing the other student(s) sharing that guardian. Then, from either the Students or Guardians tab, type part of a name/email/phone shared by a student and a guardian into the shared search box.

**Pass looks like (search):** Results overlay the current tab's list regardless of which tab is active, each row labeled "Student" or "Guardian". The status filter chips are hidden while search results are showing. Clearing the box reverts to the normal list for whichever tab is active.

**Note:** existing `needsGuardian` warning banner (in the student form) and the "Needs Guardian" badge/filter chip (Students list) are unchanged by this feature — they exist specifically to flag records created *before* this guardian UI existed, so admins can go back and correct them. The next section (2.3g) is exactly how those flagged records now get resolved.

### 2.3g Adding a guardian to an existing (e.g. seeded) student

**Do:** Open **Olivia Garcia** (seeded with zero guardians, `needsGuardian` flagged) in edit mode. Find the guardian sub-panel — previously this picker only appeared in create mode, so a student created before the guardian feature shipped had no way to get one through the UI.

**Pass looks like:** The sub-panel is present and shows "+ Add guardian". Click it - blank fields open directly (fields-first, same as create mode). Either fill them in for a new guardian, or click **Link existing guardian** to search for one (e.g. Grace Kim), then click **Add Guardian**. Unlike create mode, this fires immediately — check the Network tab for a `POST /api/v1/students/:id/guardians` call (not `with-guardian`, since the student already exists). The new guardian appears as a row in the sub-panel right away, and the `needsGuardian` badge/banner clears without a page reload.

### 2.3h Adding a second guardian, and changing primary

**Do:** On a student who already has one linked guardian, click **+ Add guardian** again in the sub-panel and link or create a second guardian (e.g. divorced parents, or a grandparent who does pickups).

**Pass looks like:** Both guardians now show as rows; the first remains primary (filled star), the second is not primary. Click the star on the second guardian's row.

**Pass looks like (primary change):** The second guardian's star fills in and the first guardian's star empties — never both filled at once. This is a `PUT /api/v1/students/:id/guardians/:guardianId/primary` call, and the previous primary is demoted server-side in the same transaction, not just visually in the UI.

**Also check — relationship:** Change the **Relationship** dropdown on either row (e.g. to "grandparent"). Confirm it saves immediately (`PUT /api/v1/students/:id/guardians/:guardianId`) without needing a form submit, and persists after closing and reopening the student.

### 2.3i Attempting to unlink the last guardian of a minor

**Do:** On a minor student with exactly one linked guardian, look at that guardian's row in the sub-panel.

**Pass looks like:** The **Unlink** button is disabled, with a title/tooltip explaining that a minor's only guardian can't be removed. Add a second guardian (2.3h) — the first guardian's Unlink button becomes enabled once there are two. Unlink it; the remaining guardian's Unlink button becomes disabled again, back to the single-guardian state. For an **adult** student, Unlink is always enabled, even with only one guardian linked.

### 2.3j Creating a student with two guardians at once

**Do:** Click **Add Student**. Stage two guardians via the sub-panel's "+ Add guardian" (2.3d) before submitting — e.g. link one existing guardian and create one new guardian. Confirm the sub-panel shows both staged rows, with the first marked primary by default (you can click the other's star to change which one before submitting). Fill in the required student fields and submit.

**Pass looks like:** Exactly **one** `POST /api/v1/students/with-guardian` request fires (check the Network tab) — not two separate requests, and no follow-up `POST /students/:id/guardians` call. Its request body has a `guardians` array with two entries. The student is created with both guardians linked, and whichever one you set primary in the sub-panel before submitting is the one marked primary after creation.

### 2.4 Book a lesson (happy path)

**Do:** Go to `/scheduling` (or open the booking form from a student/instructor). Pick a student with no conflicting lesson (e.g. Marcus Lee, who is `completed` status but still bookable), pick an instructor with open availability, pick a future date/time that doesn't overlap an existing lesson for that instructor, submit.

**Pass looks like:** `POST /api/v1/lessons` returns `201`. The new lesson appears in the calendar/list immediately (or after a refetch) with status `scheduled`. No error toast.

### 2.5 Book a conflicting lesson (must be blocked)

**Do:** Try to book **John Smith** for **today, 09:30–10:30** (overlaps his seeded 09:00–11:00 lesson with Jessica Park) — same student/vehicle doesn't matter, the instructor overlap alone should trigger it.

**Pass looks like:** The request is rejected — `POST /api/v1/lessons` returns `409`, with `error` containing a clear, specific message: `"Scheduling conflict: Instructor already has a lesson during this time"`. The UI surfaces this message to the user (not a generic "something went wrong"), and no lesson is created (refresh the list/calendar to confirm nothing new appears at that slot).

**Also try:** Booking the same **vehicle** (Honda Civic) for two different instructors at an overlapping time, and booking the same **student** twice at overlapping times — both should be blocked with their own specific conflict type (`vehicle_busy` / `student_busy`).

### 2.6 Record a payment

**Do:** Go to `/payments`, create a new payment for a student (e.g. a lesson fee for Noah Kim), pick a payment method, submit.

**Pass looks like:** `POST /api/v1/payments` returns `201`. The payment appears in the payments list with the correct amount/method/status. The student's `outstandingBalance`/`totalPaid` reflects the change if the UI surfaces it.

### 2.7 Treasury status (ledger seam)

**Do:** With a valid admin token, call:

```bash
curl http://localhost:4000/api/v1/treasury/status \
  -H "Authorization: Bearer <token from login>"
```

**Pass looks like:** `200 OK` with body `{"success":true,"data":{"enabled":false,"provider":"noop"}}` — confirming `BSV_ENABLED=false` is wired through to the noop ledger. (If you also poke `GET /api/v1/treasury/balance`, expect `501` with `{"success":false,"message":"Ledger disabled"}` — that's correct, not a bug.)

### 2.8 Calendar feed

**Do:** Go to `/instructors`, open an instructor (e.g. Maria Rodriguez), find the calendar feed section in the modal (ICS subscription URL / status / regenerate button).

**Pass looks like:** The feed status loads without error (`GET /api/v1/calendar-feed/feed/status/:instructorId`). Clicking "set up" or "regenerate" returns a feed URL. Opening that URL directly in a browser (or `curl`) returns `Content-Type: text/calendar` with the instructor's upcoming lessons as `VEVENT` entries — you should see the seeded future lessons for that instructor.

### 2.9 Notifications

**Do:** Go to `/notifications` (settings) and `/notification-history`.

**Pass looks like:** Notification settings page renders its toggles and "Save" persists to `localStorage` without error (this page is local-only, no backend call — that's expected, not a bug). `/notification-history` loads via `GET /api/v1/notifications/history` (may be empty on a fresh seed since no notification jobs have run yet — an empty state is a pass, not a failure). No console errors on either page.

### 2.10 Team Settings: invite, accept, and role enforcement

**Do:** As admin, go to `/settings` → **Team** tab. Click "Invite User", enter a new email, pick a role (`admin`/`staff`/`instructor` — the dropdown doesn't offer `owner`/`viewer`), submit. Copy the invite link from the response (shape: `http://localhost:5173/accept-invite?token=<64-char-hex>`). Open it in a private/incognito window, set a password, submit.

**Pass looks like:** The invite call returns `201`/`200` with the link. Opening the link renders the **Accept Invite** page (`/accept-invite`) with a password + confirm-password field — not a redirect to `/login` or a blank page. Submitting a matching password pair shows a success message and redirects to `/login` after ~2s. Logging in with the new email + chosen password succeeds and lands on the dashboard.

**Also check — role enforcement:**
- Log in as one of the seeded instructor accounts (`john.smith@budgetdrivingschool.com` / `InstructorPass123!`). Confirm the sidebar does **not** show Instructors, Vehicles, Scheduling, Instructor Earnings, Treasury, Public Profile, or Settings nav items (these are restricted to `owner`/`admin`/`staff` per `Sidebar.tsx`'s role filter).
- With that instructor's token, call `POST /api/v1/users/invite` directly (e.g. via curl or the browser devtools network tab replaying the request) — expect **403**, not 200.
- **Caveat to be aware of, not a bug to chase:** nav-item hiding is cosmetic/client-side only. If an instructor manually types `/settings` into the URL bar, the Settings page still mounts client-side (there's no route-level role guard, only nav-link hiding) — the actual protection is that its data-fetching API calls will 403. Confirm this is what actually happens (page shell renders, but team data / actions fail or don't load) rather than the page silently leaking admin data.

### 2.11 Ranked slot search

**Do:** Open the booking form without a preselected instructor (e.g. `/scheduling` → "Book a Lesson"), search for slots for a student whose pickup zip differs in distance from each instructor's home zip. Separately, open the booking form **from a specific instructor's calendar** (preselected instructor).

**Pass looks like:** In the unscoped search, results are ordered by proximity score descending (closest instructor/location first), and within equal proximity, by date/time ascending — you should be able to see slots for the closest instructor's zip region appear before a farther one. In the preselected-instructor case, **every** returned slot belongs to that one instructor only — no other instructor's availability appears in the list.

### 2.12 Conflict copy: buffer, capacity, and vehicle conflicts

**Do:** Trigger each of these and confirm the UI shows its specific friendly message (from `frontend/src/utils/conflictMessages.ts`), not a generic "something went wrong":
- **Buffer violation:** with "Allow back-to-back lessons" off (Settings → Scheduling, the default), book a lesson for an instructor, then try to book another lesson for the **same instructor** starting less than the buffer window (15 min by default) after the first ends. Expect: *"There needs to be a 30-minute buffer between lessons. Please choose a time slot with more spacing."* (Note: this message always says "30-minute" regardless of the tenant's actual configured buffer value — a copy/config mismatch worth knowing about, not something to "fix" during this pass.)
- **Capacity reached:** book 3 lessons for one instructor on one day (3 is the default `default_max_students_per_day`), then try to book a 4th new lesson for that instructor on that same day. Expect: *"This instructor has reached their maximum students for the day. Please choose a different day."*
- **Vehicle busy:** book two lessons at overlapping times using the same **school-owned** vehicle (instructor-owned vehicles don't trigger this check) — e.g. don't specify a vehicle and let auto-assignment exhaust the pool, or explicitly pick the same vehicle for both. Expect: *"The vehicle is already in use at this time. Please choose a different time slot."*

### 2.13 Stale-slot recovery

**Do:** Start a booking in one browser tab/session (search for slots, land on the slot-picker). In a second tab/session, book that same slot first (same instructor/time) so it's taken. Back in the first tab, select the now-stale slot and confirm.

**Pass looks like:** The confirm request fails with a race-condition-shaped conflict (`instructor_busy`/`vehicle_busy`/`student_busy`/`capacity_reached`/`buffer_violation`), the app automatically re-searches, and you're returned to the **slots** step (not left on a dead-end error). A blue notice box reads exactly: *"That slot was just taken - here are updated options."* The slot list is refreshed (the stale slot is no longer offered).

### 2.14 Reschedule on a full-capacity day

**Do:** Book 3 lessons for one instructor on one day (hitting the default capacity). Then try two different things:
1. Use the **"Reschedule"** button on an existing lesson for a *different* student — this opens a fresh booking flow. Try to book it onto the same full day for the same instructor.
2. Use the **pencil/edit icon** on an existing lesson to open its edit modal directly, and change its date to that same full day for that same instructor.

**Pass looks like:**
1. The reschedule-via-button path creates a genuinely new lesson request and correctly gets blocked with a `409` / `capacity_reached` conflict, same as any other new booking.
2. **This is a known gap, not a pass/fail check** — the direct edit-modal path currently performs **no conflict or capacity validation at all**. Moving a lesson to an already-full day (or even onto a time that overlaps another lesson for the same instructor) will silently succeed. This is not a designed exemption; it's an unvalidated write path (`PUT /lessons/:id` → `lessonService.updateLesson`) that never calls the scheduling-conflict check the "create" path uses. Confirm this is still the current behavior and note it — do not treat a "successful" edit here as a passing test of an intentional feature.

### 2.15 Theme toggle

**Do:** Click the sun/moon icon in the header to toggle dark mode. Hard-reload the page (not just a client-side navigation).

**Pass looks like:** The UI switches between light/dark immediately on toggle (a `dark` class is added/removed on the `<html>` element). After a hard reload, the same theme is still active — check `localStorage.getItem('theme')` in devtools, it should read `"light"` or `"dark"` matching what's currently displayed.

### 2.16 Treasury status (ledger seam)

**Do:** With `BSV_ENABLED=false` in `backend/.env` (the documented default — see note below if your local `.env` differs) and a valid admin token:

```bash
curl http://localhost:4000/api/v1/treasury/status \
  -H "Authorization: Bearer <token from login>"
```

**Pass looks like:** `200 OK` with body `{"success":true,"data":{"enabled":false,"provider":"noop"}}`. There is no UI surface for this endpoint (the Treasury page only calls `/statistics`, `/balance`, and `/transactions` — none of which are the same as `/status`), so this is curl/API-only, which is expected, not a gap.

**Note:** the ledger implementation is chosen once at backend startup from `BSV_ENABLED`, not per-request — if you change it, restart the backend for it to take effect.

### 2.17 Changing a tenant's timezone

**Do:** Go to `/settings` → **General** tab, find the **Localization** card, change **School Timezone** from Pacific to `Eastern Time (New York)`, click **Save General Settings**. Then check three backend-sourced surfaces: (a) go to `/scheduling` and search for available slots for tomorrow, (b) book a new lesson and check its stored date/time, (c) send/regenerate a lesson invite or calendar-feed URL for an upcoming lesson.

**Pass looks like:** The save succeeds (`PUT /api/v1/tenant/settings` returns `200`, no "Invalid timezone" error). Scheduling's "tomorrow" search window now reflects the Eastern calendar day, not whatever it showed under Pacific — near a day boundary (e.g. testing late in the Pacific evening) this can visibly shift which date "tomorrow" resolves to. A freshly booked lesson's stored `date`/`start_time` match the wall-clock time you selected in the booking form (a "2pm" slot is still stored as `14:00:00`, per Constraint A — only which zone "2pm" is interpreted in has changed). The lesson invite's date text and the `.ics` feed's `DTSTART`/`DTEND` (viewed in a calendar client, or inspect the raw `.ics` text for a `Z`-suffixed UTC instant) reflect the new Eastern time correctly.

**Also check — invalid input:** Attempt `PUT /api/v1/tenant/settings` with `{"timezone": "Not/A_Real_Zone"}` directly (curl or devtools). Expect `400` with an "Invalid timezone" message, and confirm (via a follow-up `GET /api/v1/tenant/settings`) the tenant's timezone was **not** changed.

**Known gap, not a bug to chase:** the frontend does not yet resolve its own "today"/"this week" boundaries (Dashboard, Lessons, the calendar view, the instructor weekly schedule) through the tenant's timezone — those still use the browser's local clock. Changing the tenant's timezone in this test will not visibly change what those specific pages consider "today" unless your browser's own timezone happens to match. This is a tracked, deliberate follow-up (see docs/ARCHITECTURE.md § Tenant Timezone Authority), not something this checklist step is meant to catch.

### 2.18 Searching a specific month via preset

**Do:** Open the booking wizard's setup step. Click **This Month**, then separately click **Next Month**, noting the From/To values each time. Pick a tenant/date combination that straddles a month boundary if possible (e.g. run this test in the last few days of a month so "This Month" and "Next Month" are visibly different spans), and if you can, try it once for a 31-day month rolling into a 30-day month (e.g. May → June).

**Pass looks like:** Clicking a preset chip highlights it (active style) and immediately populates both From and To with the computed boundary — no loading flicker where the inputs sit empty. **This Month**'s To date is the actual last day of the current calendar month (28/29/30/31 as appropriate), not a fixed offset. **Next Month**'s From is the 1st of next month and its To is the last day of *that* month — for a May → June rollover this must read **06/30**, never 06/31. Searching with either preset active only returns slots inside that window (spot-check a returned slot's date falls between From and To inclusive).

### 2.19 Searching a custom week

**Do:** On the setup step, manually edit the **From** date input to a date of your choosing (e.g. "the week of the 15th" of some future month), then edit **To** to 6-7 days later.

**Pass looks like:** As soon as you touch either date field, the preset chips all lose their active highlight (none of "Next 2 Weeks"/"This Month"/"Next Month" stays selected) — editing a date always switches the control to an implicit "Custom" state. The search runs against exactly the typed range. Separately, try setting **To** before **From**: expect the search to fail with a clear inverted-range error rather than silently returning an empty or wrong list.

### 2.20 Booking three lessons for one student in a single session

**Do:** Open the booking wizard for a student with **Book Lesson** (not Book Again). Search, pick a slot, confirm. On the resulting success screen, click **Book Another Lesson**. Repeat two more times for a total of three separate lessons, then click **Done** on the last one.

**Pass looks like:** After the first confirm, you land on a success screen reading "Lesson Booked!" with **Done** and **Book Another Lesson** buttons — the wizard does not close. Clicking **Book Another Lesson** returns you to the **slot list** (not back to the setup step — you should not have to re-pick student/instructor/duration/lesson type/date range), the list is freshly re-searched, and the slot you just booked is no longer offered. All three lessons show up independently on the student's record / the Lessons page, each having gone through a normal conflict check (try deliberately colliding the second or third booking with the first, e.g. same instructor/overlapping time, and confirm it's rejected exactly like any standalone booking — see §2.13 for what that recovery looks like if you land on an already-taken slot mid-loop). Clicking **Done** at any point closes the wizard in one click with no extra confirmation step.

### 2.21 Rebooking a returning student with prefilled preferences

**Do:** Open a student who already has at least one past lesson (student detail / edit modal) and click **Book Again**. Separately, open a student with **no** prior lessons at all and confirm what button(s) are available.

**Pass looks like:** For the student with history, the wizard opens directly on the **setup** step (not skipped ahead to slot selection or confirm) with instructor, duration, lesson type, time-of-day preference, and pickup address all prefilled from that student's most recent lesson. The prefilled instructor is shown as the default selection but is a normal, changeable dropdown (including an "any available instructor" option) — confirm you can switch it to a different instructor or to "any" before searching. For the student with no prior lessons, no **Book Again** button appears at all (only the plain **Book Lesson** entry point) — opening the wizard via the normal path works cleanly with no error and no stale/blank prefill.

**Regression guard, cross-reference §2.14:** the **Reschedule** flow's instructor display must still be the original locked, non-editable card — open Reschedule on any existing lesson and confirm there is no dropdown/selector next to the instructor, only the plain display. The free-choice instructor selector introduced for Book Again must never appear there.

### 2.22 Booking-workflow screenshot script (manual, on-demand)

Not part of the automated suite or CI — a small Playwright script for visually spot-checking the setup step's date presets and the success state's "Book another" offer, in both themes.

**Do:**
```bash
cd frontend
npm run screenshots
```
Requires both dev servers already running (backend on `:4000`, frontend on `:5173` — see §1) with the repo's seed data loaded. First run creates a saved login session (`e2e-screenshots/.auth/admin.json`, gitignored); subsequent runs reuse it so the script doesn't repeatedly hit the backend's `authLimiter`.

**Pass looks like:** All 5 checks (1 login setup + 4 screenshot tests) pass, producing `setup-step-light.png`, `setup-step-dark.png`, `success-state-light.png`, `success-state-dark.png` in `frontend/e2e-screenshots/__screenshots__/` (gitignored — these are point-in-time captures for manual review, not committed golden-master baselines). Open each PNG and confirm: the setup-step screenshots show the three preset chips with "Next 2 Weeks" active and populated From/To dates; the success-state screenshots show "Lesson Booked!" with a visible "Book Another Lesson" button; dark-theme screenshots are actually dark, not a light-theme capture mislabeled.

**If login times out with "Too many authentication attempts":** the backend's `authLimiter` (10 requests/15 min, in-memory) was exhausted by repeated runs. Either wait out the 15-minute window or restart the backend dev server, which resets its in-memory rate-limit store.

### 2.23 Default lesson cost

**Do:** Go to `/settings` → **General** tab → **Training Defaults** → **Default Lesson Cost**, change it to a new value (e.g. `$175`) via either the number input or one of the quick-select chips, and click **Save General Settings**. Then open the booking wizard for any student, search, and select a slot to reach the Confirm step.

**Pass looks like:** The save succeeds and the field still shows the new value after a page refresh. The Confirm step's **Cost ($)** field is prefilled with the new tenant default (not the old hardcoded `50`), and the **Confirm Booking - $175.00** button label reflects it. The field is still freely editable — type a different amount, confirm the booking, and check the created lesson's stored cost matches what you typed, not the tenant default. Existing lessons booked before the change keep whatever cost they already had (no backfill).

**Also check — "Book Another":** from the success step, click **Book Another Lesson**. The next Confirm step's cost field resets to the tenant default again, not to whatever you'd typed for the previous lesson in this session.

### 2.24 Timezone auto-detect suggestion

**Do:** This one needs a tenant whose `tenant_settings.timezone` is genuinely `NULL` — a brand-new tenant created after this feature shipped qualifies; an existing tenant that already has a timezone value (including ones sitting at the old default) will never show the suggestion, by design. If you don't have a fresh tenant handy, this is easiest to verify by temporarily nulling the row directly (`UPDATE tenant_settings SET timezone = NULL WHERE tenant_id = '<id>'`), reloading `/settings` → **General**, and restoring the original value afterward. Set your OS/browser timezone to something other than Pacific before loading the page, so the detected suggestion is visibly different from the fallback shown in the dropdown.

**Pass looks like:** A suggestion banner appears above the timezone dropdown reading "Suggested, based on your browser: **\<your zone\>**" with a **Use this timezone** button — the dropdown itself still shows the ordinary hardcoded Pacific fallback, unchanged, until you act. Clicking **Use this timezone** updates the dropdown to the suggested zone but does **not** save anything by itself — the banner's job is done at that point (it won't reappear once the value differs from the suggestion), and only clicking **Save General Settings** afterward persists it. Once any timezone is saved (whether the suggestion or a manually picked one), `tenant_settings.timezone` is no longer null and the banner never appears again for that tenant, even if you clear the dropdown back toward the old value.

**Also check — existing tenants never see it:** on a tenant whose timezone is already set to anything (including the pre-migration default), confirm the banner never renders, regardless of what the browser's detected zone is.

### 2.25 Editing a weekly availability grid and saving

**Do:** Go to `/scheduling` → select any instructor → **Availability** tab. Check a currently-unchecked day, set a Start time, End time, and pick a Max Students value, then click **Save Week**.

**Pass looks like:** The summary line at the top (e.g. "4 days · 26 hrs") updates immediately as you edit, before you ever click Save. **Save Week** is disabled until you actually change something, then becomes enabled. After clicking it, the button shows a saving state, then the page reflects the saved values. Refresh the page (or re-select the instructor) — the day you just configured still shows checked with the same start/end/max-students values, confirming the write persisted to `instructor_availability`, not just local state.

### 2.26 Unchecking a day (row survives, inactive, not deleted)

**Do:** On an instructor with at least one working day configured, uncheck that day's checkbox. Before saving, re-check the same box.

**Pass looks like:** Unchecking immediately collapses the row to a muted **Not working** label — the Start/End/Max Students inputs disappear. Re-checking it again (still before saving) instantly restores the exact times and cap it had before, with no network request in between — this is a pure local-state restore within the same editing session. Now click **Save Week** with the day left unchecked, and confirm via the API directly (`GET /api/v1/availability/instructor/:id` with a valid token) that no row for that day of week appears in the response — the row still exists in the database (it was deactivated, not deleted), it's just excluded because the endpoint only returns active rows.

### 2.27 Copying one day's times and cap to all checked days

**Do:** Check at least two days with different start/end times and max-students values. Click **Copy to all checked days** on one of them.

**Pass looks like:** Every other currently-checked day's Start, End, and Max Students fields immediately update to match the row you copied from — unchecked days are untouched. This is a local edit only: open your browser's network tab first and confirm no request fires from the copy click itself; the copied values only reach the server once you click **Save Week** afterward.

### 2.28 Confirming slot search reflects an edited end time

**Do:** Shorten an instructor's availability for a specific day to a tight window that fits exactly one short lesson — e.g. `09:00`–`10:00` — and save. Then, using the booking wizard (or `POST /api/v1/availability/find-slots-ranked` directly), search that instructor on that date for a 60-minute lesson, then again for a 120-minute lesson.

**Pass looks like:** The 60-minute search returns exactly one slot, `09:00`–`10:00`, filling the window. The 120-minute search on the same day returns zero slots for that instructor — a lesson that can't fit inside the real, explicit end time is correctly rejected, not padded out past it. (If the student you're testing with already has another lesson booked that same day, you'll see zero slots for an unrelated reason — the one-lesson-per-student-per-day rule, not this feature; pick a student with no existing lesson on the test date.)

### 2.29 Reviewing a day in the Review Queue

**Do:** Ensure at least one `scheduled` lesson exists whose end time has already passed (seed data or a quick manual booking with a past date works). Go to `/`, find the **Lessons Need Review** alert, and click it.

**Pass looks like:** The Review Queue page lists day groups, most overdue first, each row showing student/instructor/time and three buttons (**Completed**/**No-show**/**Cancelled**). A day more than 24 hours overdue shows a visible "Overdue >24h" badge/warning styling; a day within the last 24 hours does not. Click **Mark all completed** on one day group — every lesson in that group moves to `completed` (confirm on the Lessons page, filtered to Completed), and that day group disappears from the queue once empty.

### 2.30 Marking a no-show and seeing the fee flag appear

**Do:** On the Lessons page, click a `scheduled` lesson's status badge to open the inline menu, choose **No-show**.

**Pass looks like:** A toast confirms the lesson was marked no-show, and the Status filter counts update (`Scheduled` count decreases by one, `No Show` increases by one). Open that student's record → **Progress** tab: an **Outstanding fee** banner appears listing the amount (matching `tenant_settings.cancellation_fee_amount`), reason ("No-show"), and date — never blocking anything else on the page.

### 2.31 Seeing the fee at booking

**Do:** With the student from §2.30 still carrying an outstanding fee, open the booking wizard and select that student on the setup step. Continue through to the Confirm step.

**Pass looks like:** A banner reading "N outstanding fee(s) ($X.XX) - collected separately, does not affect this booking" appears right after the student info card on both the setup step and the Confirm step's Booking Summary. Neither **Find Available Instructors** nor **Confirm Booking** is ever disabled because of it — complete the booking normally and confirm it succeeds.

### 2.32 Waiving a fee, and confirming it clears on the student's next completed lesson

**Do:** On the student record's Progress tab, click **Waive** next to the outstanding fee, type a reason, click **Confirm Waive**.

**Pass looks like:** The banner disappears immediately (or shows zero outstanding fees). Separately — with a *different*, still-outstanding fee flag on some student — mark that student's next lesson **Completed** (from the Lessons page or the Review Queue) and re-open their Progress tab: the outstanding fee banner is gone there too, cleared automatically by the completion, not by a manual waive.

### 2.33 Confirming a fee never appears in revenue or payments reporting

**Do:** Note the **Total Revenue** figure on `/payments` and the gross/net earnings for the fee flag's source lesson's instructor on `/instructor-earnings`, both *before* creating a fresh no-show fee flag (§2.30). Create the flag, then re-check both figures. Then go to `/settings` → **General** and confirm **Who Collects the Fee** is set to **Instructor** (the default) — with it set this way, open that student's record and confirm no "Record payment" action is offered next to the outstanding fee at all.

**Pass looks like:** Both the Payments page's Total Revenue and the instructor's gross/net earnings are unchanged before and after the fee flag is created — a fee flag is never summed into either. With `cancellation_fee_payee = 'instructor'`, no "Record payment" button appears anywhere. If you switch the setting to **School** and reload the student record, a **Record payment** action does appear next to the outstanding fee; clicking it creates a real row on `/payments` (Total Revenue now increases by that amount) and the fee flag's own status changes to `paid` — this is the one deliberate exception, and only reachable this way.

### 2.34 Saving an instructor's Driving School Instructor License

**Do:** Open an existing instructor's record and edit it. Under **Driving School Instructor License**, enter a license number and an expiration date, then save. Reload the page (or reopen the instructor from the list) and edit again.

**Pass looks like:** Both the license number and expiration date you entered are still there on reopen — they persisted, not silently discarded. The section is labeled "Driving School Instructor License" with a caption noting it's not a driver's license.

### 2.35 Adding and removing instructor service-area ZIP codes

**Do:** On the same instructor's edit form, scroll to **Service Area**. Type a 5-digit ZIP and click **Add**; repeat for a second ZIP. Click **Save Service Area**. Then remove one of the ZIPs (the × on its chip) and save again. Try adding an invalid entry (e.g. `921` or `abcde`).

**Pass looks like:** Each valid ZIP appears as a chip after adding; after saving and reloading, the saved list matches what you added. Removing a ZIP and re-saving persists the removal. The invalid entry is rejected with an inline message before it's ever added to the list.

### 2.36 Booking inside an instructor's configured service area

**Do:** Configure a service area for one instructor that includes a specific ZIP (e.g. `90210`). Open the booking wizard for a student whose pickup ZIP is that same ZIP, and search for slots. Also give a second instructor a service area that deliberately excludes that ZIP (or leave a third instructor unconfigured) so more than one group can appear.

**Pass looks like:** The configured, in-area instructor's slots appear at the top of the results, above any out-of-area instructor's slots. Any unconfigured instructor's slots also appear, ungrouped alongside the in-area instructor's (never excluded — an unconfigured instructor is always in-area). The "Outside their usual area" heading appears whenever any candidate instructor's configured area excludes the pickup ZIP — this is the routine case now, not a rare one, since service areas only rank results, never remove anyone from them.

### 2.37 Booking where only an unconfigured instructor is available

**Do:** Pick a pickup ZIP that no instructor has explicitly configured as part of their service area (i.e. every instructor in the tenant still has an empty service-area list, the default). Search for slots.

**Pass looks like:** Results appear normally, with no "Outside their usual area" section — every instructor with no configured service area is always treated as in-area, regardless of the pickup ZIP.

### 2.38 Booking where the closest instructor's configured area excludes the pickup ZIP

**Do:** Configure the instructor who would otherwise rank closest (best proximity to the pickup ZIP) with a service area that deliberately excludes it (e.g. their service area is `10001`, you search with pickup ZIP `90210`). Make sure at least one other, unconfigured or genuinely in-area instructor also has availability for the same search.

**Pass looks like:** The closest instructor's slots still appear — they are never dropped just because they configured a service area — but grouped under an **"Outside their usual area"** heading, sorted below the in-area group even though their raw proximity score may be better than any in-area instructor's. This is the exact scenario a prior version of this feature got wrong: configuring a service area used to risk losing your own closest-match slots to unconfigured competitors. It no longer does — service area only affects which group a result appears under, never whether it appears at all.

---

## 3. Known issues to route around

- **Email not configured**: the backend logs `⚠️ Email configuration incomplete` on startup — expected, `SMTP_USER`/`SMTP_PASS` aren't set by default. Notifications requiring actual email delivery won't send; this is not a bug to chase during UI testing.
- Port `4000` may already be in use by an unrelated local process on some machines — if `npm run dev` fails with `EADDRINUSE`, set `PORT` in `backend/.env` to a free port and update `frontend/.env`'s `VITE_API_URL` to match.
- **`BSV_ENABLED` drift**: this doc and CLAUDE.md both describe BSV as disabled by default (`BSV_ENABLED=false` → `NoopLedgerService`). If your local `backend/.env` has `BSV_ENABLED=true`, the backend will load the real `BsvLedgerService` instead, and §2.16's expected `provider: "noop"` response won't match. Set it to `false` and restart the backend before running §2.16, or expect a different (real ledger) response if you intentionally leave it `true`.
- **Lesson edit path has no conflict validation**: editing an existing lesson's date/time/instructor via the pencil-icon modal (as opposed to creating a new booking) does not run any scheduling-conflict or capacity check. It's possible to silently move a lesson into a double-booking or a full day this way. See §2.14 for the specific test case — this is a known gap, not expected behavior to preserve.
