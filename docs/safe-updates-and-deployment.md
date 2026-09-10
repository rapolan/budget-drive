# Safe Updates & Deployment — Reference Guide

**Purpose:** once real schools have real data in production, this document
is the discipline that keeps every future update from destroying or
corrupting that data. Read this before every deployment, not just the
first one.

---

## The core principle

Your database has two things in it once a school is live:

- **Structure** — tables and columns, defined by your migrations.
- **Data** — real students, lessons, payments, certificates. Irreplaceable.

Every update might need to change the *structure*. It must **never**
destroy or corrupt the *data*. The one rule that guarantees this:

> **Migrations are append-only, forever, once real data exists.**
> You only ever ADD new migration files. You never edit, delete, or
> reorder an old one — even to fix a typo in it.

This project has followed this discipline the whole way through
development (migrations 001–033, each a new file, none ever edited
after merging). The only thing that changes at launch is that this
becomes **non-negotiable** — a mistake here can't just be re-run in dev,
it can damage a real school's records.

---

## Why "never edit an old migration" matters

A migration file is a *record of what already happened* to a real
database. Editing migration `015` after a school has already run it
means:

- Their database already reflects the OLD version of `015`.
- Your local dev database, if rebuilt from scratch, would reflect the
  NEW version of `015`.
- Now your code and their database structurally disagree — and there's
  no clean way to reconcile it. This is how you get "works on my
  machine, breaks in production," except the production breakage
  touches real people's data.

The fix is always: leave `015` alone, and add a new migration (say,
`034`) that makes the additional change you wanted. History is
permanent; only the *present* moves forward.

---

## Every deployment, the same checklist

Follow this exact sequence for every update, every time, no exceptions:

### 1. Write the migration as a NEW file

- Next sequential number (`034_...sql`, `035_...sql`, ...).
- Never touch `001` through whatever the last shipped number is.
- If you need to fix something an old migration got wrong, write a NEW
  migration that corrects it (e.g. `ALTER TABLE ... ALTER COLUMN`), not
  an edit to the old file.

### 2. Every migration must be safe to run on a database that already has real rows

This is the part that's different from dev, where your database is
usually empty or full of disposable seed data. In production, ask of
every migration:

- **Adding a column?** Give it a default, or make it nullable. A brand
  new `NOT NULL` column with no default will fail outright on a table
  that already has rows — because Postgres has nothing to put in that
  column for the rows that already exist.
- **Adding a constraint (a CHECK, a UNIQUE, a foreign key)?** Confirm no
  existing row would violate it *before* the migration runs. If some do,
  the migration fails partway — or worse, silently corrupts data trying
  to satisfy the new rule. (This project has done this check explicitly
  every time a constraint changed — e.g. confirming existing `enrollments`
  rows were only `active`/`completed` before widening a status CHECK.)
- **Renaming or dropping a column?** Only do this if you're certain
  nothing in the currently-deployed app code still reads the old name —
  and even then, prefer a two-step migration (add the new column, backfill
  it, deploy code that uses the new one, THEN drop the old column in a
  *later* release) over a single risky one-shot rename.
- **Backfilling data?** Test the exact `UPDATE`/backfill statement against
  a copy of production-shaped data first (a staging environment, or a
  restored backup — see below), not just your dev seed data. Seed data is
  small and clean; real data has edge cases seed data never covers.

### 3. Test the migration against a FRESH copy of production data, not just dev

Before shipping any migration:

1. Take a current backup of the real production database (Railway does
   this automatically if you've set up managed Postgres with backups —
   confirm this is on).
2. Restore that backup into a separate, throwaway staging database.
3. Run your new migration against that staging copy.
4. Confirm: the migration completes without error, the app still works
   correctly end to end against the migrated data, and nothing that
   existed before is missing or wrong.
5. Only once that's clean, run the same migration against real production.

This is the single most important habit in this whole document. It
catches the "this works in dev but the real data has something dev never
had" class of failure before it touches a real school.

### 4. Deploy code and migrations together, in the right order

- Migrations run *before* the new app code goes live (so the new code
  never queries for a column that doesn't exist yet).
- If a migration and a code change are related, they ship in the same
  release — never let "new code expecting a new column" go live before
  the column actually exists.

### 5. Have a rollback plan for the CODE, and accept that migrations usually don't roll back

- Rolling back *code* (going back to the previous app version) is
  usually easy — Railway keeps deployment history, redeploy the last
  good one.
- Rolling back a *migration* that already ran against real data is much
  harder, and sometimes impossible without data loss (e.g. you can't
  "un-drop" a column and get the data back unless you have a backup from
  before the drop). This is exactly why step 3 (test on a staging copy
  first) matters so much — the goal is to never need a migration
  rollback in production at all.

### 6. Verify after deploying

- Confirm the migration applied (check the migrations table / your
  deployment logs).
- Spot-check the app is working: log in, view a student, book a lesson —
  whatever the release touched, confirm it directly rather than assuming
  because the deploy succeeded.
- Confirm nothing that worked before now errors (a quick pass through
  the main pages).

---

## What NOT to do, ever, once a school has real data

- ❌ Edit a migration file that's already been applied to production,
  for any reason, even a "harmless" typo fix.
- ❌ Run `DROP TABLE`, `TRUNCATE`, or a broad `DELETE`/`UPDATE` with no
  `WHERE` clause directly against production without it being inside a
  reviewed, tested migration.
- ❌ Test a new migration against production data for the first time —
  always test against a restored copy first (step 3 above).
- ❌ Deploy a migration and new code as separate, out-of-order steps
  without thinking through what happens to a request that lands in the
  gap between them.
- ❌ Skip the backup-and-restore test because "it's a small change." Small
  changes cause the same damage as large ones when they're wrong — the
  size of the change has no relationship to the size of the consequence.

---

## One-time note: the migration squash

Before your FIRST real school goes live, this project's migrations
(001–033 today) get collapsed into a single clean baseline migration —
a one-time move, done once, verified against a fresh empty database,
and never repeated. After that point, the append-only rule above governs
every migration from then on, forever. This squash is the last moment
the "never edit history" rule doesn't yet apply, because there's no real
data yet to protect. Once it's done and a school's data starts flowing
in, the rule in this document is permanent.

---

## Quick reference — the one sentence to remember

**New migration file, safe on existing rows, tested against a restored
backup copy first, code and migration deployed together, verified after.**

If you ever feel rushed and tempted to skip step 3 (testing against a
real-data copy), don't — it's the one step that exists specifically to
catch the mistake that would otherwise reach real students' records.
