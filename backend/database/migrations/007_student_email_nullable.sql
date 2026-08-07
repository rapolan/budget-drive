-- students.email is required NOT NULL today, which blocks enrolling two
-- minor siblings who share a single parent contact (or have no email of
-- their own at all - typical for minors). Email becomes optional; still
-- required for adults (18+), enforced server-side in studentService (age
-- changes daily, so this can't be a DB CHECK - Postgres CHECK constraints
-- must be immutable).

ALTER TABLE public.students ALTER COLUMN email DROP NOT NULL;

DROP INDEX public.idx_students_email_tenant;

CREATE UNIQUE INDEX idx_students_email_tenant
    ON public.students USING btree (tenant_id, email)
    WHERE (email IS NOT NULL);
