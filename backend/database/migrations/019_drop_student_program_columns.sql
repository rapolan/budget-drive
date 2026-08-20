-- Drops the program-specific columns that migration 018 copied onto
-- enrollments and the previous commit's service layer stopped reading -
-- students becomes purely a person record. Ships as its own migration
-- (separate from 018 and separate from the service-layer commit) so it can
-- be reverted independently if anything is found to still depend on these
-- columns.
--
-- Re-verified immediately before writing this migration that nothing -
-- services, controllers, seeds, tests, or the frontend - reads
-- total_hours_completed: it is confirmed dead (only mentioned in comments
-- and inert test fixtures). It is deliberately NOT carried onto
-- enrollments (see 018's header comment) - a stored, easily-stale counter
-- is exactly the trap computeStudentProgress replaced by deriving progress
-- from lesson rows every read. Do not reintroduce a cached hours-completed
-- column later; derive it the same way.
--
-- bsv_certificate_hash is dropped rather than moved to enrollments for the
-- same reason - confirmed dead (nothing writes it) - and will be
-- reintroduced properly once certificates become enrollment-scoped.
--
-- total_paid/outstanding_balance/payment_status were confirmed stale,
-- uncached columns (only ever written by a generic PATCH path, never kept
-- in sync with payments) - the service layer now derives these from
-- payments.amount per enrollment instead (see enrollmentService's
-- computePaymentSummary), so the stored columns are no longer read or
-- written anywhere and can be dropped.
--
-- lessons.student_id and payments.student_id are DEFERRED to a follow-up
-- migration, NOT dropped here, despite being pure duplication (an
-- enrollment already identifies its student - unlike fee_flags.student_id,
-- see below). Dropping them turned out to require rewriting/verifying a
-- larger surface than fits safely in this commit:
--   - lessonService.ts alone has ~13 SELECT/RETURNING statements on
--     lessons that would each need an enrollments join-alias
--     (`e.student_id AS student_id`) to keep Lesson.studentId working for
--     the ~7 live read sites that consume it as a value (fee-flag
--     creation, no-show notifications, the merge-on-update path) - doable,
--     but not yet done.
--   - schedulingService.ts's ranked-slot search (the 6D availability
--     engine) filters lessons directly by `WHERE student_id = $1` in THREE
--     places, including a query that runs on every single ranked-slot
--     search (the student's-own-lessons overlap check) plus the
--     max-lessons-per-day and daily-count checks. These are WHERE-clause
--     filters, not SELECT projections, so the join-alias trick doesn't
--     apply - each needs either a subquery/join added to a hot path, or a
--     restructuring so callers pass an enrollment id instead of a student
--     id, and the cost/design of either wasn't evaluated with enough
--     confidence to change a query that runs on every search.
-- TODO(students-refactor-followup): once the ~13 lessonService.ts sites and
-- the 3 schedulingService.ts hot-path filters are migrated to resolve
-- student_id via enrollments (or schedulingService is restructured to
-- filter by enrollment_id directly), drop lessons.student_id and
-- payments.student_id in a dedicated migration. Until then both columns
-- are pure duplication of enrollments.student_id - kept in sync by every
-- INSERT (already writing both) - and must NOT be treated as more
-- authoritative than the enrollment they duplicate.
--
-- fee_flags.student_id is a different case and stays permanently, not just
-- deferred: fee_flags carries both student_id and enrollment_id, and they
-- mean different things - enrollment_id is PROVENANCE (which program's
-- lesson generated the fee - relevant to CVC §11108's cost-of-instruction
-- record), student_id is WHO OWES IT (the person). A fee clears when the
-- student's next lesson completes, which may be booked under a LATER
-- enrollment than the one that generated the fee - so fee_flags must stay
-- queryable by person, not just by enrollment. See the header comment in
-- feeFlagService.ts for the full rationale.

ALTER TABLE public.students DROP COLUMN hours_required;
ALTER TABLE public.students DROP COLUMN total_hours_completed;
ALTER TABLE public.students DROP COLUMN track_override;
ALTER TABLE public.students DROP COLUMN completed;
ALTER TABLE public.students DROP COLUMN completed_at;
ALTER TABLE public.students DROP COLUMN completed_by;
ALTER TABLE public.students DROP COLUMN completion_reason;
ALTER TABLE public.students DROP COLUMN status;
ALTER TABLE public.students DROP COLUMN enrollment_date;
ALTER TABLE public.students DROP COLUMN assigned_instructor_id;
ALTER TABLE public.students DROP COLUMN license_type;
ALTER TABLE public.students DROP COLUMN bsv_certificate_hash;
ALTER TABLE public.students DROP COLUMN total_paid;
ALTER TABLE public.students DROP COLUMN outstanding_balance;
ALTER TABLE public.students DROP COLUMN payment_status;

