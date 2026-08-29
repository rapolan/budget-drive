-- Phase 1 of the compliance-records arc (docs/compliance-records-build-plan.md):
-- the DMV-issued driving school license number. Nullable text, matching
-- the existing tenant_settings school-identity pattern (e.g. support_phone,
-- address_line1) - not every tenant has one on file yet, and nothing
-- requires it at this phase. Downstream phases (certificate content, the
-- archive hash) will read this column once it exists; this phase only
-- stores and edits it.

ALTER TABLE public.tenant_settings
    ADD COLUMN license_number character varying(50);
