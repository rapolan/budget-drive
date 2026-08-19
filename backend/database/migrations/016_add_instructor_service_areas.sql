-- Instructor service-area ZIP codes: which ZIPs an instructor is willing to
-- travel to for a lesson. One row per (instructor, zip). Modeled on
-- student_guardians' FK/index/tenant-scoping shape (006_add_student_
-- guardians.sql).
--
-- Design choice: a normalized child table (one row per zip), not a
-- comma-separated text column or a jsonb array, because:
--   1. Membership lookups ("does instructor X serve zip Z") need to be a
--      plain indexed equality/ANY() lookup usable directly in the ranked-
--      slots query - a comma-separated column would need a LIKE/regex scan
--      (no index), and prefix-matching "920" against "92101" reproduces the
--      exact fragile, accidental-collision-prone matching this table shape
--      avoids by requiring exact 5-digit zips.
--   2. A jsonb array column would still need a functional/GIN index to
--      query efficiently and gets no referential integrity for free; a
--      plain child table gets both a normal btree index and a real FK
--      (ON DELETE CASCADE) with no extra tooling.
--   3. One row per zip also gives per-row created_at for free (future
--      audit/removal-tracking) without any schema growth later.
--
-- No service-area rows for an instructor means "serves everywhere"
-- (Constraint B, enforced in application code in schedulingService.ts, NOT
-- via a sentinel row here - an empty set is the natural, unambiguous
-- representation of "unconfigured").
--
-- Supersedes an earlier, disconnected frontend-only attempt at this same
-- idea (Instructor.homeZipCode/serviceZipCodes, a comma-separated free-text
-- field with no backing column - removed in the commit before this one).
-- See docs/BLUEPRINTS.md.

CREATE TABLE public.instructor_service_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    zip_code character varying(5) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT instructor_service_areas_zip_format_check CHECK (zip_code ~ '^\d{5}$'),
    CONSTRAINT instructor_service_areas_instructor_id_zip_code_key UNIQUE (instructor_id, zip_code)
);

ALTER TABLE public.instructor_service_areas
    ADD CONSTRAINT instructor_service_areas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.instructor_service_areas
    ADD CONSTRAINT instructor_service_areas_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;

CREATE INDEX idx_instructor_service_areas_instructor ON public.instructor_service_areas (instructor_id);
CREATE INDEX idx_instructor_service_areas_tenant ON public.instructor_service_areas (tenant_id);
-- Batched membership lookup for findRankedAvailableSlots: "for this set of
-- candidate instructor ids, which zips does each serve."
CREATE INDEX idx_instructor_service_areas_zip ON public.instructor_service_areas (zip_code);
