-- Program completion tracking + track override for students, matching the
-- audit-column pattern from migration 002 (nullable columns, FK to users,
-- ON DELETE SET NULL, no index).
--
-- completed/completed_at/completed_by/completion_reason become the sole
-- source of truth for "is this student's program done" - replacing the old
-- client-side auto-derivation (totalHoursCompleted >= hoursRequired).
--
-- track_override lets an admin pin a student's progress track ('hours' or
-- 'lessons') regardless of age-derived default - needed for a student who
-- turns 18 mid-program and is kept on the hours track deliberately.

ALTER TABLE public.students ADD COLUMN completed boolean DEFAULT false;
ALTER TABLE public.students ADD COLUMN completed_at timestamp without time zone;
ALTER TABLE public.students ADD COLUMN completed_by uuid;
ALTER TABLE public.students ADD COLUMN completion_reason text;

ALTER TABLE public.students
    ADD CONSTRAINT students_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.students ADD COLUMN track_override text;
ALTER TABLE public.students
    ADD CONSTRAINT students_track_override_check CHECK (track_override IS NULL OR track_override IN ('hours', 'lessons'));
