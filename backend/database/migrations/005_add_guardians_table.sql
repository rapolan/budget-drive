-- Guardians as first-class, tenant-scoped records. Many-to-many with
-- students via student_guardians (migration 006). No PII is denormalized
-- onto students or any other table - all guardian data lives here only.
-- Matches the students/instructors audit-column and tenant-scoping pattern.

CREATE TABLE public.guardians (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    email character varying(255),
    phone character varying(50),
    created_by uuid,
    updated_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT guardians_email_or_phone_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

ALTER TABLE public.guardians
    ADD CONSTRAINT guardians_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.guardians
    ADD CONSTRAINT guardians_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.guardians
    ADD CONSTRAINT guardians_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Deliberately NO unique index on email/phone - two guardian records may
-- legitimately share contact info (e.g. divorced parents both listing the
-- same old family email). Enforcing uniqueness here would force a merge
-- decision at insert time. Deduplication is surfaced only via the guardian
-- matching service (findGuardianCandidates/findExactGuardianMatch), acted
-- on only through an explicit link - never automatically.
CREATE INDEX idx_guardians_tenant_email ON public.guardians USING btree (tenant_id, email);
CREATE INDEX idx_guardians_tenant_phone ON public.guardians USING btree (tenant_id, phone);
CREATE INDEX idx_guardians_tenant_last_name ON public.guardians USING btree (tenant_id, last_name);
