# Budget Drive Pro — Compliance Records Build Plan

A connected set of features turning finished students into complete,
provable compliance records. Four phases, sequenced by dependency.
Each phase ships and verifies independently — you can pause or
reprioritize between any of them.

---

## The dependency chain (why the order is what it is)

- **School settings** must come first: the certificate document, the DE
  certificate, AND the archive hash all need the school license number.
  Build anything else first and it gets re-done once settings exist.
- **DT certificate content** needs school settings, and corrects a bug
  (wrong `DL_400C` default) before real certificates are recorded wrong.
- **DE module** needs school settings and reuses the certificate system
  the DT content establishes.
- **Archive** comes last — it seals completed records of BOTH program
  types, so both must produce complete, sealable records first. Sealing
  incomplete records means re-sealing later.

Order is essentially forced: **settings → DT certificate → DE module →
archive.**

---

## Phase 1 — School-identity settings  *(small, not plan-mode)*

Add tenant-level fields and a settings UI:
- School name
- School address
- School telephone number
- Driving school license number

Entered once by the admin. Nothing consumes them yet — pure foundation.
Low-risk, unblocks everything downstream.

**Done when:** the four fields persist per tenant and are editable in
settings.

---

## Phase 2 — Driver-training certificate content  *(medium, likely not plan-mode)*

Assemble the real **DL 400D** certificate document ("Certificate of
Completion of Behind-The-Wheel Training") from:
- School identity (from Phase 1 settings)
- Student: full name, date of birth, completion date (already stored)
- Instructor who issued it + instructor license number (already stored,
  surface it)
- Certificate serial + form type

**Bug to fix:** the certificate feature shipped defaulting `form_type`
to `DL_400C`. That's wrong — DL 400C is the *online driver-ed* form.
Behind-the-wheel training is **DL 400D**. Derive the form type from the
enrollment's program type instead of a hardcoded default:
- `driver_training` → **DL 400D**
- `driver_education` → **DL 400B**  (classroom)
- `driver_education` → **DL 400C**  (classroom online)
Fix the default AND correct any existing records/seed carrying the wrong
form type. Drop the "(NEW 4/2010)" revision suffix — just the form
number.

Format: clean screen/print output of all required fields now. A styled
PDF matching the official form layout is an explicit LATER polish, not
this phase.

**Done when:** a recorded driver-training certificate can produce the
full DL 400D document with every DMV-required field, form type derived
correctly.

---

## Phase 3 — Driver-education tracking module  *(large, PLAN MODE)*

An **administrative tracking module** — NOT a course-delivery platform.
Records and administers driver education; does not teach the 30 hours in
the app (no content, quizzes, or exam — that would be a second product,
explicitly out of scope).

Today driver_education is scaffolded only: the enrollment type exists,
but completion is manually entered, there's no hours/progress tracking,
and it doesn't flow into certificates ("no lesson tracking" per the
code). This phase makes it a real administrative program.

Scope:
- A dedicated, **toggleable** page — `enableDriverEducation` feature
  flag (matching the existing feature-flag pattern), OFF by default, so
  tenants who don't offer driver ed never see it.
- Enroll a student in driver education.
- Track progress toward the 30-hour requirement (however hours are
  delivered/recorded — design the tracking model in plan mode).
- Mark completion.
- Issue the **DL 400B** certificate into the existing certificate
  system.
- Completed DE records become sealable by the archive (Phase 4).

Plan-mode because the tracking model is a real design decision (how
hours are recorded, what completion means, how it surfaces), and it
fills a genuine gap rather than assembling existing data.

**Done when:** a tenant can enable DE, enroll a student, track hours to
completion, and issue a DL 400B — all administratively.

---

## Phase 4 — Archive  *(large, PLAN MODE)*

Seal completed records (both program types) into a browsable,
retained, tamper-evident archive.

Concept (settled across the design conversation):
- **Soft-flag lifecycle** (`archived_at`), reversible, retained for the
  compliance period (§11108 = 3 years minimum). Soft flag chosen over
  moving rows: reversibility (returning students) and no dangling FKs.
