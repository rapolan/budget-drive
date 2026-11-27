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

The schema is a numbered sequence of migration files (`001_baseline.sql` plus every append-only migration since), applied in order:

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

This runs every file in `backend/database/seeds/` in order (`000_admin_user.sql` → `001_budget_driving_school.sql`) and finishes with a data-integrity validation pass. Expected tail of the output:

```
📊 Database Summary:
  - 1 Tenant(s)
  - 9 Students
  - 3 Instructors
  - 3 Vehicles
  - 18 Lessons
  - 27 Payments
  - 0 Active Recurring Patterns

✅ All data integrity checks passed!
```

**Admin login credentials** (printed by the seed, also documented here):

```
Email:    admin@budgetdrivingschool.com
Password: AdminPassword123!
```

Other seeded logins (all use the same password): `InstructorPass123!` for `marcus.webb@budgetdrivingschool.com`, `renee.okafor@budgetdrivingschool.com`, and `devon.ashby@budgetdrivingschool.com`.

### 1.5a The seeded cast

One lean, lifecycle-covering dataset — every student is in a **different** lifecycle state so every flow below is exercisable without anyone being overloaded with lessons. Every minor's date of birth is `CURRENT_DATE - INTERVAL 'N years'` (never a fixed birth year) so they stay minors regardless of how much real time has passed since the repo was cloned; every lesson/enrollment date is likewise relative to `CURRENT_DATE`, not hardcoded.

**Instructors** — 3, each with a distinct (and partly overlapping) service area, for testing proximity ranking and out-of-area grouping:

| Instructor | License | Service area |
|---|---|---|
| Marcus Webb | Valid, expires in ~400 days | `90001`, `90002`, `90003` |
| Renee Okafor | **Expiring in ~20 days** — exercises the license-expiry alert | `90010`, `90011` |
| Devon Ashby | Valid, expires in ~300 days | `90003` (overlaps Marcus), `90020` |

**Students** — exactly 9, one per lifecycle state:

| # | Student | Lifecycle state | Exercises |
|---|---|---|---|
| 1 | Ivy Delgado | New minor, guardian linked, zero lessons | Fresh booking flow |
| 2 | Owen Castillo | New minor, **no guardian** | `needsGuardian` badge/filter |
| 3 | Mia Torres | Mid-progress minor, guardian linked: 1 completed lesson (2/6 hrs), 1 upcoming | Normal in-progress hours track |
| 4 | Leo Whitfield | Minor, guardian linked, required hours met (6/6), enrollment still active | "Mark complete" → certificate worklist |
| 5 | Ruby Sandoval | Completed minor, guardian linked, **certificate recorded** | Gold certificate badge, Completed filter, certificate log |
| 6 | Caleb Nguyen | **Withdrawn** minor, guardian linked, 2 lessons done before leaving | "Dropped" status, withdrawal transcript |
| 7 | Priya Anand | Mid-progress minor, guardian linked, **outstanding no-show fee** | Fee-at-next-lesson flow end to end |
| 8 | Jordan Vance | Mid-progress **adult**, no guardian, no certificate: 2 completed, 1 upcoming | Adults on the lessons track |
| 9 | Naomi Frasier | Completed **adult**, no certificate | Confirms a completed adult stays out of the minors-only certificate worklist |

