-- Phase 4 of docs/compliance-records-build-plan.md: the Archive. A
-- soft, reversible flag on students - completed records recede from the
-- daily working views (the Students list, its filter counts) while
-- staying fully retained, searchable by name via GET /search/people (no
-- exclusion filter added there - see ARCHITECTURE.md), and retrievable in
-- full via GET /students/:id (also unfiltered). Never deletion; §11108
-- requires retention.
--
-- Grain is the student, not the enrollment - the Students list is
-- student-grain, and a person can hold a completed BTW enrollment and a
-- completed DE enrollment at once (sequential DE->BTW is the normal
-- path). One seal per person, computed over every enrollment they have.
ALTER TABLE public.students ADD COLUMN archived_at timestamp without time zone;
ALTER TABLE public.students ADD COLUMN archived_by uuid;
ALTER TABLE public.students
  ADD CONSTRAINT students_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- No-PII SHA-256 seal over the record's provable facts (IDs, dates,
-- hours, cert serials, school license number) - same forward-compat
-- posture as enrollments.completion_hash/certificates.completion_hash
-- (docs/BLOCKCHAIN.md): computed and stored by ordinary application code,
-- ledger_txid written nowhere yet, no blockchain imports. Left in place
-- across a restore (a historical "this was sealed once" fact); overwritten
-- with a NEW hash (and ledger_txid reset to NULL) if the student
-- re-completes and is re-archived later.
ALTER TABLE public.students ADD COLUMN archive_hash text;
ALTER TABLE public.students ADD COLUMN archive_ledger_txid varchar(255);

-- Manual "hold active" override - a known returner the admin doesn't want
-- surfaced on the archive-eligibility worklist. Deliberately a permanent
-- flag with NO auto-expiry (a hold is deliberate human knowledge; silently
-- overriding it on a timer is the same silent-automatic-behavior class
-- this app avoids elsewhere) - stays held until explicitly cleared, kept
-- visible via a dedicated "Held" review list rather than a timed sweep.
ALTER TABLE public.students ADD COLUMN archive_held boolean NOT NULL DEFAULT false;
ALTER TABLE public.students ADD COLUMN archive_hold_reason text;
ALTER TABLE public.students ADD COLUMN archive_held_at timestamp without time zone;
ALTER TABLE public.students ADD COLUMN archive_held_by uuid;
ALTER TABLE public.students
  ADD CONSTRAINT students_archive_held_by_fkey FOREIGN KEY (archive_held_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_students_archived_at ON public.students (tenant_id, archived_at);
CREATE INDEX idx_students_archive_held ON public.students (tenant_id, archive_held) WHERE archive_held = true;

-- BTW's archive trigger is permit-expiration-first, falling back to a
-- time-since-last-activity grace period only when no permit is on file
-- (e.g. an adult). Tenant-configurable rather than hardcoded - a
-- low-stakes, fully reversible threshold (restore is one click) a pilot
-- school should be able to tune from real behavior without a code change,
-- mirroring de_discount_amount/default_de_hours_required's own precedent.
ALTER TABLE public.tenant_settings ADD COLUMN archive_inactivity_grace_days integer NOT NULL DEFAULT 90;