- **Trigger = completed AND at rest**, never completion alone:
  - Completion is required — an incomplete student is NEVER auto-archived.
  - For a completed record, the seal trigger is: instruction permit
    expired (if on file) OR a time-since-last-activity grace period
    (fallback, e.g. adults with no permit clock).
  - Any new activity (a booked lesson) resets the clock — the
    "4th lesson for good measure" case stays active.
  - An INCOMPLETE student whose permit expired is NOT archived — they're
    a "stalled, may renew and return" case → surfaces in needs-attention,
    stays active. (A student can renew a lapsed permit and finish.)
- **Manual override both directions:** seal a record early, or hold one
  active when you know the student is returning.
- **Browse-by-date view:** grouped year → month, newest first, old years
  collapsed. Instructor filter. Each sealed record shows its facts, a
  "Restore to active" action (behind a CONFIRM guard — it reverses a
  seal), and the on-demand transcript.
- **The seal computes a no-PII `archive_hash`** (SHA-256) over the
  record's provable facts:
  - student ID, enrollment ID(s), program type
  - per-lesson facts: date, duration, **instructor ID** (per-lesson, so
    multi-instructor records prove correctly — a student may complete
    6 hours across more than one instructor)
  - total hours, completion date
  - certificate serial(s)
  - **school license number** (from Phase 1 — proves which licensed
    school sealed it)
  - archive date
  - NO PII — IDs and facts only; names resolve from the DB, never enter
    the hash.
- **BSV anchoring hook:** `archive_ledger_txid` nullable, written
  nowhere yet, no blockchain imports — same forward-compat pattern as
  the certificate/enrollment `completion_hash`/`ledger_txid`. When
  `BSV_ENABLED`, the seal anchors the hash and stores the txid. The
  archive UI shows a "Verify" affordance now (in a "hash recorded, not
  yet anchored" state); it becomes a real chain check when BSV is on.
- **Un-archiving + re-sealing:** restoring a returning student is a flag
  flip; when they finish again, re-sealing anchors a NEW hash. The chain
  becomes an honest history of the record's final states over time.

Display note: the certificate names the ISSUING instructor; the sealed
archive record shows ALL contributing instructors (with hours each
taught), since it proves the full training history.

Plan-mode — schema, seal trigger logic, the lifecycle, the hash, the
browse view. The biggest structural piece since the enrollments refactor.

**Done when:** completed records of both types seal on the correct
trigger, browse by date, verify against a stored hash, and restore for
returning students — with the BSV hook present and unwired.

**Built.** Grain settled as `students` (not per-enrollment) with the
trigger still evaluated per-enrollment; BTW's inactivity fallback and the
DE year-end rule both landed as designed, the BTW grace period tunable
per tenant. Manual overrides shipped as three explicit actions (archive
early, hold with a required reason and no auto-expiry, confirm-guarded
restore); the eligibility worklist is live-computed, never a background
job. See `docs/ARCHITECTURE.md` §16 for the full built shape and
`docs/BLUEPRINTS.md`'s "Archive" section for the narrative version.

---

## Sequencing principle

Value early, de-risk late: Phase 1 is trivial and unblocks all; Phase 2
gives real certificates fast (high value, low risk); Phase 3 fills a
genuine, long-intended product gap; Phase 4 — heaviest and most
structural — comes last, when everything it seals actually exists. No
building on an incomplete foundation; no re-hashing.

## Standing build practices (carry into every phase's prompt)

- Verify the push landed on `Budget/main` via `git ls-remote` before
  reporting a SHA.
- Fresh-clone + clean-install before reporting green (warm-cache green
  has masked real failures).
- Group commits by coherence, not by counting prompt items.
- Live-reproduce UI/behavioral changes before and after.
- Surface a hidden second half (e.g. a backend cause behind a frontend
  bug) and ask before widening scope.
- A failing test after a behavior change is a question (which side is
  wrong?), not a chore.
- Schema changes ship their migration in the same commit; migrations are
  append-only.
- No-PII rule for any hash; colors as tokens; frontend never computes
  timezone boundaries (resolve in tenant time).