Grace Kim's guardian role from the old cast is replaced by: Carla Delgado (Ivy's mother), Rosa Torres (Mia's mother), Grant Whitfield (Leo's father), Elena Sandoval (Ruby's mother), Minh Nguyen (Caleb's father), and Deepa Anand (Priya's mother) — six guardians total, one per linked minor. Owen Castillo is the one minor deliberately left unlinked.

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

**Pass looks like:** Stats cards render (lessons, students, revenue, etc.) without "undefined" or "NaN". No infinite loading spinners. (The current seed has no lessons pinned to exactly "today" — the seeded lesson dates are relative offsets from `CURRENT_DATE` at the moment `run-seed.js` runs, so what's "on the calendar today" varies lesson-by-lesson; there's no single day guaranteed to show all three instructors booked.)

**Note:** the seed data's lesson dates are relative to `CURRENT_DATE` at the moment `run-seed.js` runs, not to whenever you happen to be testing. If time has passed since seeding, "today's" seeded lessons will no longer be dated today and the widget will correctly show nothing — re-seed (§1.5) immediately before this check if you need to see it populated.

### 2.3 Students

**Do:** Go to `/students`.

**Pass looks like:** All 9 seeded students appear (Ivy, Owen, Mia, Leo, Ruby, Caleb, Priya, Jordan, Naomi — see §1.5a for the full cast table), with progress stages visibly different — Ivy Delgado at 0 lessons, Leo Whitfield at 6/6 required hours (ready to complete), Ruby Sandoval and Naomi Frasier at `completed` status. Every progress bar (table and card view — both render the same shared component) reads `"X / Y lessons"` with a percentage next to it, in one consistent color (blue, or green only at 100%) regardless of whether the student is a minor or an adult — there is no amber tier, and no student should ever show a raw decimal like `"6.00"`. Search and status filter both narrow the list correctly. Opening a student shows their lesson history including a mix of statuses for students who have them (e.g. Priya Anand has a `no_show` lesson).

**Note on ages:** every minor's date of birth (Ivy, Owen, Mia, Leo, Ruby, Caleb, Priya) is seeded *relative to the current date* (`CURRENT_DATE - INTERVAL 'N years'`), not a fixed calendar date, specifically so they stay minors (and therefore stay on the hours track) no matter how much real time has passed since the repo was cloned. The two adults (Jordan Vance, Naomi Frasier) have fixed dates of birth and will simply keep aging normally — that's expected, not a bug to chase.

### 2.3a Progress, completion, and alerts

**Do:** Open **Ivy Delgado**'s or **Leo Whitfield**'s detail record (both seeded minors) and check their Progress tab. Then open the Dashboard.

**Pass looks like:** Their "Training Progress" figure at the top reads a lesson count, same as the list. Below it, a separate **"Required Hours"** box shows the underlying hours figure (e.g. `"0 / 6 hrs"` for Ivy, `"6 / 6 hrs"` for Leo) with a caption noting California requires that many behind-the-wheel hours for minors — this box only appears for minors, since it's the legally meaningful number the list's lesson count doesn't capture on its own. An adult student's Progress tab (e.g. **Jordan Vance**) instead shows only a lessons-style label (e.g. `"2 of 3 lessons (67%)"`), no hours box. Leo Whitfield having met his required hours while his enrollment is still `active` is exactly the state that should surface a "Mark complete" action (see §2.45).

**Also check — short-lesson mismatch:** Book a minor three lessons of 90 minutes each (shorter than the tenant's 120-minute standard length) and mark all three `completed`. Their required lesson count (`ceil(hoursRequired * 60 / 120)`) is now met, but their hours total (4.5 of a typical 6-hour requirement) is not. Opening that student's Progress tab should show a clear warning banner — *"Lesson count met, but only 4.5 of 6 required hours logged — do not mark this program complete yet."* — distinct from the "Required Hours" box above it. This is the intended behavior when lesson durations are shorter than standard, not a bug.

**Also check — no-show follow-up:** Mark a scheduled lesson as `no_show` (via its lesson actions). The Dashboard's Alerts card should show a "No-Show Follow-Up" row for that student, with a dismiss button. Dismissing it removes the row. Separately, booking that student a new lesson should also clear the alert automatically (refresh the Dashboard to confirm) without needing to dismiss it manually.

**Also check — completion:** Use the "Mark program complete" action (requires a non-empty reason) on any student. The student's status becomes `completed` and they still appear in bookable lists. This is a manual admin decision — there is no automatic hours-threshold completion.

### 2.3b Guardians tab

**Do:** Go to `/students`. Click the **Guardians** segment in the header toggle (next to **Students**, in the same header row — there is no separate top-level nav item for this).

**Pass looks like:** The page body swaps to a guardians list (name, email/phone, paginated) with its own search box behavior — typing filters the currently-loaded page client-side. The "Add Student" button relabels to "Add Guardian" and opens a blank `GuardianModal`. Clicking any guardian row opens that guardian's detail modal.

**Also check — guardian detail:** Open **Carla Delgado**, one of the six seeded guardians — she's linked to Ivy Delgado as primary mother. The modal shows editable first/last/email/phone fields and a **Linked Students** section listing every student currently linked to them (relationship badge, a star icon on the primary), *not* labeled "past and present" — this app has no unlink history, so the section only ever shows current links. Owen Castillo (also a minor) is seeded with zero guardians on purpose — he's the example for the `needsGuardian` check in 2.3f.

### 2.3c Guardian-first enrollment (the phone-call flow)

**Do:** From an existing guardian's detail modal (2.3b), click **Enroll another student**.

**Pass looks like:** The student form opens in create mode with that guardian already selected in the Guardian section (shown as a name + "Change" link, not the search box). The **last name**, **home address**, and **emergency contact** fields are pre-filled from the guardian's primary (or most-recently-added) linked student. **Date of birth, training hours, and permit fields are blank** — confirm these are never carried over. Fill in the remaining required fields and submit; the student is created and linked to the guardian in one request (`POST /api/v1/students/with-guardian` — check the Network tab, there should be no separate follow-up `POST /students/:id/guardians` call).

**Note if using a seeded guardian/student pair:** every seeded student's address only fills the legacy free-text `address` field, not the structured `address_line1`/city/state/zip columns the student form actually prefills from — so the home-address fields will come up blank. That's expected given the seed data, not a bug; pick a student with a structured address if you want to see the prefill populate.

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

**Do:** Open **Owen Castillo** (seeded with zero guardians, `needsGuardian` flagged) in edit mode. Find the guardian sub-panel — previously this picker only appeared in create mode, so a student created before the guardian feature shipped had no way to get one through the UI.

**Pass looks like:** The sub-panel is present and shows "+ Add guardian". Click it - blank fields open directly (fields-first, same as create mode). Either fill them in for a new guardian, or click **Link existing guardian** to search for one (e.g. Carla Delgado), then click **Add Guardian**. Unlike create mode, this fires immediately — check the Network tab for a `POST /api/v1/students/:id/guardians` call (not `with-guardian`, since the student already exists). The new guardian appears as a row in the sub-panel right away, and the `needsGuardian` badge/banner clears without a page reload.

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

### 2.3k Creating a minor in Driver Education with a staged guardian (program choice must survive)

**Do:** Click **Add Student**. Switch the program toggle to **Driver Education**, pick Classroom or Online. Fill in a minor's date of birth so the guardian sub-panel appears, and stage a guardian (2.3d) before submitting. Submit. Open the newly-created student's Enrollments tab.

**Pass looks like:** The student has a `driver_education` enrollment (not `driver_training`), with the delivery mode you picked and a course fee matching the tenant's default. If you picked Classroom and selected a class during creation, the student is already on that class's roster — adding them to a cohort must not fail with "student couldn't be added" or similar. The create-success block shows "Go to Classroom" (no cohort picked) or a plain "Close" with no further action needed (a cohort was picked) — never "Book Lesson."

### 2.4 Book a lesson (happy path)

**Do:** Go to `/scheduling` (or open the booking form from a student/instructor). Pick a student with no conflicting lesson (e.g. Naomi Frasier, who is `completed` status but still bookable), pick an instructor with open availability, pick a future date/time that doesn't overlap an existing lesson for that instructor, submit.

**Pass looks like:** `POST /api/v1/lessons` returns `201`. The new lesson appears in the calendar/list immediately (or after a refetch) with status `scheduled`. No error toast.

### 2.5 Book a conflicting lesson (must be blocked)

**Do:** Find one of **Marcus Webb**'s existing seeded lessons (e.g. one of Leo Whitfield's or Jordan Vance's `09:00–11:00`/`13:00–15:00` lessons — check the Lessons page for his exact scheduled dates) and try to book him for an overlapping window on that same date — same student/vehicle doesn't matter, the instructor overlap alone should trigger it.

**Pass looks like:** The request is rejected — `POST /api/v1/lessons` returns `409`, with `error` containing a clear, specific message: `"Scheduling conflict: Instructor already has a lesson during this time"`. The UI surfaces this message to the user (not a generic "something went wrong"), and no lesson is created (refresh the list/calendar to confirm nothing new appears at that slot).

**Also try:** Booking the same **vehicle** (Honda Civic) for two different instructors at an overlapping time, and booking the same **student** twice at overlapping times — both should be blocked with their own specific conflict type (`vehicle_busy` / `student_busy`).

### 2.6 Record a payment

**Do:** Go to `/payments`, click "Add Payment" for a student with an outstanding balance. Confirm the amount pre-fills to their `outstandingBalance` with a "Pre-filled from outstanding balance" caption. Try each method chip (Card/Cash/Venmo/Zelle/PayPal/Check); with `enableBlockchainPayments` off in Settings, confirm BSV/MNEE render locked (dashed border, lock icon, unclickable); turn the flag on and confirm they become normal, selectable chips. Type into the amount field and confirm the "New balance after this payment" box updates live, including showing a "credit" when the amount exceeds the balance. Fill in an optional reference number, submit, and confirm the modal closes and the balance updates in the list. Rapid double-click the confirm button once and check only one payment was created. Open "View History" for that student and confirm the reference number appears in its own column.

**Pass looks like:** `POST /api/v1/payments` returns `201` exactly once even after a rapid double-click. The payment appears in the payments list and in that student's payment history, with the correct amount/method/reference number/status. The student's `outstandingBalance`/`totalPaid` reflects the change. BSV/MNEE chips are disabled when `enableBlockchainPayments` is off and selectable when it's on, in both light and dark themes.

### 2.6a Driver Education course fee

**Do:** In Settings' Training Defaults, confirm "Default Classroom Driver Education Cost" and "Default Online Driver Education Cost" are present and editable. Create a new student, choose Driver Education, pick Classroom - confirm the "Course fee" field pre-fills to the classroom default and is editable; switch to Online and confirm it re-prefills to the online default (unless already edited). Create the student with the default fee, then go to `/payments` and confirm their outstanding balance matches the DE fee and Add Payment pre-fills the same amount. Record a payment for the full fee and confirm the balance drops to $0 and status becomes "Paid." For a student with both a Behind-the-Wheel balance and a Driver Education balance, confirm the Payments page shows one combined total, not just the BTW figure.

**Pass looks like:** The DE enrollment's `totalCost` matches the tenant default (or the edited value) and is a genuine, non-negative number. `GET /api/v1/students` returns `paymentSummary.outstandingBalance` equal to the DE fee for a DE-only student. `POST /api/v1/payments` succeeds against a DE-only student (previously always 400'd) and the resulting `enrollment_id` is the DE enrollment. A student with both programs shows `totalPaid`/`outstandingBalance` as the sum of both. Booking a Behind-the-Wheel lesson for a student with a completed internal DE enrollment still applies the existing per-lesson discount, unaffected by any of this.

### 2.6b Payments page parity (row-click, hover actions, sorting, summary cards)

**Do:** Go to `/payments`. Click anywhere on a student's row (not a button) and confirm it opens the same `PaymentHistoryModal` "View History" always opened. Hover a row and confirm two icon buttons (Add Payment, View History) appear under the student's name without reflowing the row; on a touch device (or by tabbing to focus a button) confirm they're visible without hovering. Click a button inside the row and confirm it opens the correct modal without also triggering the row-click's history modal. Change the sort dropdown to "Highest Balance First" and confirm the list reorders by `outstandingBalance` descending. Confirm the three summary cards read "Total Outstanding," "Collected This Month," and "Students with a Balance," and that a DE-only student's balance is included in all three. Record a payment with a reference number from a row, then click that row to confirm the reference number appears in the Reference # column of the resulting history view.

**Pass looks like:** Row-click opens the existing history modal, not a new surface. Hover/focus-reveal matches Students.tsx/Lessons.tsx's exact behavior (hidden-then-revealed on hover-capable devices, always visible on touch). Sorting by balance puts the highest `outstandingBalance` student first. Summary card totals correctly include DE course-fee balances alongside BTW lesson-cost balances (no under-counting). The reference number entered at payment time is visible in that same student's payment history.

### 2.7 Treasury status (ledger seam)

**Do:** With a valid admin token, call:

```bash
curl http://localhost:4000/api/v1/treasury/status \
  -H "Authorization: Bearer <token from login>"
```

**Pass looks like:** `200 OK` with body `{"success":true,"data":{"enabled":false,"provider":"noop"}}` — confirming `BSV_ENABLED=false` is wired through to the noop ledger. (If you also poke `GET /api/v1/treasury/balance`, expect `501` with `{"success":false,"message":"Ledger disabled"}` — that's correct, not a bug.)

### 2.8 Calendar feed

**Do:** Go to `/instructors`, open an instructor (e.g. Renee Okafor), find the calendar feed section in the modal (ICS subscription URL / status / regenerate button).

**Pass looks like:** The feed status loads without error (`GET /api/v1/calendar-feed/feed/status/:instructorId`). Clicking "set up" or "regenerate" returns a feed URL. Opening that URL directly in a browser (or `curl`) returns `Content-Type: text/calendar` with the instructor's upcoming lessons as `VEVENT` entries — you should see the seeded future lessons for that instructor.

### 2.9 Notifications

**Do:** Go to `/notifications` (settings) and `/notification-history`.

**Pass looks like:** Notification settings page renders its toggles and "Save" persists to `localStorage` without error (this page is local-only, no backend call — that's expected, not a bug). `/notification-history` loads via `GET /api/v1/notifications/history` (may be empty on a fresh seed since no notification jobs have run yet — an empty state is a pass, not a failure). No console errors on either page.

### 2.10 Team Settings: invite, accept, and role enforcement

**Do:** As admin, go to `/settings` → **Team** tab. Click "Invite User", enter a new email, pick a role (`admin`/`staff`/`instructor` — the dropdown doesn't offer `owner`/`viewer`), submit. Copy the invite link from the response (shape: `http://localhost:5173/accept-invite?token=<64-char-hex>`). Open it in a private/incognito window, set a password, submit.

**Pass looks like:** The invite call returns `201`/`200` with the link. Opening the link renders the **Accept Invite** page (`/accept-invite`) with a password + confirm-password field — not a redirect to `/login` or a blank page. Submitting a matching password pair shows a success message and redirects to `/login` after ~2s. Logging in with the new email + chosen password succeeds and lands on the dashboard.

**Also check — role enforcement:**
- Log in as one of the seeded instructor accounts (`marcus.webb@budgetdrivingschool.com` / `InstructorPass123!`). Confirm the sidebar does **not** show Instructors, Vehicles, Scheduling, Instructor Earnings, Treasury, or Settings nav items (these are restricted to `owner`/`admin`/`staff` per `Sidebar.tsx`'s role filter).
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
2. The direct edit-modal path (`PUT /lessons/:id` → `lessonService.updateLesson`) also gets blocked with a `409` conflict — `updateLesson` re-runs the same 6D scheduling-conflict check (`validateLessonBooking`) whenever the edit actually touches a schedule-relevant field (date, start/end time, instructor, vehicle, or a genuine student reassignment), excluding the lesson's own current slot from its own conflict check. A notes/status/cost-only edit skips the check entirely, since it can't affect scheduling. See `backend/src/__tests__/lessonServiceUpdateRealDb.integration.test.ts` for real-Postgres coverage of both the conflict case and the "doesn't conflict with itself" case.

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

**Do:** With the student from §2.30 still carrying an outstanding fee (or **Priya Anand**, who is seeded with an outstanding no-show fee already in place — no setup needed), open the booking wizard and select that student on the setup step. Continue through to the Confirm step.

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

### 2.39 An approaching license expiry shows a warning on the Dashboard and the instructor record

**Do:** Edit an instructor whose license is currently valid, and set their **License Expiration** to a date within the next 30 days (but not past). Save, then check the Dashboard and reopen that instructor's record.

**Pass looks like:** The Dashboard shows an **Instructor Licenses** alert tile naming that instructor (or, with others also affected, a count) with a warning-styled badge. Reopening the instructor's record shows an "Expiring soon" pill next to the license section heading. The Instructors list shows the same status, in both card and table view.

### 2.40 An expired license shows danger styling everywhere, and would escalate weekly

**Do:** Set an instructor's **License Expiration** to a past date. Check the Dashboard, the instructor record, and the Instructors list.

**Pass looks like:** All three surfaces show danger (not warning) styling — the Dashboard tile, the record's status pill ("Expired"), and the list badge. The actual escalating reminder is cron-driven (daily) and not something to wait a real day for during manual testing — to verify the notification side specifically, either wait for the next scheduled cron run with a test instructor whose expiration lands on a threshold boundary (180/90/30/14/7 days out, or a multiple of 7 days past expiry), or check the `instructor_license_notifications` table directly after one run to confirm a row was recorded and a matching row exists in `notifications` for each admin/owner user.

### 2.41 Renewing a license clears the alert and status immediately

**Do:** Take an instructor currently showing as expired or expiring (from 2.39/2.40) and edit their **License Expiration** to a comfortable future date (more than 180 days out). Save, then check the Dashboard, the instructor record, and the Instructors list again.

**Pass looks like:** The Dashboard's Instructor Licenses tile no longer lists that instructor (or disappears entirely if they were the only one). The instructor record's status pill is gone. The Instructors list shows "Valid" (or no badge) for that instructor. All three update immediately on save — no separate "clear" action, no cron wait.

### 2.42 An instructor with no expiration date recorded is flagged, not silently treated as compliant

**Do:** Create a new instructor without filling in **License Expiration** (or edit an existing one and clear the field). Check the Dashboard, the instructor record, and the Instructors list.

**Pass looks like:** That instructor does **not** appear on the Dashboard's Instructor Licenses tile (there's no date to compute a threshold from, so the cron never processes them) — but the instructor record shows a "Missing" pill and the Instructors list shows a "License Missing" badge, both styled with the same danger weight as "Expired." The instructor is never silently shown as if their license were valid.

### 2.43 Viewing a student with exactly one (driver_training) enrollment

**Do:** Open any existing student's record and go to the **Enrollments** tab.

**Pass looks like:** Exactly one enrollment card is listed, labeled "Driver Training," showing an `active` (or `completed`, depending on the student) status badge and the same progress figure the **Progress** tab already shows for this student — the two tabs never disagree. Only an **Add driver education enrollment** action is offered (not "add driver training" — this student already has an active one).

### 2.44 Adding a second enrollment (driver education) and confirming both display independently

**Do:** On the same student's **Enrollments** tab, click **Add driver education enrollment**, enter a completion date and hours (e.g. 30), and confirm.

**Pass looks like:** A second card appears labeled "Driver Education," independently showing its own completion date/hours — the driver_training card above it is unchanged. Reload the student record: both enrollments are still there, in the same state. The **Progress** tab and the Students list are both unaffected — they still reflect only the driver_training enrollment's progress, since that's the program lessons/scheduling attach to.

### 2.45 Completing a driver_training enrollment, then adding a new one (the returning-student case)

**Do:** On a student with an active driver_training enrollment (**Leo Whitfield** is seeded with his 6/6 required hours already met, ready for this), go to **Enrollments**, click **Mark complete** on it, enter a reason, and confirm. Then go to the **Students** list and find that student.

**Pass looks like:** On the Students list, that student's progress bar reads **"No active enrollment"** (muted styling) — not blank, not a zero-percent bar, not an error. Booking a new lesson for that student is refused (a clear 400, not a crash) until a new enrollment exists. Back on the student's **Enrollments** tab, an **Add driver training enrollment** action now appears (it didn't before, while the first one was still active) — click it, fill in hours required, and confirm. The Students list now shows normal progress again for this student, resolving against the new enrollment; the completed enrollment's card is still listed above the new one, still showing `completed` and its recorded reason.

### 2.46 Recording a certificate from the certificates worklist

**Do:** Mark a minor's `driver_training` enrollment complete (§2.45, e.g. Leo Whitfield once you've completed him there). Open the **Certificates** page from the nav. Confirm the student appears in the "Awaiting certificate" worklist with their completion date. Click **Record certificate** on their row, enter a serial number (e.g. `CS7218767`) and confirm the pre-filled issue date, then submit. (**Ruby Sandoval** is seeded already past this exact step — her enrollment is `completed` with a certificate already recorded — so opening her record directly is the fastest way to see the *end state* of this flow: the gold badge on her Enrollments tab, and the Certificates page's Issued count already includes her.)

**Pass looks like:** The row disappears from the worklist immediately. The **Issued** tile's count increments by one. Reopening the student's record's **Enrollments** tab shows a gold `Award`-icon "Certificate issued" badge on that enrollment, next to its `completed` status, with the recorded serial and issue date. Recording the same serial number again anywhere in the tenant is rejected with a clear error (duplicate serial), and recording a second certificate for the same enrollment is rejected (409 — one certificate per enrollment).

### 2.47 Recording an adult's certificate directly from a completed enrollment (not in the worklist)

**Do:** **Naomi Frasier** is seeded as a completed adult with no certificate — exactly this scenario, no setup needed. Open the **Certificates** page and confirm she does **not** appear in the worklist (minors only). Instead, open her student record, go to **Enrollments**, and click **Record certificate** directly on her completed enrollment.

**Pass looks like:** The same inline serial+date form appears as on the worklist row. Recording succeeds with no age check anywhere in the flow, the gold certificate badge appears on the student record exactly as it does for a minor, and the **Issued** tile on the Certificates page increments — even though this enrollment was never listed on the worklist itself.

### 2.48 Voiding a certificate

**Do:** On the **Certificates** page, click **Record void** in the page header. Enter a serial number, a reason (e.g. "Damaged in storage"), and a date, then submit.

**Pass looks like:** The **Void** tile's count increments by one. The awaiting-certificate worklist is completely unaffected (a void has no enrollment and never appears there). Attempting to void the same serial number a second time, or to record it later as an issued certificate, is rejected — serial numbers are unique per tenant regardless of issued/void status.

### 2.49 Withdrawing an enrollment and generating a training-received transcript

**Do:** **Caleb Nguyen** is already seeded `withdrawn` (reason: "Moved out of state", 2 completed lessons before leaving) — open his record's **Enrollments** tab to see the end state directly, or pick a different, still-**active** student and click **Withdraw** yourself to walk the transition live. Enter a reason and confirm. Then click **Generate transcript** on the now-withdrawn enrollment.

**Pass looks like:** The enrollment's status badge changes to `withdrawn` (danger styling), the withdrawal reason displays on the card, the **Withdraw** action disappears (only available on `active` enrollments), and a **Mark complete** action is no longer offered either (withdrawal and completion are mutually exclusive). Clicking **Generate transcript** downloads a `.txt` file named `transcript-<Student Name>-<date>.txt` — open it and confirm it lists the student, program, enrollment date, the withdrawal date and reason, every lesson on that enrollment (date, duration, instructor, status), and total completed hours. Separately, confirm **Generate transcript** is also available (and produces a transcript with "Status: active" instead of withdrawal info) on a still-**active** enrollment that hasn't been withdrawn — the action has no age check and isn't restricted to withdrawn enrollments specifically.

---

### 2.50 Payments: sort by payment date, and the "Collected This Month" trend indicator

**Do:** Open the **Payments** page. Change the sort dropdown to **Payment Date (Newest First)**, then to **Payment Date (Oldest First)**. Separately, note the figure and small print on the **Collected This Month** card.

**Pass looks like:** Sorting by date reorders the student rows by each student's most recent payment (newest-first puts whoever paid most recently at the top; oldest-first reverses it); a student with no payments at all sorts to the end regardless of direction. The **Collected This Month** card shows the usual dollar figure, plus a small line below it with a trend arrow (pointing up in success-green if this month's total is ahead of last month's, down in danger-red if behind) and text reading `±$<diff> vs last month ($<last month's total>)` — visually the same treatment as the Students page's own "New This Month" card (§2.4x area). Both this figure and the Students page's "New This Month"/"vs last month"/"vs last year" numbers are resolved from the driving school's own timezone, not the browser's — if you're testing from a browser in a different timezone than the school's configured one, near a month boundary, both should still agree with what the school's calendar actually says, not your local one.

### 2.51 Notification history loads with real data, and editing a student's DOB / a lesson's pickup address actually saves

**Do:** Book a new lesson through the normal booking flow. Then open **Notification History** (nav → Communication). Separately, open an existing student's record and change their **Date of Birth**, save, then reload the record. Do the same for an existing lesson's **Pickup Address** via the pencil-icon edit modal.

**Pass looks like:** Notification History loads without an error and shows the just-booked lesson's booking-confirmation (and, if far enough in the future, reminder) rows with a real student/instructor name and lesson date — not a blank error page. The student's Date of Birth shows the new value after reload, not the old one. The lesson's Pickup Address shows the new value after reload, not blank/unchanged. All three were previously silent no-ops (DOB and pickup address saved with no error but never actually changed; Notification History 500'd on every visit) — see `docs/ARCHITECTURE.md` §22.

**Known limitation, not a regression to chase**: no email is actually sent for these queued notifications — there is no automatic scheduler running (`notificationCron.ts`'s scheduler has never been wired up), and the manual "Process Queue" button on the Notification History page currently processes zero rows even when clicked (a separate, still-open column-name mismatch inside the automatic-processing code path, `notificationProcessor.ts`'s `scheduled_for`/`retry_count` vs. the real `scheduled_send_time`/`attempt_count` columns). The rows themselves being written and readable is what this test covers.

### 2.52 BSV wallet key safety (dormant scaffolding, `BSV_ENABLED` stays `false`)

**Do:** This is not a UI test — there is no user-facing surface for this, since `BSV_ENABLED` stays `false` in every normal environment. If you need to verify it directly: temporarily set `BSV_ENABLED=true` in `backend/.env` with `BSV_PROTOCOL_WALLET_WIF` left unset or blank, then try to start the backend (`cd backend && npm run dev`).

**Pass looks like:** The backend refuses to start at all, printing a plain, instructive error — `BSV_ENABLED is true but BSV_PROTOCOL_WALLET_WIF is not configured. Set this environment variable before enabling BSV.` — with no private key of any kind printed anywhere in the output. Setting `BSV_PROTOCOL_WALLET_WIF` to any non-empty value (a real key isn't needed just to prove the check passes) lets the backend start normally. **Revert `BSV_ENABLED` back to `false` afterward** — this is dormant scaffolding, not a feature to leave toggled on in a dev environment.

**Do not do this against a real/shared environment** — this test is about confirming the *refusal to start* and the *absence of a logged key*, not about actually running with BSV enabled. See `docs/ARCHITECTURE.md` §23.

### 2.53 Google Calendar sync for instructors

**Requires one-time operator setup before this is runnable** — a Google Cloud OAuth client published to **"In production"** status (not left in "Testing," which issues refresh tokens that silently expire after 7 days), plus `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT_URI`/`GOOGLE_OAUTH_STATE_SECRET`/`GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` configured in the backend environment. See `docs/ARCHITECTURE.md` §29. **This full walkthrough has not yet been performed against a real Google account** — the steps below are what to run once setup is complete, not a confirmed-passing result.

**Route registration order, and the redirect target, matter here and have broken this flow in production before.** `GET /api/v1/google-calendar/oauth-callback` must be registered in `app.ts` *above* every `app.use(API_PREFIX, ...)` router mount — several of those routers apply `authenticate` as a blanket with no path argument, which rejects every request under `/api/v1` that reaches it with a 401 before Express checks whether the path matches anything in that router, regardless of what sits below it. If a future change moves this route below one of those routers again, the symptom is exactly what was reported and reproduced in production: the instructor approves on Google's consent screen, then the browser lands on a raw `{"success":false,"error":"Authentication required. No token provided."}` response instead of being redirected back into the app. `googleOAuthCallbackRouteOrdering.test.ts` is a regression test against the real mounted Express app (supertest, no Authorization header) that fails if this ever regresses — it should stay green. Separately, the callback's redirect target is `/my/profile` (the instructor's real profile route, where `GoogleCalendarSync.tsx` reads `?googleCalendar=connected|denied|error`) — not `/profile`, which this app has never had a route for.

**Do:** As an instructor with some upcoming lessons already booked, open **My Profile** and click **Connect Google Calendar**. Complete the real Google sign-in/consent screen. After the redirect back, book a new lesson for this instructor, then edit it (date/time or reassign to a different instructor), mark one lesson completed/no-show, and cancel another. Check the instructor's actual Google Calendar after each action. Also try: revoking the app's access from Google's own "Manage third-party access" page, then changing a lesson again; reconnecting afterward; clicking **Resync now**; editing an event's time directly in Google Calendar and then changing that same lesson in this app; and finally **Disconnect**.

**Pass looks like:** A dedicated "Driving Lessons" calendar appears in the instructor's Google account (separate from their primary calendar) containing every upcoming lesson that existed before connecting (the backfill). A new booking appears on that calendar within moments, not after a long delay. An edit updates the same event in place rather than creating a duplicate; reassigning to a different instructor removes it from the old instructor's calendar and adds it to the new one. Completing/no-showing a lesson leaves its event visibly unchanged (still a normal confirmed event); cancelling marks the Google event cancelled. After revoking access, the next lesson change does not error out or fail the booking — My Profile shows a "Reconnect needed" state instead. Reconnecting resumes syncing. "Resync now" re-pushes every upcoming lesson and reports completion. An edit made directly in Google Calendar is silently overwritten the next time that same lesson changes in this app — this is expected, one-directional behavior, not a bug. Disconnecting removes the dedicated calendar from the instructor's real Google account.

**Do not treat a slow/failed Google API call as a booking failure** — every booking, update, and status change must succeed immediately regardless of whether the Google sync behind it succeeds, is slow, or fails; that's the whole point of the fire-and-forget design. If a lesson action in the app itself ever waits on or fails because of Google, that's a regression to report, not expected behavior.

### 2.54 Lesson edit modal: no blur anywhere in the modal chrome, scoped requests only (screenshot script, manual, on-demand)

Not part of the automated suite or CI — a Playwright script verifying the lesson-edit-redesign performance/blur fixes (`docs/ARCHITECTURE.md` §31, §32).

**Do:**
```bash
cd frontend
npx playwright test lesson-edit-performance-blur.spec.ts --config=playwright.config.ts
```
Requires both dev servers already running (backend on `:4000`, frontend on `:5173` — see §1) with the repo's seed data loaded, and at least one lesson in the Lessons table to click Edit on.

**Pass looks like:** Both light and dark runs pass. The script asserts `getComputedStyle(el).backdropFilter` is `none` on the modal's scrollable panel, its sticky header, AND the fixed outer overlay (§32 — the overlay's blur turned out to be the actual cause of remaining scroll jank, not the panel/header fixed in §31) and saves `e2e-screenshots/__screenshots__/lesson-edit-after-{light,dark}.png`. Open the screenshots and confirm the card still reads clearly as a distinct surface over the dimmed page behind it, and that the page content behind the modal (e.g. the Lessons table) renders sharp, not blurred — the fix traded blur everywhere in the modal chrome for solid/near-solid backgrounds and a plain dim backdrop, not for a flat, indistinguishable look.

### 2.55 Lesson edit scroll performance trace (measurement script, manual, on-demand)

Not part of the automated suite or CI, and not a pass/fail test — a Chrome DevTools Protocol trace-capture tool used to find the actual cause of a reported scroll-jank regression (`docs/ARCHITECTURE.md` §32), not to re-check that the fix stays in place (§2.54 above does that). Re-run this if a future scrolling-performance report needs real measurement rather than reading the code.

**Do:**
```bash
cd frontend
npx playwright test lesson-edit-scroll-trace.spec.ts --config=playwright.config.ts
```
Requires both dev servers running and a large seeded tenant — a throwaway script inserted 300 students (each with an active `driver_training` enrollment) and 2,000 lessons directly via SQL into the primary tenant, tagged `notes = 'PERFSEED'` for identification and cleanup; see §32 for the method. Without a comparably large dataset, every scenario will measure as smooth regardless of whether a real regression exists, since the jank scales with how much content sits behind the modal's (now-removed) blurred overlay.

**Pass looks like:** There is no pass/fail here — the script prints a summary table (average/max frame time and dropped-frame count per scenario, from real `requestAnimationFrame` sampling during a scripted scroll) to stdout and saves raw CDP trace JSON to `e2e-screenshots/__traces__/*.json` (gitignored) for deeper inspection in `chrome://tracing` if needed. Read the printed numbers against the table in `docs/ARCHITECTURE.md` §32 to judge whether a new regression has appeared.

### 2.56 Reschedule a real lesson in place (manual, on-demand)

Not part of the automated suite or CI — live verification of the `existingLesson` reschedule flow (`docs/ARCHITECTURE.md` §33) against the real running app and real Postgres, not mocks. **Mutates a real lesson row** — only run this against a local dev database you can freely modify, never a shared or production one.

**Do:** confirm at least one `scheduled` lesson in the tenant has a date/time genuinely in the FUTURE relative to the real current date — a lesson that's `scheduled` but already past (missed without being closed out) is correctly excluded from reschedule eligibility and won't show the button. If none exists, insert one directly (see the spec file's own header comment for the exact `INSERT`), then:
```bash
cd frontend
npx playwright test lesson-reschedule-live.spec.ts --config=playwright.config.ts
```
Delete the throwaway lesson afterward if you inserted one for this run.

**Pass looks like:** the test passes, meaning: a "Reschedule lesson" button was found and clicked, the student was shown locked (no "Change" button — proves `existingLesson` mode, not a blank new booking), a real `findRankedAvailableSlots` search ran and returned results, picking a slot and confirming closed the modal immediately (no "Book Another" offered), and a screenshot was saved to `e2e-screenshots/__screenshots__/lesson-reschedule-after-live.png`. Separately confirm directly against Postgres that the lesson count is unchanged and the SAME `lessons.id` now carries the new date/time — the test's own `console.log` output shows the row's before-state and the slot picked, but doesn't itself assert against the database.

### 2.57 Lesson details panel (screenshot script, manual, on-demand)

Not part of the automated suite or CI — a Playwright screenshot of `LessonDetailsPanel` (`docs/ARCHITECTURE.md` §35, the component that replaced `LessonModal`), both light and dark theme.

**Do:**
```bash
cd frontend
npx playwright test lesson-details-panel.spec.ts --config=playwright.config.ts
```
Requires both dev servers already running (backend on `:4000`, frontend on `:5173` — see §1) with at least one scheduled lesson in the Lessons table to click Edit on.

**Pass looks like:** both light and dark runs pass. The script asserts no `<select name="studentId">` exists anywhere in the panel (a structural guard that this is genuinely the new details panel, not the old flat `LessonModal` form) and saves `e2e-screenshots/__screenshots__/lesson-details-panel-{light,dark}.png`. Open the screenshots and confirm the student/instructor names resolve correctly (not blank or "Loading..."), the read-only schedule summary and status badge render, and the editable fields are limited to lesson type, vehicle, cost, pickup address, and notes — no date/time/student/instructor inputs.

### 2.58 Lesson details panel v2: summary-first redesign, all three lesson states (screenshot script, manual, on-demand)

Not part of the automated suite or CI — a Playwright screenshot of the redesigned `LessonDetailsPanel` (`docs/ARCHITECTURE.md` §36), covering a scheduled, a completed, and a cancelled lesson, each in light and dark (6 screenshots). Supersedes §2.57's spec, which only ever covered the scheduled/edit case.

**Do:** seed (or confirm) three specific lessons for this tenant — one `scheduled` with a genuinely future date/time (so `canReschedule` is true), one `completed` with notes AND a second, earlier completed lesson for the same student (to exercise the "Last lesson" note), and one `cancelled`. The spec file's own header comment names the exact students used in the original run; update it if your seed data differs. Then:
```bash
cd frontend
npx playwright test lesson-details-panel-v2.spec.ts --config=playwright.config.ts
```
Requires both dev servers already running (backend on `:4000`, frontend on `:5173` — see §1).

**Pass looks like:** all 6 runs pass and save `e2e-screenshots/__screenshots__/lesson-details-panel-v2-{scheduled,completed,cancelled}-{light,dark}.png`. Open the screenshots and confirm: the header shows the student's name and a display-only status badge (no dropdown affordance) with date/time/duration as the subtitle (whole hours/minutes, e.g. "2 hours" or "90 min" — never a raw decimal like "120.00 min", per §37); the summary grid shows phone/instructor/pickup/vehicle and, where the lesson's own enrollment has the data, Progress ("Lesson N of M" only when the lesson's own `lessonNumber` is set, otherwise "N of M completed") and, labeled "Enrollment balance" (not "Payment"), the running paid/owed totals — omitted entirely when `paymentStatus` is "unknown"; the completed lesson's screenshot shows the "Last lesson" note block with the earlier lesson's date and notes; the scheduled lesson's screenshot shows the full action row (Reschedule left, Complete/No-show/Cancel right) and the editable Notes/Pickup/Vehicle fields with Admin details collapsed; the completed and cancelled screenshots show no action row and no editable fields other than Notes, with the cancelled one showing "Book Again" instead.

### 2.59 Lessons list: View button on completed/no_show rows (regression test, automated)

Part of the automated suite (`frontend/src/pages/Lessons.test.tsx`, new) — covers the discoverability fix in `docs/ARCHITECTURE.md` §36 (a completed/no_show row previously rendered no visible action at all, even though clicking the row itself already opened `LessonDetailsPanel`).

**Do:**
```bash
cd frontend
npx vitest run src/pages/Lessons.test.tsx
```

**Pass looks like:** a completed lesson and a no_show lesson each render a "View lesson" button that opens `LessonDetailsPanel` on click, "No actions available" never renders for any status, and a cancelled lesson still shows "Book Again" rather than "View."

### 2.60 "Last lesson" note ordering (real-Postgres integration test, automated)

Part of the automated suite, gated behind `TEST_DATABASE_URL` (`backend/src/__tests__/lessonServiceLastCompletedNoteRealDb.integration.test.ts`) — covers `docs/ARCHITECTURE.md` §37's fix: the note must come from a completed lesson strictly *before* the one being viewed, never a later one.

**Do:**
```bash
cd backend
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
  npx vitest run src/__tests__/lessonServiceLastCompletedNoteRealDb.integration.test.ts
```
Without `TEST_DATABASE_URL` set, every case in the file is an explicit no-op (not a silent gap) — same convention as the other `*RealDb.integration.test.ts` files.

**Pass looks like:** all 4 cases pass — an older completed lesson's note never shows a later lesson's note even when one exists; a same-day tie resolves to the earlier `start_time`; a lesson with nothing completed before it shows nothing (even with a later completed lesson present); a non-`completed` (e.g. cancelled) lesson that happened earlier is ignored.

### 2.61 `excludeLessonId` query param validation (automated)

Part of the automated suite (`backend/src/__tests__/validateUUIDQuery.test.ts`) — covers `docs/ARCHITECTURE.md` §37: a malformed `excludeLessonId` on `GET /lessons/student/:studentId/last-completed-note` must 400 at the route layer, not reach the service as a raw string.

**Do:**
```bash
cd backend
npx vitest run src/__tests__/validateUUIDQuery.test.ts
```

**Pass looks like:** a well-formed UUID passes through; a malformed string, a missing value, a SQL-injection-shaped string, and an array value (Express's shape for a repeated query key) all throw a 400 `AppError` without calling `next()`.

### 2.62 "Lesson #N of M" only when N <= M, everywhere it's built (automated)

Part of the automated suite — covers `docs/ARCHITECTURE.md` §38: rescheduling a lesson could inflate its stored `lessonNumber` past the estimated total, producing a nonsensical "Lesson #4 of 3" in the Google Calendar/ICS description, the invite email, and `LessonDetailsPanel`'s Progress cell.

**Do:**
```bash
cd frontend
npx vitest run src/components/scheduling/SmartBookingForm/__tests__/SmartBookingForm.test.tsx
npx vitest run src/components/lessons/LessonDetailsPanel.test.tsx
cd ../backend
npx vitest run src/__tests__/calendarFeedService.test.ts
npx vitest run src/__tests__/lessonInviteService.test.ts
```

**Pass looks like:** `SmartBookingForm.test.tsx`'s reschedule-mode update call never includes a `lessonNumber` key at all (the stored number is left untouched server-side). `calendarFeedService.test.ts` and `lessonInviteService.test.ts` each print the full "N of M" form when `N <= M`, and only the bare "#N" form (no "of M") when `N > M`. `LessonDetailsPanel.test.tsx`'s Progress cell does the same: "Lesson N of M" when `N <= M`, bare "Lesson N" otherwise.

**Known limitation, by design:** this fix only prevents new inflation and nonsensical display going forward — it does not rewrite any `lessonNumber` already inflated by the bug before this fix. Correct an already-wrong stored number by hand via `LessonDetailsPanel`'s Admin details section.

### 2.63 Payments phase 1: credit balance, period summary, who-owes-you, receipts, CSV export

Covers `docs/ARCHITECTURE.md` §39. Additive-only — no migration, no change to `createPayment`/`updatePayment`/`refundPayment`/`deletePayment`.

**Unit/route tests (no real DB needed):**
```bash
cd backend
npx vitest run src/__tests__/computePaymentSummaryCredit.test.ts
npx vitest run src/__tests__/receiptService.test.ts
npx vitest run src/__tests__/paymentReportingRoutes.test.ts
npx vitest run src/__tests__/studentCombinedPaymentSummary.test.ts
npx vitest run src/__tests__/tenantTime.test.ts
```

**Pass looks like:** `computePaymentSummaryCredit.test.ts` — `creditBalance` is `0` (not null, not negative) whenever `totalPaid <= totalCost`, rises/falls correctly as lessons are booked against a lesson-sum (no-override) enrollment, stays `0` under a fixed `totalCost` override even after full payment, is unaffected by a reschedule (same lesson list in, same list out), and is `null` only when `totalCost` itself is `null`. `receiptService.test.ts` — the same `(tenantId, paymentId)` pair always returns the same receipt number; two different payment ids (or the same payment id under two different tenant ids) return different numbers; format is always `BDP-` + 10 uppercase hex characters. `paymentReportingRoutes.test.ts` — every one of the 4 new routes 403s for an `instructor` role and 200s for `admin`; every query includes the caller's own `tenantId` and never another tenant's; `period-summary`/`export` 400 when `start`/`end` is missing, malformed, or `end < start`; `who-owes-you` rows are sorted by amount owed descending, carry a correct age bucket, and never omit the last-payment date/amount; the receipt endpoint 404s for an unknown payment id and never includes a lesson-level field. `studentCombinedPaymentSummary.test.ts`'s new 4th case — a DE-only student who paid $200 against a $150 cost shows `outstandingBalance: 0` AND `creditBalance: 50` (the overpayment-is-no-longer-hidden regression case). `tenantTime.test.ts`'s `tenantWeekBoundaries` cases match `tenantService.getTenantNow`'s own `weekStart`/`weekEnd` for the same inputs, including a case where the UTC day and the tenant's local day disagree.

**Real-database integration test (the 4 scenarios named in the task):**
```bash
cd backend
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
  npx vitest run src/__tests__/paymentReportingRealDb.integration.test.ts
```
Without `TEST_DATABASE_URL` set, every case is an explicit no-op — same convention as the other `*RealDb.integration.test.ts` files. Each case creates its own fresh student/enrollment (not shared across the file), to avoid the cross-test contamination pattern found and fixed in `lessonServiceLastCompletedNoteRealDb.integration.test.ts` (§2.60).

**Pass looks like:** (a) a family who pays for two lessons and books exactly two shows `outstandingBalance: 0` and `creditBalance: 0` — no leftover credit, no false balance. (b) a family who pays their full package cost up front, then books lessons over time against the lesson-sum (no-override) path, shows `creditBalance` falling as each lesson is booked — asserted at three stages (before any lesson, after lesson 1, after lesson 2). (c) rescheduling a lesson (same cost, different date/time) leaves both `outstandingBalance` and `creditBalance` unchanged. (d) cancelling a lesson and then rebooking a replacement applies the existing payment to the new lesson with no double charge — the balance after rebooking matches the balance before cancellation, not a doubled amount.

**Frontend:**
```bash
cd frontend
npx vitest run src/pages/Payments.test.tsx
npx vitest run src/components/payments/PaymentHistoryModal.test.tsx
npx vitest run src/pages/PaymentReceiptPrint.test.tsx
```

**Pass looks like:** `Payments.test.tsx` — the period summary panel renders its chips and 5 cards; a hostile-clock case (browser `TZ` set far from the tenant's own zone, e.g. `Pacific/Kiritimati`) still defaults to the tenant's own "this month" and resolves the "Today" chip to the tenant's today, never the browser's; the who-owes-you list shows its empty state with no outstanding balances, and clicking a row opens that student's existing payment history modal (there is no student-detail route in this app to navigate to); the "Paid, not yet scheduled" figure appears in both the table and card views only when positive; clicking "Export CSV" triggers a download (stubbing `HTMLAnchorElement.prototype.click` and `URL.createObjectURL`/`revokeObjectURL`). `PaymentHistoryModal.test.tsx` — "Applied to" shows the enrollment's program type only, never a specific lesson, and is absent when the payment has no resolvable program type; exactly one receipt button renders per row, and clicking it opens `/payments/:id/receipt` in a new tab. `PaymentReceiptPrint.test.tsx` — the page renders school name, receipt number, student, date, amount, method, "Applied to", and whichever of remaining balance/remaining credit is actually nonzero (never both, never a lesson-level claim).

**Playwright screenshots (light + dark, seeded data, requires both dev servers running):**
```bash
cd frontend
npx playwright test e2e-screenshots/payments-phase1.spec.ts
npx playwright test e2e-screenshots/payment-receipt.spec.ts
```

**Pass looks like:** `payments-phase1.spec.ts` (4 tests) — the period summary + who-owes-you view and the student table's "Paid, Not Yet Scheduled" column each capture cleanly in both themes. `payment-receipt.spec.ts` (2 tests) — the printable receipt renders cleanly in both themes; the spec looks up a real payment id live via the Payments page's own History modal (searching for a student already known to have a confirmed payment) rather than hardcoding one, so it keeps working if seed data changes — don't "fix" a failure here by assuming the first alphabetical student has a payment; several don't.

**Known gaps, by design (not bugs):** per-lesson payment allocation ("Covers") is deliberately not attempted — the payment history and receipt show the enrollment and its running totals only, never a guess at which lesson(s) a payment paid for. `payments.related_lesson_ids` and `payments.invoice_id` already exist as columns but are read/written nowhere in the app, before or after this phase — see §39 for the phase-2 design question this raises.

### 2.64 Payments phase 1 review fixes: Outstanding figure agreement, CSV formula injection, thousands separators, default period

Four fixes found on a fresh-clone review of §2.63, covered here rather than folded silently into it so the before/after is traceable.

**1. The "Outstanding" figure now agrees everywhere.** The period panel's "Outstanding" card and the page's old "Total Outstanding" card could show two different numbers for the same tenant — the panel's SQL (`paymentReportingService.ts`'s `getPaymentPeriodSummary`) summed every enrollment tenant-wide with no join to `students`, while the page's own total (derived from `getAllStudents`) excludes archived students. An archived student with an unpaid enrollment balance inflated the panel's figure but not the page's. Fixed by joining `students` and filtering `archived_at IS NULL` in both `getPaymentPeriodSummary`'s balances query and `getWhoOwesYou` (same gap, same fix), matching `getAllStudents`' own scope exactly. The now-redundant "Total Outstanding" card was removed outright rather than kept as a second source of truth; "Collected This Month" was kept (it is period-chip-independent, always this calendar month, with its own month-over-month trend the panel doesn't have) and relabeled "Collected This Calendar Month (fixed, not the period chip above)" to disambiguate it from the panel's own period-scoped "Collected" card.

```bash
cd backend
npx vitest run src/__tests__/paymentReportingRoutes.test.ts
cd ../frontend
npx vitest run src/pages/Payments.test.tsx
```

**Pass looks like:** backend — `getPaymentPeriodSummary`'s and `getWhoOwesYou`'s SQL excludes archived students (verified against the real dev DB during this fix: a seeded archived student with a $150 unpaid enrollment, previously counted, is now correctly excluded). Frontend — `Payments.test.tsx`'s "Outstanding figure agreement" test asserts exactly one element on the page says "Outstanding" (the panel's card; no second "Total Outstanding" card exists to disagree with it).

**2. CSV export neutralizes spreadsheet formula injection.** A student name or reference number starting with `=`, `+`, `-`, `@`, a tab, or a carriage return would execute as a formula when the exported CSV is opened in Excel/Sheets/LibreOffice (e.g. a student named `=cmd|'/c calc'!A1`). Fixed by a new pure helper, `backend/src/utils/csvFormatting.ts` (`neutralizeFormulaInjection`/`csvCell`), prefixing a single quote whenever the first character is dangerous — applied before, not instead of, the existing RFC 4180 comma/quote/newline escaping.

```bash
cd backend
npx vitest run src/__tests__/csvFormatting.test.ts
npx vitest run src/__tests__/paymentReportingRoutes.test.ts
```

**Pass looks like:** `csvFormatting.test.ts` (17 tests) — every dangerous leading character is neutralized; a dangerous character appearing later in the string (not first) is left alone; ordinary names/reference numbers are untouched; formula-injection neutralization and RFC 4180 quoting compose correctly when a value needs both. `paymentReportingRoutes.test.ts`'s "formula injection guard" block exercises the full `GET /payments/export` route end-to-end with a dangerous student name and dangerous reference numbers, asserting the raw CSV response body contains the neutralized form and never the raw dangerous one.

**3. Money on the Payments page is thousands-separated.** `$2,490.00`, not `$2490.00`. A new shared helper, `frontend/src/utils/moneyFormat.ts` (`formatMoney`, via `Intl.NumberFormat`), replaced every hand-rolled `` `$${n.toFixed(2)}` `` across `Payments.tsx`, `PaymentModal.tsx`, `PaymentHistoryModal.tsx`, `PaymentPeriodSummaryPanel.tsx`, `WhoOwesYouList.tsx`, and `PaymentReceiptDocument.tsx`. The CSV export's own numeric cells are intentionally NOT run through this formatter — a spreadsheet import needs a plain decimal number, not a display-formatted string with thousands commas.

```bash
cd frontend
npx vitest run src/utils/moneyFormat.test.ts
```

**Pass looks like:** `moneyFormat.test.ts` (4 tests) — thousands separators appear above 999; always exactly two decimal places; zero and negative amounts format correctly; large amounts get multiple separators (`$1,234,567.89`).

**4. The period defaults to "This Month", not "All Time".** `Payments.tsx` now promotes `periodRange` from the initial `'all'` preset to `'this_month'` (with the tenant-resolved month's own start/end dates) the moment `tenantNow` becomes available — a one-time default via a `defaultPeriodApplied` flag, not a value that keeps re-asserting itself if the user picks a different chip afterward. "All Time" is unchanged as a selectable chip.

```bash
cd frontend
npx vitest run src/pages/Payments.test.tsx
```

**Pass looks like:** the two new tests in the "payments-phase1: period summary panel" block — "This Month" is the selected chip (not "All Time") on initial render; after explicitly clicking "All Time", it stays selected and is not silently reverted back to "This Month". The existing hostile-clock "defaults to this month" query test (§2.63) still passes unchanged — the query itself always resolved to the tenant's month boundaries; what changed is that the chip now visibly reflects that as its own selected preset, not just the underlying query.

**Playwright screenshots were re-captured** after these fixes (`payments-phase1.spec.ts`, `payment-receipt.spec.ts`) — the summary screenshot now shows "This Month" selected, a single "$2,340.00" Outstanding figure (not two disagreeing numbers), and thousands-separated formatting throughout.

### 2.65 Payments actions: record payment from history, row-level actions, contact/record links, who-owes-you fetch-by-id fix

Covers `docs/ARCHITECTURE.md` §40. No changes to how `PaymentModal` creates, validates, or submits a payment — only new ways to reach it, plus a backend gap fix underneath.

**Backend (real-DB, proves the `getStudentById` paymentSummary fix):**
```bash
cd backend
npx vitest run src/__tests__/studentByIdPaymentSummary.test.ts
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
  npx vitest run src/__tests__/studentByIdPaymentSummaryRealDb.integration.test.ts
```

**Pass looks like:** `studentByIdPaymentSummary.test.ts` (3 mocked-query tests) — a single-student fetch (`GET /students/:id`) attaches a combined (BTW + DE) `paymentSummary` computed from the enrollment(s) already fetched, matching `computePaymentSummary`'s own math exactly (a $300 BTW cost with $100 paid shows `outstandingBalance: 200`); combining two programs sums correctly (BTW partially paid + DE paid in full combine to the right total); a student with zero enrollments returns `paymentSummary: undefined`, matching `combinePaymentSummaries(null, null)`'s own existing behavior — not a fabricated `'unknown'`-status object. The real-DB file (3 tests) proves the same three cases against actual Postgres rows, including a real overpayment (`creditBalance: 50`) via `paymentService.createPayment`. Without `TEST_DATABASE_URL`, every case in that file is an explicit no-op, same convention as every other `*RealDb.integration.test.ts` file.

**Frontend:**
```bash
cd frontend
npx vitest run src/pages/Payments.test.tsx
npx vitest run src/components/payments/PaymentHistoryModal.test.tsx
npx vitest run src/components/payments/WhoOwesYouList.test.tsx
npx vitest run src/pages/Students.test.tsx
```

**Pass looks like:**
- `PaymentHistoryModal.test.tsx` — a "Record payment" button appears in the header only when `onRecordPayment` is provided, and calls it on click; the summary strip shows Total Due/Total Paid/Outstanding from the same `paymentSummary` the rest of the page reads, and "Paid, Not Yet Scheduled" only when `creditBalance > 0`; `mailto:`/`tel:` links render for email/phone (and "No contact on file" when both are absent); "View student record" calls `onViewStudentRecord` with the student's id, and is absent when that prop is omitted.
- `WhoOwesYouList.test.tsx` — every row renders its own visible "Record payment" button; clicking it calls `onRecordPayment` with that row and does NOT also call `onSelectStudent` (stopPropagation proven, not just asserted); clicking elsewhere in the row still calls `onSelectStudent`; the row remains keyboard-accessible (Enter triggers the same selection).
- `Payments.test.tsx` — "Record payment" in the history modal closes it and opens `PaymentModal` for the same student (scoped queries avoid colliding with the page's own always-visible "Record Payment" toolbar button and `PaymentModal`'s own button/heading, which share that exact text); "View student record" calls `navigate('/students', { state: { openStudentId } })` (mocked via the same `useNavigate` override pattern `Signup.test.tsx` already uses); a "who owes you" row whose student is NOT in the loaded list is resolved via `studentsApi.getById`, and a failed fetch shows the "Could not load this student" error toast with no modal opening as a result.
- `Students.test.tsx` — a new `location.state.openStudentId` deep-link opens `StudentModal` for that student (exercised via both the cached-in-list and fetch-by-id paths of the pre-existing `handleSelectSearchedStudent`, which this deep-link reuses rather than reimplementing).

**Playwright screenshots (light + dark, seeded data — Benjamin Hayes, a real seeded student with a $290 outstanding balance and no payments on file, used throughout rather than a new fixture):**
```bash
cd frontend
npx playwright test e2e-screenshots/payments-actions.spec.ts
```

**Pass looks like:** 3 scenarios × 2 themes = 6 screenshots. The history modal shows the "Record payment" header button, the summary strip (Total Due/Total Paid/Outstanding), and the email/phone/"View student record" links. The "Who Owes You" panel shows each row's own "Record payment" button alongside the age bucket and amount owed. Clicking a row's "Record payment" button opens `PaymentModal` pre-filled with that exact student's name, email, and outstanding balance as the amount — **verify this screenshot visually**, not just via the route reaching 200: an early draft of this spec used an unscoped `getByRole('button', { name: /record payment/i }).first()`, which matched the page's own always-visible toolbar button first (same DOM-order pitfall the task's own text ambiguity warns about) rather than the row's button, and would have silently screenshotted an empty, unfilled payment form while still "passing." Scope this kind of query to the specific panel/row under test, not the whole page.

**Known gaps, by design (not bugs):** no refund or void action exists anywhere in this change — `PaymentHistoryModal`'s payment table has one reserved, empty column for this (phase 2), and nothing else was built toward it. No delete action was added either.

---

### 2.66 Payments adjustments: append-only refunds/voids, net paid everywhere, payment arrangement marker

Covers `docs/ARCHITECTURE.md` §41. Fills the "phase 2" gap §2.65 flagged (refund/void): the old in-place refund flip and the hard payment delete are both gone, replaced by append-only `payment_adjustments` rows plus a non-append-only payment arrangement marker on `enrollments`.

**Migration (run once, verified directly against Postgres before any application code was written against it):**
```bash
cd backend
npm run migrate
psql $DATABASE_URL -c "INSERT INTO payment_adjustments (tenant_id, payment_id, adjustment_type, amount, reason_code, created_by) VALUES ('<tenant>', '<payment>', 'refund', 10.00, 'other', '<user>');"  # should fail — note required for 'other'
psql $DATABASE_URL -c "UPDATE payment_adjustments SET amount = 1 WHERE id = '<some-id>';"  # should fail — append-only trigger
psql $DATABASE_URL -c "DELETE FROM payment_adjustments WHERE id = '<some-id>';"  # should fail — append-only trigger
```

**Pass looks like:** the INSERT with `reason_code = 'other'` and no `note` is rejected by the CHECK constraint; the UPDATE and DELETE are both rejected with `payment_adjustments is append-only: UPDATE/DELETE is not permitted` (the trigger, not just an app-layer check).

**Backend (mocked-query):**
```bash
cd backend
npx vitest run src/__tests__/adjustmentService.test.ts
npx vitest run src/__tests__/paymentAdjustmentRoutes.test.ts
npx vitest run src/__tests__/paymentReportingRoutes.test.ts
npx vitest run src/__tests__/paymentServiceCaseConversion.test.ts
```

**Pass looks like:** `adjustmentService.test.ts` (18 tests) — `derivePaymentAdjustmentStatus`/`computeNetPaid` cover paid/partly-refunded/refunded/voided and the legacy-status shortcut; `createAdjustment`'s transaction flow rejects `other` with no note before ever opening a transaction, 404s an unknown payment, 400s a non-`confirmed` payment, 400s a refund exceeding the remainder (both on the first refund and on a second refund after a partial one), a void always covers the full remaining amount regardless of what `amount` the caller sent, and a successful refund commits with the exact requested amount. `paymentAdjustmentRoutes.test.ts` (12 tests) — staff gets 403 on `POST /payments/:id/adjustments`, admin/owner get 201 on the full locked-payment→adjustments→insert→commit path, 400 when `adjustmentType`/`reasonCode` are missing, `DELETE /payments/:id` always 409s, and the arrangement set/clear routes are gated the same way (staff 403, admin success, 404 for an unknown enrollment). `paymentReportingRoutes.test.ts` and `paymentServiceCaseConversion.test.ts` — pre-existing tests updated for the new adjustments queries each reporting function now issues; the old id-only `refundPayment` unit test was removed (the function no longer exists — see `adjustmentService.test.ts` for the equivalent coverage under the new model).

**Backend (real-DB, the concurrency/trigger/legacy-data/date-boundary proof — these are the tests that actually matter for this phase):**
```bash
cd backend
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
  npx vitest run src/__tests__/adjustmentServiceRealDb.integration.test.ts
```

**Pass looks like** (15 tests, explicit no-op without `TEST_DATABASE_URL`, same convention as every other `*RealDb.integration.test.ts` file):
- A partial refund followed by a second refund requesting more than the remainder is rejected, and the rejected attempt leaves no partial row behind.
- **Two concurrent refund requests against the same payment, together exceeding its remaining amount, cannot both succeed** — exactly one succeeds, the other is rejected, and the total adjusted never exceeds the payment amount. This is the one regression-proven by deliberately breaking the code first: temporarily removing the `SELECT ... FOR UPDATE` row lock and inserting an artificial delay between the balance check and the insert reproduced the real bug (both refunds succeeded, $140 adjusted off a $100 payment) before the lock was restored and reconfirmed to prevent it. If you want to see the failure yourself, comment out `FOR UPDATE` in `adjustmentService.createAdjustment`'s `SELECT` and re-run this one test — do not leave that change in place.
- A void always adjusts the full remaining amount (ignoring whatever `amount` was passed), even after a prior partial refund.
- Only a `confirmed` payment can be adjusted — a `pending` payment (inserted directly via SQL to manufacture the state) is rejected.
- The append-only trigger blocks a direct `UPDATE`/`DELETE` against `payment_adjustments`, asserted via a direct `pool.query` call against the real table (not through the service layer).
- Tenant isolation — a payment id belonging to a different tenant 404s.
- Balances, credit, and the period summary all reflect net paid (payment amount minus its adjustments), not the gross payment amount, after a refund.
- A legacy `status = 'refunded'` payment with zero adjustment rows is still treated as fully refunded (net paid 0) — proving the "never backfilled" legacy-data rule holds without any special-case SQL.
- The period summary's "Refunded" figure is counted by the ADJUSTMENT's own date, not the original payment's date — proven under a hostile clock (`TZ=Pacific/Kiritimati`, UTC+14), **and now at 5 different faked UTC hours** (02:00, 09:30, 10:30, 16:50, 23:50 — see "CI flake fixed" below for why the hour matters).
- The CSV export includes both the payment row and its adjustment row, with the adjustment row carrying the ORIGINAL payment's receipt number (an adjustment has no receipt number of its own).

Test cleanup for this one table has to work around the very trigger being tested: the file's own `deleteAdjustmentsForTenant` helper wraps its single teardown `DELETE` in `ALTER TABLE payment_adjustments DISABLE TRIGGER ALL` / `ENABLE TRIGGER ALL`. This is test-infrastructure-only — no application code does this anywhere, since the trigger's whole purpose is to block exactly this from everywhere else.

**CI flake fixed: the hostile-clock test itself was comparing two differently-shifted clocks.** The original test computed `adjustmentDateIso` via `new Date(adjustment.createdAt).toISOString().slice(0, 10)` and compared it against `getPaymentPeriodSummary`'s own Postgres-side `created_at::date` filter, expecting them to always agree. They don't, for a subtle reason specific to how `node-postgres` handles a `timestamp without time zone` column (`payment_adjustments.created_at`) under a hostile `process.env.TZ`:

1. `adjustmentService.createAdjustment` builds `created_at` in application code as `new Date()` (a real, TZ-agnostic UTC instant) — not via Postgres's own `now()`.
2. When `pg` serializes that JS `Date` as a parameter into a `timestamp without time zone` column, it writes a wall-clock string using the **Node process's own local TZ** (confirmed directly: under `TZ=Pacific/Kiritimati`, UTC+14, a real instant of `2026-11-27T17:11:27Z` gets written to the column as the literal text `2026-11-28 07:11:27` — a full calendar day ahead).
3. Postgres stores that string as-is (the column type carries no zone of its own) and its own `created_at::date` cast reflects exactly that written string — `2026-11-28` in the example above.
4. When the SAME process reads `created_at` back out, `pg`'s parser applies the identical (wrong) TZ assumption on the way in, so `adjustment.createdAt` round-trips back to the correct original UTC instant (`2026-11-27T17:11:27Z`) — internally self-consistent, but now disagreeing with what Postgres itself thinks the calendar date is, because step 2's write-side shift and step 4's read-side shift land on different representations (a wall-clock string vs. a UTC instant) that only agree before crossing a day boundary. This is why the bug only reproduced for a UTC hour past ~10:00 (this DB's own server-level default session timezone, confirmed via `SHOW timezone`, is `America/Los_Angeles`, UTC-8 — once the actual UTC instant resolves back far enough on its own date-line math, the Kiritimati round-trip above crosses into the previous or next calendar day relative to what Postgres recorded).

**Fix**: read the date Postgres itself recorded, directly from the database (`SELECT created_at::date::text FROM payment_adjustments WHERE id = $1`), instead of deriving it from a JS-side `Date` parse of the already-round-tripped `adjustment.createdAt`. Applied to both the original hostile-clock test and the CSV-export test right after it (same pattern, not itself broken today only because no sibling test currently leaves `process.env.TZ` in a bad state before it runs — fixed anyway, to not depend on that). A grep across the rest of `backend/src/__tests__/` for the same `new Date(....createdAt).toISOString().slice(0, 10)` pattern combined with a `process.env.TZ` mutation found no other instances; `tenantTimeHostileClock.test.ts` only *mentions* `process.env.TZ` in a comment (explaining why it deliberately does NOT mutate it at runtime) and was already correctly designed before this fix.

**Does the real app have the same problem? Yes — reported here, not fixed in this commit, per the task's own scope.** `backend/src/config/database.ts`'s `Pool` sets no `timezone`/`options` parameter at all, so the Postgres session's timezone is whatever the server defaults to (`America/Los_Angeles` on this dev database) — completely independent of the app's own `process.env.TZ` (confirmed: `backend/.env` sets `TZ=UTC`, and node-postgres/libpq never forwards a client's `TZ` to the Postgres session). That session-vs-process mismatch means `backend/src/services/paymentReportingService.ts` has several of the SAME risky `new Date(row.created_at).toISOString()`-style conversions in real (non-test) code, all reading a `timestamp without time zone` or bare `date` column back into a JS `Date` for display:
- `getPaymentReceiptData`'s `createdAt: new Date(a.created_at).toISOString()` (an adjustment's displayed timestamp on a receipt).
- `getPaymentsForExport`'s `date: new Date(row.created_at).toISOString().slice(0, 10)` (an adjustment row's displayed date in the CSV export) — this one is the most consequential, since the SQL filter that SELECTED the row already correctly used `pa.created_at::date`, so the exported date can disagree with the very date range the export itself claims to cover.
- `getWhoOwesYou`'s `oldestDate`/`lastPaymentDate` conversions (`new Date(row.oldest_date).toISOString().slice(0, 10)` etc.) — these read plain `date` columns (`lessons.date`/`payments.date`), which turn out to have the SAME exposure: a probe directly against this dev database confirmed a `date`-typed column parses to the wrong calendar day under a hostile process TZ too (`'2026-11-27'::date` round-tripped as `2026-11-26` under `TZ=Pacific/Kiritimati`), not just `timestamp without time zone` columns.

In production, this would only actually surface as a wrong displayed/exported date for requests served in whatever UTC-hour window corresponds to the Postgres session TZ crossing a calendar boundary relative to the app's own `TZ=UTC` clock (currently an 8-hour PST / 7-hour PDT gap, so roughly the first 7-8 hours of each UTC day) — a real, currently-live, low-frequency display bug, not a data-integrity issue (nothing is stored wrong; only each of these specific JS-side display/export conversions can show the wrong day). Flagged for a future fix; not touched in this commit, per the task's explicit scope.

**Frontend:**
```bash
cd frontend
npx vitest run src/components/payments/RefundDialog.test.tsx
npx vitest run src/components/payments/VoidDialog.test.tsx
npx vitest run src/components/payments/PaymentArrangementDialog.test.tsx
npx vitest run src/components/payments/PaymentRowMenu.test.tsx
npx vitest run src/components/payments/PaymentHistoryModal.test.tsx
npx vitest run src/components/payments/WhoOwesYouList.test.tsx
npx vitest run src/pages/PaymentReceiptPrint.test.tsx
npx vitest run src/components/students/StudentModal.test.tsx
npx vitest run src/utils/apiErrorMessage.test.ts
```

**Pass looks like:**
- `RefundDialog.test.tsx` (8 tests) — amount defaults to and is capped at the remaining amount, shows the already-refunded amount when nonzero, requires a note only for "Other", submits with the exact entered amount/reason/note.
- `VoidDialog.test.tsx` (7 tests) — no amount field; the submit button always states the full remaining amount; "Use Refund instead" closes this dialog and opens `RefundDialog`; note required only for "Other"; the reason list is the smaller void-specific subset.
- `PaymentArrangementDialog.test.tsx` (8 tests) — the toggle pre-fills from whether an arrangement is already set; the note field appears only when enabled; submitting calls set or clear depending on the toggle; "Last set" shows the date and, when available, who set it.
- `PaymentRowMenu.test.tsx` (5 tests) — Print receipt always renders; Refund/Void render only when their corresponding callback prop is provided at all (not merely disabled when absent); outside-click closes the menu.
- `PaymentHistoryModal.test.tsx` — role gating (admin sees Refund and Void in the row menu, staff sees neither, a fully-adjusted payment hides both regardless of role); status chips read the derived status (Paid/Partly refunded/Refunded/Voided), not the raw stored status; a partly-refunded payment shows a red indented sub-row with the reason, who, and amount; a voided payment's amount renders struck-through (disambiguated in the test from the summary strip's own unrelated `$100.00` via `.line-through` class matching, not just text content); the arrangement badge/"Set arrangement" button render correctly, including the "by {name}" setter name once resolved.
- `WhoOwesYouList.test.tsx` — a row with an arrangement set shows the amber "Payment arrangement" badge and hides the red age-bucket badge; a row without one shows the reverse.
- `PaymentReceiptPrint.test.tsx` — an adjusted payment shows its refund line in red with reason and a bold "Net paid" line; an unadjusted payment shows neither (renders exactly as before this phase).
- `StudentModal.test.tsx` — unaffected by behavior, updated only because its `Enrollment` fixtures now need the three new nullable arrangement fields to satisfy the type.
- `apiErrorMessage.test.ts` (4 tests) — the new shared error-message helper extracted during this phase to keep the lint warning budget from growing (four new dialogs' `onError` handlers all needed the same `err.response.data.error` extraction).

**Playwright screenshots (light + dark, 6 scenarios = 12 scenario screenshots + 1 auth setup = 15 tests total). Depends on hand-seeded live data documented in the spec's own top comment — not Playwright-seeded, so re-running cold requires recreating it first:**
```bash
cd frontend
npx playwright test e2e-screenshots/payments-adjustments.spec.ts
```

Before running, recreate the live data the spec depends on (adjust ids/token for your own dev database):
```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"<owner-email>","password":"<password>"}' | jq -r .data.token)
curl -X POST http://localhost:4000/api/payments/<ava-mitchell-50-payment-id>/adjustments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"adjustmentType":"refund","amount":20,"reasonCode":"other","note":"Screenshot fixture"}'
curl -X POST http://localhost:4000/api/payments/<marcus-lee-100-payment-id>/adjustments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"adjustmentType":"void","reasonCode":"entered_in_error"}'
curl -X POST http://localhost:4000/api/enrollments/381a06bf-fcb6-4740-9398-8ab0e817dc7d/payment-arrangement -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"note":"Paying $50/month until balance clears"}'
```

**Pass looks like:** the history modal shows Ava Mitchell's $50 payment with a red "Refunded - Other" sub-row for $20 and a "Partly refunded" chip; Marcus Lee's $100 payment shows a struck-through amount and a "Voided" chip; the Refund and Void dialogs render per the mockups described in §41; the arrangement dialog shows "Last set {date} by {name}"; the who-owes-you panel shows the amber "Payment arrangement" badge (not the red age-bucket badge) for Benjamin Hayes' enrollment; the receipt page for Ava Mitchell's payment shows the red refund line and a bold "Net paid: $30.00" line. **Verify the role-gating and struck-through states visually, not just via the route reaching 200** — this spec hit the same unscoped-selector pitfall §2.65 already warned about (`getByRole('button', { name: /view payment history/i })` matching `WhoOwesYouList`'s own row `aria-label` before the student table's button, opening the wrong student's modal) and a Playwright strict-mode violation (`getByText('Voided')` matching both the status chip and the "Voided - Entered by mistake" sub-row) — both were caught by inspecting the actual screenshot output, not by the test turning red.

**Backend gap found and fixed during this phase, confirmed by re-running the full backend suite afterward:** `studentService.ts`'s `activeEnrollment` projection gained `paymentArrangementSetAt/SetBy/Note` without the `ActiveEnrollmentSummary` type gaining matching fields, which crashed the dev server on restart with a TS2322 (not caught by a stale `tsc` run from earlier in the session — a reminder that `tsc --noEmit` needs re-running after every edit, not just once at the start). Fixed by updating the type; `npx tsc --noEmit` clean afterward, full backend suite (1008 tests) and the affected frontend suites re-run green before proceeding. A related, smaller gap (the arrangement dialog showing no setter name because `student.activeEnrollment` only carried a raw user id) was fixed the same session by adding a batched name lookup in `studentService.ts` — see §41 for detail.

**Known gaps, by design (explicit scope boundaries set by the task, not missed work):** no booking-time payment rule or quick-amount chips were added; no form-field changes were made beyond what this phase needed; no list/filter redesign; the payment arrangement marker keeps no history of its own prior settings (only the current state); no booking-rule behavior reads the arrangement marker anywhere — it is purely informational.

---

### 2.67 Payments adjustments review fix: `PUT /payments/:id` can no longer bypass the append-only model

Covers the `PUT /payments/:id` fix in `docs/ARCHITECTURE.md` §41's own "Gap found and fixed after initial review" subsection. A fresh-clone review of §2.66's branch found that `PUT /payments/:id` still let owner/admin/staff flip `amount`, `date`, `paymentMethod`, `status`, or `bsvTransactionId` directly on a confirmed payment — including setting `status` straight to `'refunded'` with no adjustment row. Fixed by locking those 5 fields once a payment is `confirmed`; `notes`/`referenceNumber` stay editable regardless of status, and `pending`/`failed` payments keep their prior free-edit behavior (nothing in this codebase has ever relied on this route to transition them — `markPaymentAsReceived` is the dedicated pending-to-confirmed route).

**Backend (mocked-query, route-level):**
```bash
cd backend
npx vitest run src/__tests__/paymentUpdateImmutability.test.ts
npx vitest run src/__tests__/paymentServiceCaseConversion.test.ts src/__tests__/tenantIsolation.test.ts src/__tests__/paymentCreateAuditColumns.test.ts
```

**Pass looks like:** `paymentUpdateImmutability.test.ts` (10 tests) — staff and admin both get 409 (identically — this is not a role gap) trying to change `amount`, `date`, `paymentMethod`, `status`, or `bsvTransactionId` on a confirmed payment, with the error message naming Void/Refund (or, specifically for `amount`, pointing at recording a new payment instead); a nonexistent payment 404s rather than 409ing even with a locked field in the request body; `notes` and `referenceNumber` still update with a 200 on a confirmed payment; a `pending` payment's `amount` and a `failed` payment's `status` can still be corrected, proving the pre-existing transition behavior for those two statuses is unchanged. The three pre-existing test files updated alongside this fix (`paymentServiceCaseConversion.test.ts`, `tenantIsolation.test.ts`, `paymentCreateAuditColumns.test.ts`) each had one `updatePayment(..., { amount: N })` call switched to `{ notes: '...' }` — those tests were asserting camelCase conversion, tenant filtering, and the `updated_by` column respectively, none of which are about the immutability rule, so decoupling them from a field that now 409s on a confirmed payment keeps each test asserting only what it says it does.

**Backend (real-DB):**
```bash
cd backend
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school \
  npx vitest run src/__tests__/paymentUpdateImmutabilityRealDb.integration.test.ts
```

**Pass looks like** (7 tests, explicit no-op without `TEST_DATABASE_URL`): an amount change on a confirmed payment is rejected with `statusCode: 409` and the payment's amount is unchanged afterward (not partially applied); a status change to `'refunded'` is rejected the same way, proving the old refund-by-flip path is genuinely gone, not just fronted by a new error message; date, paymentMethod, and bsvTransactionId are each independently rejected; notes and referenceNumber both update successfully on a confirmed payment, with amount/status unchanged; a pending payment's amount and a failed payment's status can still be corrected; a payment id belonging to a different tenant 404s rather than 409ing (the pre-check's own tenant filter, not just the eventual UPDATE's). Numeric fields from Postgres come back as strings (`'100.00'`) — this file's own assertions coerce with `Number(...)` before comparing, per CLAUDE.md's numeric-coercion rule; this was caught on first run (`expected '100.00' to be 100`) and fixed before counting the file as passing.

**Frontend:** no new test file — `paymentsApi.update` was deleted from `frontend/src/api/payments.ts` entirely (confirmed via a repo-wide search that no component ever called it; the UI has never had an edit-in-place form for a payment). `npx tsc --noEmit` in `frontend/` is the only check this specific removal needs, and it's included in the full verification pass below.

**Playwright screenshots — force-added, now tracked:** the 14 screenshots from §2.66's spec (`history-refund`, `history-void`, `refund-dialog`, `void-dialog`, `arrangement-dialog`, `who-owes-you-arrangement`, `receipt-refund` × light/dark) were generated under `frontend/e2e-screenshots/__screenshots__/`, which `.gitignore` excludes by design (it's point-in-time visual output, not source) — so they were never actually in the `payments-adjustments` branch despite being referenced in §2.66 and the PR description. Fixed with `git add -f frontend/e2e-screenshots/__screenshots__/payments-adjustments-*.png`, the same force-add already used for every prior branch's own screenshots (`payments-actions-*`, `payments-phase1-*`, etc. — confirmed already tracked in `main` via `git log --diff-filter=A`). Verify any screenshot-producing branch actually committed its captures with:
```bash
git ls-tree HEAD -- frontend/e2e-screenshots/__screenshots__/ | grep <branch-prefix>
```
A route reaching 200 in CI proves nothing about whether its screenshot made it into the diff - only `git ls-tree` (or `git show --stat`) against the actual commit does.

---

### 2.68 Payment History modal layout: sticky Actions column, merged Type/Applied To and Reference #/Details columns, wider desktop modal, stacked cards on phone

Layout-only fix (no behavior or data change) in `PaymentHistoryModal.tsx` for a 9-column table (Date/Type/Method/Applied To/Amount/Status/Reference #/Notes/Actions) that pushed the Actions column's row menu (Print receipt/Refund/Void) off the right edge of the modal, forcing horizontal scroll to reach it.

- **Sticky Actions column**: `sticky right-0` on the header and every body cell (including each adjustment sub-row's own cell, so the column's background stays continuous down the table instead of showing a gap), with `bg-surface2` on the header (matching `thead`'s own background) and `bg-surface`/`group-hover:bg-surface2` on body cells (matching the row's own hover background) so scrolled content never shows through underneath it. Verified under actual horizontal scroll (not just "it fits at normal widths") by forcing a narrow 700px viewport, scrolling the table fully right, and screenshotting — the Actions column stayed pinned and opaque in both the payment row and the adjustment sub-row beneath it.
- **Reference # + Notes merged into one "Details" column**: `[referenceNumber, notes].filter(Boolean).join(' - ')`, single truncated line (`truncate` + a fixed `max-w-[12rem]`), full text available via the native `title` attribute on hover AND via keyboard focus (`tabIndex={0}` on the same element — a `title` alone is mouse-hover-only). Shows `-` when both are empty.
- **Type + Applied To merged into one "Type" column**: the existing payment-type label ("Lesson Payment") as the main line, with the enrollment's program type ("Driver Training") as a smaller second line underneath when present — nothing rendered for the second line when `programType` is absent (no more `-` placeholder, since the column no longer exists on its own).
- **Modal width**: `max-w-4xl` → `max-w-4xl lg:max-w-6xl`, so the now-7-column table fits without horizontal scrolling at 1280px and 1440px — verified live via Playwright screenshots at both widths (see below), not just by reading the Tailwind classes.
- **Phone-width stacked cards**: the table (`hidden sm:block`) and a parallel stacked-card list (`sm:hidden`) both render for every payment — a CSS-only toggle, not conditional rendering, so both markups exist in the DOM simultaneously and tests/screenshots must disambiguate by visibility or by scoping to whichever container the viewport actually shows (see below). Each card shows the date, type+program, method, amount, status chip, and row menu (always visible, not hidden behind a reveal gesture), with the merged Details line and any adjustment lines indented underneath — the same information the table row shows, not a reduced subset.

**Frontend (mocked, jsdom):**
```bash
cd frontend
npx vitest run src/components/payments/PaymentHistoryModal.test.tsx src/pages/Payments.test.tsx
```

**Pass looks like:** `PaymentHistoryModal.test.tsx` (29 tests) — the merged Type column shows the program type as a second line, never as its own "Applied To" column; every row's actions control (row menu) is present, counted separately for the table (one per row) and for the full page (table + card list combined, double the table's count — proving the card list independently renders its own actions control per row rather than just existing); the sticky Actions header/cells carry `sticky`/`right-0`/`bg-surface2`; a long note truncates in the Details cell but is fully readable via `title`, is reachable via keyboard focus (`tabIndex={0}`), and is prefixed with the reference number; an empty Details cell shows `-`. Every pre-existing assertion that used to target a single unambiguous element (row-menu triggers, status chip text, adjustment-line text, struck-through amounts) was re-scoped — either to `within(screen.getByRole('table'))` for row-menu/dialog interactions, or to `findAllByText`/`getAllByText` with a "length > 0" check for text that now legitimately renders twice — because jsdom doesn't evaluate the `hidden`/`sm:hidden` media-query classes that keep only one of the two parallel renderings visible in a real browser, so both copies are present in jsdom's DOM at once. `Payments.test.tsx`'s one touched test (reference-number-visible-in-history) now asserts the reference number appears in the merged Details column instead of a now-nonexistent dedicated "Reference #" header.

**Playwright screenshots (light + dark; 1280px + 1440px desktop table, plus one phone-width card layout = 6 screenshots, 7 tests total including auth setup):**
```bash
cd frontend
npx playwright test e2e-screenshots/payment-history-layout.spec.ts
```
Creates its own self-contained fixture in `beforeAll` (a fresh student via direct API calls — `studentService.createStudent`'s default auto-enrolls a `driver_training` enrollment — then one confirmed `$150` cash payment with both a reference number and a long note, then a `$30` partial refund against it) rather than depending on another spec's hand-seeded data, so it can be re-run cold with no setup steps. Leaves the fixture student/payment/adjustment behind in the dev DB by design, matching this repo's other one-shot fixture-creating specs (e.g. `widget-day-closing-actions.spec.ts`).

**Pass looks like:** at both 1280px and 1440px, the Payment History modal shows all 7 columns with no horizontal scrollbar on the table, the long note visibly truncates with an ellipsis in the Details column, and the Actions column's row menu sits flush against the modal's own right edge; at the phone viewport (390×844), the table is absent and a stacked card renders instead, showing the status chip, amount, and row menu together with the indented refund sub-row beneath. **Verify by looking at the actual screenshots**, not just a green exit code — this spec hit the same class of issue §2.66/§2.67 already documented: `getByText(/Refunded -/)` matched twice (the table's hidden copy and the card list's visible one) and `.first()` alone wasn't enough to disambiguate since DOM order (table markup comes first), not visibility, decides which match `.first()` returns regardless of viewport width — fixed with `.locator('visible=true').first()` to filter down to whichever copy the current viewport actually renders.

---

### 2.69 Payment History modal layout review fix: header overflow at phone width, sticky-cell seam on adjustment rows

A review of §2.68's branch on a fresh clone found tsc/884 tests/build green and the desktop layout working, but flagged two cosmetic regressions, both checked at the exact widths/themes the review named:

1. **Header overflow at 360-390px.** "Set arrangement" and "Record payment" overflowed past the modal's right edge and got clipped instead of wrapping, because the header was one non-wrapping `flex items-center justify-between` row. Fixed by letting the header's two halves (title+close, actions) stack below `sm` and go side-by-side at `sm`+, with the two action buttons switching to `justify-center` (full-width-looking, stacked) below `sm` and back to `justify-start` at `sm`+. The close button is intentionally duplicated - one copy in the title row (`sm:hidden`), one in the actions row (`hidden sm:block`) - so it's always reachable without introducing shared-element positioning logic; exactly one copy is ever visible at a given width.
2. **Sticky-cell seam on adjustment sub-rows.** The sticky Actions cell on a refund/void sub-row carried the same `bg-surface2/50` tint as its `<tr>`, stacking two translucent layers into a visibly darker patch than the rest of the row (a `position: sticky` element needs its own backdrop, so it couldn't just omit the background and inherit the row's). Fixed by moving the tint off the `<tr>` and onto every `<td>` in that row individually, including the sticky one - every cell now paints the exact same single layer, so nothing differs.

**Frontend (mocked, jsdom):**
```bash
cd frontend
npx vitest run src/components/payments/PaymentHistoryModal.test.tsx
```

**Pass looks like:** `PaymentHistoryModal.test.tsx` (28 tests total, +2 new since §2.68) — the adjustment sub-row's `<tr>` no longer carries `bg-surface2` directly, and every one of its `<td>`s (the sticky one included) carries the identical `bg-surface2/50` class; the header's "Set arrangement"/"Record payment" buttons carry `justify-center`/`sm:justify-start`, and their shared wrapper carries `flex-col`/`sm:flex-row`; both close buttons exist in the DOM (one `sm:hidden`, one `hidden sm:block`) and either one calls the same `onClose`.

**Playwright screenshots (light + dark; desktop 1280px + phone 390px — same spec as §2.68, screenshots regenerated and re-tracked):**
```bash
cd frontend
npx playwright test e2e-screenshots/payment-history-layout.spec.ts
```
Re-running the same `payment-history-layout.spec.ts` from §2.68 regenerates all 6 tracked screenshots (`git add -f` again afterward, since each run overwrites files already tracked from the previous commit — no new force-add is needed for files already in the tree, but worth confirming via `git status` that the regenerated bytes are actually staged before committing).

**Pass looks like:** at 360px and 390px, "Set arrangement" and "Record payment" render as full-width stacked buttons below the title with nothing clipped past the modal's edge; at 1280px/1440px in both themes, the adjustment sub-row's background is visually uniform all the way across, including under the Actions column — **verify by looking at the regenerated screenshots directly**, the same lesson §2.66-§2.68 already learned about this component: a class-list assertion proves the fix's mechanism but not that it's actually invisible to the eye in both themes.

---

### 2.70 Payment History modal review fix: `PaymentRowMenu`'s dropdown clipped inside the table's overflow/sticky context

A review of the §2.68/§2.69 branch found `PaymentRowMenu`'s dropdown (Print receipt/Refund/Void) rendering as only a thin grey sliver when opened, with later rows' own backgrounds painting over whatever did show. Root cause: the menu was `position: absolute` inside the trigger's own `relative inline-block` wrapper, itself inside the table's `overflow-x-auto` scroll container and the sticky `right-0` Actions cell — two separate reasons the menu's real painted area got clipped or buried in the table's own stacking/clipping context, regardless of viewport size.

**Fix:** the menu is now rendered via `createPortal` straight into `document.body`, positioned with `fixed` from the trigger's own `getBoundingClientRect()` — right-aligned to the button, same as before, but computed from real viewport coordinates instead of an `absolute` offset inside a clipped ancestor. This is the exact same pattern already used by `TeamSettings.tsx`'s `MoreActionsMenu` for an identical class of problem — see `PaymentRowMenu.tsx`'s own doc comment for the full reasoning. New behavior added on top of that existing pattern, since the task asked for it explicitly:

- **Flips above the trigger** when there isn't room below it in the viewport (estimated against a fixed 136px menu height — this menu is always at most 3 short rows, so a real post-render measurement isn't needed to make the right call at any viewport size that matters).
- **Escape returns focus to the trigger button** after closing — without this, a keyboard user's focus would land on nothing once the menu unmounts.
- Outside click (checking both the trigger and the portaled menu), window resize, and scroll of the modal/table all close the menu, matching `MoreActionsMenu`'s own close-on-scroll behavior (a short-lived transient control, not something scrolled while staying open).
- `z-[60]`, not `z-50` — `PaymentHistoryModal`'s own backdrop+panel are `z-50`, so the menu needs to sit one layer above its own modal, not merely above the table.

**Frontend (mocked, jsdom):**
```bash
cd frontend
npx vitest run src/components/payments/PaymentRowMenu.test.tsx src/components/payments/PaymentHistoryModal.test.tsx
```

**Pass looks like:** `PaymentRowMenu.test.tsx` (9 tests, +4 new) — the open menu renders as a direct child of `document.body`, provably NOT a descendant of a `<table>` even when nested inside the exact `overflow-hidden`/`overflow-x-auto` shape `PaymentHistoryModal`'s own table uses; Escape closes the menu and returns focus to the trigger (`document.activeElement === trigger`); an outside click (a genuinely separate element, not a menu item) closes it; and — with `window.innerHeight` fixed at 400 and the trigger's own `getBoundingClientRect` mocked twice in the same test — the menu anchors from `top` when there's room below the trigger, and flips to anchor from `bottom` when there isn't. `PaymentHistoryModal.test.tsx`'s existing row-menu/dialog tests were updated: the trigger CLICK stays scoped to `within(screen.getByRole('table'))` (disambiguating which of the table/card-list's two parallel triggers to click), but every query for an already-OPEN menu's items (`Print receipt`/`Refund`/`Void`) switched from `within(table)` to plain `screen`, since those items are no longer a DOM descendant of the table at all once portaled.

**Playwright screenshots (light + dark; first row, last row flipped, single payment = 6 new screenshots, 13 tests total for this spec including the pre-existing layout screenshots):**
```bash
cd frontend
npx playwright test e2e-screenshots/payment-history-layout.spec.ts
```
`payment-history-layout.spec.ts` gained a second fixture in `beforeAll` — a student with EIGHT confirmed payments, so the table's last row sits near the bottom of a normal 900px-tall viewport once scrolled into view via `scrollIntoView({ block: 'end' })`, which is the real condition the flip-above logic needs to fire, not a contrived one. The "first row" and "single payment" screenshots reuse the existing one-payment fixture; "last row" uses the new eight-payment one.

**Pass looks like:** on the first row, the menu opens below the trigger with Print receipt/Refund/Void fully legible and nothing clipped or painted over by rows beneath it. On the last of eight rows (scrolled to the bottom of the viewport), the menu visibly renders ABOVE the trigger instead of below — confirmed by looking at the actual screenshot, not inferred from a `style.top`/`style.bottom` assertion alone — with all three items still fully visible above the table's own bottom edge. With a single payment on file, the menu opens cleanly with no extra rows nearby to clip or obscure it. All three hold in both light and dark theme. Also manually verified live (not screenshotted, since a static image can't show it): pressing Escape while the menu is open closes it and visibly returns focus to the trigger button; clicking anywhere else in the modal closes the menu without triggering any of its actions.

---

### 2.71 Payment Before Booking: per-tenant credit gate on new lesson creation

A per-tenant toggle (OFF by default), gated server-side in the lesson-creation path, that blocks booking a new lesson unless the student's active driver_training enrollment has enough credit (net paid minus the cost of its existing non-cancelled lessons) to cover it. Fee flags (cancellation/no-show cash notices) are never read by this check. See `docs/ARCHITECTURE.md` §43 for the full design, including the package-priced-enrollment investigation (conclusion: no such enrollment exists in this codebase today) and the pre-existing, unrelated `availabilityService.getSchedulingSettings` race bug found (and deliberately left unfixed, out of scope) while building the concurrency test below.

**Backend (mocked-query, pure function + service + route level):**
```bash
cd backend
npx vitest run src/__tests__/bookingEligibilityService.test.ts src/__tests__/lessonServiceBookingEligibility.test.ts
```

**Pass looks like:** `bookingEligibilityService.test.ts` (15 tests) — pay-per-lesson credit math; paying all up front then booking sequentially until credit is exhausted; paid for two lessons, a third of the same cost is blocked at exactly $0 credit; cancelling a lesson returns its cost to credit (proven identical to the lesson being entirely absent); a `'no_show'` lesson's cost is NOT excluded (regression test for the exact no_show-vs-cancelled distinction this feature's design depends on); a lower net-paid figure (simulating a refund or void already netted out) blocks where a higher one would allow, both as a pure-function test and as a mocked-SQL-level test proving the actual net-paid query subtracts `payment_adjustments.amount`; a payment arrangement (`paymentArrangementSetAt` set) always allows regardless of how bad the credit numbers are, proven to return before credit is ever computed; the package-priced/brand-new-enrollment fallback (blocked at net paid $0, allowed at any net paid > 0) with a code comment correcting the task's own "package-priced enrollment" framing against what `computePaymentSummary` actually does (see ARCHITECTURE.md §43's own writeup); tenant isolation on every query (enrollment lookup, lessons lookup, net-paid lookup all scoped by `tenant_id`). `lessonServiceBookingEligibility.test.ts` (5 tests) — setting OFF means the eligibility check is never even called (the single most important regression test in this feature, per its own "nothing changes until the owner turns it on" framing); setting ON with an allowed result books normally, called with the post-discount `finalCost`, not the raw requested cost; setting ON with a blocked result rejects with a 409 `AppError` whose `code` is exactly `'PAYMENT_REQUIRED'`, and the transaction rolls back (not commits) with the client still released; reschedule never triggers this check at all (structural - `updateLesson` never calls it); the concurrency MECHANISM (one transaction, one client, one lock) is exercised via mocks, with the real race-prevention guarantee left to the real-DB test below.

**Backend (real-DB, concurrency):**
```bash
cd backend
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school npx vitest run src/__tests__/bookingEligibilityConcurrency.integration.test.ts
```

**Pass looks like** (1 test, explicit no-op without `TEST_DATABASE_URL`): a real tenant/student/enrollment with exactly enough net paid for ONE $100 lesson, two concurrent `createLesson` calls for different non-conflicting slots fired via `Promise.allSettled` — exactly one succeeds, the other is rejected with a 409 `PAYMENT_REQUIRED`, never both (which would mean $200 of lessons booked against $100 of credit). This is the test that actually proves the enrollment row lock prevents the race, not just that the code is shaped correctly.

**Route tests:** covered inline within `lessonServiceBookingEligibility.test.ts` and the existing lesson-route test suites (every booking entry point ultimately calls `lessonService.createLesson`, confirmed to be the single, un-bypassed insertion point for `lessons` rows in this codebase — no other route or service inserts into `lessons` directly). Setting-update owner/admin-only coverage already exists for `PUT /tenant/settings` (pre-existing `requireRole('owner','admin')` gate, unchanged by this feature — no new test needed since no new route-level gating was added, `requirePaymentBeforeBooking` just rides the existing field-builder).

**Frontend (mocked, jsdom):**
```bash
cd frontend
npx vitest run src/components/scheduling/SmartBookingForm/__tests__/PaymentNeededBanner.test.tsx src/components/scheduling/SmartBookingForm/__tests__/SmartBookingForm.test.tsx src/pages/Settings.test.tsx
```

**Pass looks like:** `PaymentNeededBanner.test.tsx` (6 tests) — the amber "Payment needed" banner with no dollar amounts anywhere when blocked; nothing rendered when allowed; the blue payment-arrangement note instead of the warning banner, checked FIRST even when the underlying credit numbers would otherwise block (matching the server's own precedence); clicking "Record payment" opens `PaymentModal` and closing it (whether saved or cancelled) re-runs the eligibility check; nothing rendered at all (no query fired) when the student has no active enrollment. `SmartBookingForm.test.tsx` gained 3 tests — the banner renders on the Confirm step with the current cost when the tenant setting is on; never renders when the setting is off; never renders in reschedule mode even with the setting on (constructed with the exact `preselectedStudent` + `prefilledInstructorId`/`prefilledDuration`/`prefilledLessonType`/`prefilledPickupAddress` + `existingLesson` shape the pre-existing reschedule tests already establish as correct — reschedule's own student-lock mechanics are not re-derived here, just reused). `Settings.test.tsx` gained 4 tests — the toggle starts OFF with its exact helper text ("A lesson can only be booked when the student's payments cover it. Students on a payment arrangement can still book.") and switches on, a real error message on a failed save, the safety-report preview showing "no students blocked" when empty, and listing blocked students (name, net paid, scheduled lesson cost, with a dash for a null lesson cost) even while the setting itself is off.

**Playwright screenshots (light + dark; banner, arrangement note, Settings toggle + preview, phone width — force-add with `git add -f`, confirm with `git ls-tree`):**
```bash
cd frontend
npx playwright test e2e-screenshots/payment-before-booking.spec.ts
```
Creates its own self-contained fixture in `beforeAll`: one tenant-wide `requirePaymentBeforeBooking` toggle flip via the Settings API, one student with net paid $0 and no arrangement (triggers the banner), one student with a payment arrangement set (triggers the blue note). Leaves both behind in the dev DB by design, matching this repo's other one-shot fixture-creating specs.

**Pass looks like:** the "Payment needed" banner renders in `SmartBookingForm`'s Confirm step with no dollar amounts visible, in both themes; the blue "Payment arrangement on file" note renders instead for the arrangement student; the Settings page's "Payments and Booking" tab shows the toggle and the safety-report preview table listing the blocked student; at a phone-width viewport the banner and the Settings page both remain fully readable with nothing clipped. Verify by looking at the actual screenshots, not just a green exit code.

---

### 2.72 No-show lessons excluded from student cost (owner decision, follow-up to §2.71)

A `'no_show'` lesson's cost no longer counts toward a STUDENT's cost/balance/credit figure anywhere in the app - treated exactly like `'cancelled'`. The student already paid for it; the no-show fee stays a separate cash matter in `fee_flags`, untouched by this change. See `docs/ARCHITECTURE.md` §43's "No-show lessons excluded from student cost" subsection for the full design and the new shared `backend/src/utils/lessonCostFilter.ts` module.

**Backend (mocked-query, the two files updated for the new behavior):**
```bash
cd backend
npx vitest run src/__tests__/bookingEligibilityService.test.ts src/__tests__/computePaymentSummaryCredit.test.ts
```

**Pass looks like:** `bookingEligibilityService.test.ts`'s former "no_show is NOT excluded" regression test now asserts the opposite - a no-show lesson's cost returns to credit, proven identical to the same scenario with that lesson cancelled instead - plus a new test confirming an outstanding fee flag doesn't matter (the function has no `fee_flags` parameter at all, so it structurally can't read one). `computePaymentSummaryCredit.test.ts` gained a direct unit test asserting a no-show lesson is excluded from the lesson-sum `totalCost` derivation, with the no-show and cancelled scenarios producing an identical result.

**Backend (real-DB, the 3 `paymentReportingService.ts` sites - new file, nothing covered these before this fix):**
```bash
cd backend
TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/driving_school npx vitest run src/__tests__/paymentReportingNoShowRealDb.integration.test.ts
```

**Pass looks like** (5 tests, explicit no-op without `TEST_DATABASE_URL`): `getPaymentPeriodSummary`'s tenant-wide outstanding total shows `$0` for a student whose only unpaid-looking lesson is a no-show, not inflated by its cost; a student whose only lesson is a no-show does not appear in `getWhoOwesYou` at all (nothing left to owe once that lesson's cost is excluded); a student with both a real unpaid lesson and an unrelated no-show lesson shows the correct, lower `amountOwed` in `getWhoOwesYou` (the no-show's cost is not added on top); `getPaymentReceiptData`'s `enrollmentOutstandingBalance`/`enrollmentCreditBalance` exclude a no-show lesson's cost from the enrollment total; and a no-show lesson creates a real, independent `fee_flags` row (status `outstanding`) that has zero effect on any of the balance figures above - proving the fee and the credit exclusion are two genuinely separate numbers, not accidentally linked.

**Backend (instructor earnings, confirming no code change was needed):**
```bash
cd backend
npx vitest run src/__tests__/instructorEarningsNoShow.test.ts
```

**Pass looks like:** `getInstructorEarnings`'s own SQL still filters `l.status = 'completed'` exactly and was never widened to reference the new shared no-show exclusion - a no-show lesson was already excluded from instructor earnings before this fix (it was never `'completed'`), so this test passes with zero code changes to `instructorService.ts`, proving the pre-existing behavior was already correct.

**Frontend:** no code or test changes - confirmed by searching `frontend/src` for any component that independently re-filters lesson cost by status client-side (none found; every student-facing balance display renders a server-computed number only).

---

### 2.73 Record Payment form redesign (payment-form-v2)

`PaymentModal.tsx` rewritten to a two-step form (`'form' | 'confirmation'`): no default payment method (must be explicitly chosen, with an inline error on submit if missing), BSV/MNEE method chips hidden entirely (not shown-disabled) unless `enableBlockchainPayments` is on, quick-amount chips built from the student's real data, a same-day duplicate-payment warning, an overpay credit note, and a "Payment recorded" confirmation step with Print receipt/Record another/Done. All 4 existing entry points (Payments page toolbar, card/row "Add Payment", payment history modal, Who Owes You row, and the booking-eligibility banner) keep working unchanged - `PaymentModal`'s prop interface (`isOpen`/`onClose`/`student`) did not change. See `docs/ARCHITECTURE.md` §44 for the quick-amount FIFO-allocation design and the duplicate-check's deliberate server-side 24h-window approach.

**Backend (mocked-query, new):**
```bash
cd backend
npx vitest run src/__tests__/paymentQuickAmounts.test.ts src/__tests__/paymentQuickAmountsRoutes.test.ts
```

**Pass looks like:** `paymentQuickAmounts.test.ts` (12 tests) - a $0-lessons student gets every chip as `null`; with no payments at all every bucket shows its full lesson-sum cost; a partial payment covers the oldest completed lesson first, then the next, FIFO; enough payment to clear all completed debt partially covers the next scheduled lesson; a full credit clears every bucket; a `no_show` lesson's cost is excluded entirely from every bucket, same as `cancelled`; a package-priced enrollment's `totalCost` override drives `remainingCourse` independent of the lesson-bucket sum; every tenant-scoped query call includes `tenantId` in its params; a student outside the tenant 404s. `paymentQuickAmountsRoutes.test.ts` (7 tests) - staff/admin can reach both new routes (200), instructor is rejected (403, financial data is never instructor-visible), unknown student 404s, duplicate-check 400s when `amount`/`paymentMethod` query params are missing, and returns the correct `isDuplicate`/`amount` shape in both the match and no-match cases.

**Frontend (mocked, jsdom):**
```bash
cd frontend
npx vitest run src/components/payments/PaymentModal.test.tsx src/pages/Payments.test.tsx src/components/scheduling/SmartBookingForm/__tests__/PaymentNeededBanner.test.tsx
```

**Pass looks like:** `PaymentModal.test.tsx` (22 tests, fully rewritten for this redesign) - no payment method is selected by default and all 6 method chips (plus BSV/MNEE when enabled) render with `aria-pressed="false"` on open; submitting with no method shows "Please choose a payment method" and never calls `paymentsApi.create`; BSV/MNEE chips are absent from the DOM entirely (not just disabled) when `enableBlockchainPayments` is false, and selectable when true; quick-amount chips render each bucket's real amount/label from the mocked `getQuickAmounts` response, de-duplicating two chips that happen to share the same amount, covering a $0-lessons student (no chips), a fully-covered/credit student (no chips), and a response reflecting a `no_show` exclusion; the duplicate-payment warning shows and is dismissible without disabling submit; the overpay note shows the correct credit amount and is absent when the amount is within balance; the confirmation step shows "Payment recorded" with the right amount/method and does NOT call `onClose` until "Done" is clicked, "Record another" resets the form for the same student without closing, "Print receipt" opens `/payments/:id/receipt` in a new tab; the double-submission guard still disables the submit button mid-mutation; the student-selector dropdown (the one entry point with no preselected student, the Payments page's header "Record Payment" button) requires an explicit selection and is absent when a student IS preselected. `Payments.test.tsx` and `PaymentNeededBanner.test.tsx` re-run unchanged and pass with zero new failures, confirming every other entry point and the banner's `onClose`-triggers-a-recheck contract survived the rewrite untouched.

**Playwright screenshots (light + dark; chips, validation error, duplicate warning, overpay note, confirmation, phone width — force-add with `git add -f`, confirm with `git ls-tree`):**
```bash
cd frontend
npx playwright test e2e-screenshots/payment-form-v2.spec.ts
```
Uses this tenant's existing seed data (Benjamin Hayes has a real outstanding balance with completed/scheduled lessons) rather than creating new fixtures - the quick-amount chips are screenshotted from his real numbers.

**Pass looks like:** the form shows real quick-amount chips (e.g. "2 completed, unpaid · $290.00") with no method pre-selected; submitting with an amount but no method shows the inline "choose a payment method" error; entering an amount/method combo already recorded today shows the gentle "already recorded today" warning with a working Dismiss link, submit still enabled; an amount far exceeding the balance shows "This will leave $X credit on account"; after saving, the confirmation step shows "Payment recorded", the amount, the method, and all three buttons; at phone width both the chip form and the confirmation step remain fully readable with nothing clipped. Verify by looking at the actual screenshots, not just a green exit code.

---

## 3. Known issues to route around

- **Email not configured**: the backend logs `⚠️ Email configuration incomplete` on startup — expected, `SMTP_USER`/`SMTP_PASS` aren't set by default. Notifications requiring actual email delivery won't send; this is not a bug to chase during UI testing.
- Port `4000` may already be in use by an unrelated local process on some machines — if `npm run dev` fails with `EADDRINUSE`, set `PORT` in `backend/.env` to a free port and update `frontend/.env`'s `VITE_API_URL` to match.
- **`BSV_ENABLED` drift**: this doc and CLAUDE.md both describe BSV as disabled by default (`BSV_ENABLED=false` → `NoopLedgerService`). If your local `backend/.env` has `BSV_ENABLED=true`, the backend will load the real `BsvLedgerService` instead, and §2.16's expected `provider: "noop"` response won't match. Set it to `false` and restart the backend before running §2.16, or expect a different (real ledger) response if you intentionally leave it `true`.
- **Notification auto-send is still not wired up**: `notification_queue` rows are now correctly written and readable (§2.51), but nothing automatically processes them into sent emails — there's no running cron, and the manual "Process Queue" button currently finds zero eligible rows due to a separate column-name mismatch in `notificationProcessor.ts`. This is a known, reported functional gap, not something §2.51's fix was meant to address.
- **`tenant.tenantType` is still `undefined`**: fixing `tenantService.ts`'s camelCase gap (§22) did not fix this — the underlying `tenant_full_info` view has no `tenant_type` column at all, and never has. This is a separate, pre-existing gap in the schema, not a case-conversion bug.
- **`treasury_transactions` does not exist**: no migration anywhere in this repo creates it, and it's absent from the dev database (confirmed via `to_regclass`). `treasuryService.createTransaction`'s `INSERT` has always silently failed on every lesson booking with a nonzero cost, caught by `lessonService.ts`'s own non-blocking try/catch — this predates, and is unrelated to, the §23 ledger-seam fix (which preserves this exact silent-failure behavior rather than fixing it, since fixing it was outside that fix's scope). Reported for visibility, not yet actioned.
