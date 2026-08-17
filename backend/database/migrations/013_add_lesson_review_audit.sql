-- Audit columns for the lesson review queue: who reviewed a past lesson
-- (marked it completed/no_show/cancelled) and when, matching the existing
-- created_by/updated_by pattern (nullable uuid, FK to users, ON DELETE SET
-- NULL, no index). Every lesson today stays 'scheduled' forever since
-- nothing records who closed one out - this is what the new review-queue
-- and inline-status-control endpoints write.

ALTER TABLE public.lessons ADD COLUMN reviewed_by uuid;
ALTER TABLE public.lessons ADD COLUMN reviewed_at timestamp without time zone;

ALTER TABLE public.lessons
    ADD CONSTRAINT lessons_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;
