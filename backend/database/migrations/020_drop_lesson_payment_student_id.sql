-- Closes the deferral recorded in migration 019's header comment: drops
-- lessons.student_id and payments.student_id, which are pure duplication of
-- enrollments.student_id (a lesson's or payment's student IS its
-- enrollment's student - there is no second meaning to preserve, unlike
-- fee_flags.student_id, which stays permanently - see feeFlagService.ts's
-- header comment for why that one is provenance vs. obligation, not
-- duplication).
--
-- Prerequisite work, already shipped in the same commit as this migration:
-- every read site in lessonService.ts, paymentService.ts,
-- schedulingService.ts, dashboardService.ts, notificationProcessor.ts, and
-- routes/notifications.ts that used to read lessons.student_id or
-- payments.student_id directly now resolves it via a join/subquery to
-- enrollments (`e.student_id AS student_id` on SELECTs, a scalar subquery
-- on UPDATE ... RETURNING, since RETURNING cannot join directly). Every
-- returned row object still carries .studentId unchanged - this migration
-- changes no application-visible behavior, only removes the now-unread,
-- duplicate columns.
--
-- A second, real bug was found and fixed in the same commit while auditing
-- these read sites: updateLesson allowed reassigning a lesson's student via
-- the live edit form but only wrote student_id, never enrollment_id -
-- meaning enrollment_id silently kept pointing at the ORIGINAL student's
-- enrollment after a reassignment. Fixed to resolve and write both columns
-- together (or reject if the new student has no active driver_training
-- enrollment). The repair step below re-syncs any lessons that drifted
-- under the old buggy behavior before their student_id is dropped for good
-- - once dropped, student_id (the column the edit form actually wrote, and
-- therefore the trustworthy one for historical rows) is gone, and a stale
-- enrollment_id would become the only, wrong, source of truth.
--
-- payments.student_id needs no repair step: updatePayment never allows
-- reassigning a payment's student, so it cannot have drifted the same way.

-- Repair: for any lesson whose enrollment_id disagrees with its own
-- (trustworthy - the edit form wrote it) student_id, re-point enrollment_id
-- at that student's current active driver_training enrollment.
UPDATE lessons l
SET enrollment_id = e.id
FROM enrollments e
WHERE e.student_id = l.student_id
  AND e.tenant_id = l.tenant_id
  AND e.program_type = 'driver_training'
  AND e.status = 'active'
  AND l.enrollment_id != e.id;

-- fee_flags.student_id is untouched - permanent, not deferred, see above.
ALTER TABLE public.lessons DROP COLUMN IF EXISTS student_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS student_id;
