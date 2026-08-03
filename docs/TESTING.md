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

**Pass looks like:** All 8 seeded students appear (Sarah, Michael, Jessica, Tyler, Aisha, Noah, Olivia, Marcus), with progress stages visibly different — Noah at 0 hours, Olivia near 30/30, Marcus at `completed` status. Search and status filter both narrow the list correctly. Opening a student shows their lesson history including a mix of completed/cancelled entries for students who have them (e.g. Michael Chen has a cancelled lesson).

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

---

## 3. Known issues to route around

- **Email not configured**: the backend logs `⚠️ Email configuration incomplete` on startup — expected, `SMTP_USER`/`SMTP_PASS` aren't set by default. Notifications requiring actual email delivery won't send; this is not a bug to chase during UI testing.
- Port `4000` may already be in use by an unrelated local process on some machines — if `npm run dev` fails with `EADDRINUSE`, set `PORT` in `backend/.env` to a free port and update `frontend/.env`'s `VITE_API_URL` to match.
- **`BSV_ENABLED` drift**: this doc and CLAUDE.md both describe BSV as disabled by default (`BSV_ENABLED=false` → `NoopLedgerService`). If your local `backend/.env` has `BSV_ENABLED=true`, the backend will load the real `BsvLedgerService` instead, and §2.16's expected `provider: "noop"` response won't match. Set it to `false` and restart the backend before running §2.16, or expect a different (real ledger) response if you intentionally leave it `true`.
- **Lesson edit path has no conflict validation**: editing an existing lesson's date/time/instructor via the pencil-icon modal (as opposed to creating a new booking) does not run any scheduling-conflict or capacity check. It's possible to silently move a lesson into a double-booking or a full day this way. See §2.14 for the specific test case — this is a known gap, not expected behavior to preserve.
