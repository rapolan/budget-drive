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

> **Important:** `npm run migrate` (`database/run-migration.js`) only applies `001_complete_schema.sql`. It does **not** run later migration files. Use `run-all-migrations.js` directly so `002_idempotent_updates.sql` and `003_instructor_availability_columns.sql` are applied too:

```bash
cd backend
node database/run-all-migrations.js
```

Expected output: all migration files listed with `✅ ... completed` (or `⏭️ already applied` on a re-run).

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

### 1.8 Full command sequence (copy-paste)

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

---

## 3. Known issues to route around

- **Email not configured**: the backend logs `⚠️ Email configuration incomplete` on startup — expected, `SMTP_USER`/`SMTP_PASS` aren't set by default. Notifications requiring actual email delivery won't send; this is not a bug to chase during UI testing.
- **`npm run migrate` is incomplete** (see §1.4) — always use `run-all-migrations.js` for a full setup, not the `npm run migrate` script alone.
- Port `4000` may already be in use by an unrelated local process on some machines — if `npm run dev` fails with `EADDRINUSE`, set `PORT` in `backend/.env` to a free port and update `frontend/.env`'s `VITE_API_URL` to match.
