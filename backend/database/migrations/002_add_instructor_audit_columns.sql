-- Add created_by/updated_by audit columns to instructors, matching the
-- existing lessons/students pattern (nullable uuid, FK to users, ON DELETE
-- SET NULL, no index). instructorService.updateInstructor already writes
-- updated_by; without this column every instructor edit 500s.

ALTER TABLE public.instructors ADD COLUMN created_by uuid;
ALTER TABLE public.instructors ADD COLUMN updated_by uuid;

ALTER TABLE public.instructors
    ADD CONSTRAINT instructors_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.instructors
    ADD CONSTRAINT instructors_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
