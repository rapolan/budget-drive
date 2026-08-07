-- Many-to-many link between students and guardians. Deleting a student
-- cascades (a student's guardian links are meaningless without the
-- student). Deleting a guardian is RESTRICTed at the DB level as a
-- backstop; guardianService.deleteGuardian performs a proactive pre-check
-- for a clean application error before ever reaching this constraint -
-- this is the DB-level safety net, not the primary UX.

CREATE TABLE public.student_guardians (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    guardian_id uuid NOT NULL,
    relationship text CHECK (relationship IN ('mother','father','grandparent','legal_guardian','other')),
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT student_guardians_student_id_guardian_id_key UNIQUE (student_id, guardian_id)
);

ALTER TABLE public.student_guardians
    ADD CONSTRAINT student_guardians_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.student_guardians
    ADD CONSTRAINT student_guardians_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE public.student_guardians
    ADD CONSTRAINT student_guardians_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES public.guardians(id) ON DELETE RESTRICT;

-- Exactly one primary guardian per student.
CREATE UNIQUE INDEX idx_student_guardians_one_primary
    ON public.student_guardians (student_id) WHERE (is_primary = true);

CREATE INDEX idx_student_guardians_student ON public.student_guardians (student_id);
CREATE INDEX idx_student_guardians_guardian ON public.student_guardians (guardian_id);
