-- Tenant-configurable lesson review and cancellation-fee policy. Discrete
-- typed columns (not settings jsonb), matching the existing tenant_settings
-- pattern (e.g. 012's max_lessons_per_student_per_day): plain text for the
-- two enum-shaped fields (no CHECK constraint - the existing precedent, e.g.
-- country/dateFormat, is TS-union-typed only, validated at the service
-- layer), NOT NULL with a DEFAULT so every existing tenant has a concrete
-- value immediately.
--
-- lesson_completion_mode: 'manual' (only mode implemented this session) or
-- 'auto' - the stored value for a future auto-completion job that does not
-- exist yet; selecting 'auto' today only changes this setting, nothing reads
-- it yet.
-- cancellation_fee_amount / cancellation_fee_window_hours: the fee charged
-- and how many hours before a lesson's start a cancellation still counts as
-- "late".
-- cancellation_fee_payee: 'instructor' (default - the instructor collects
-- the fee in cash, it never reaches the business/school ledger) or 'school'.

ALTER TABLE public.tenant_settings
    ADD COLUMN lesson_completion_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE public.tenant_settings
    ADD COLUMN cancellation_fee_amount numeric(10,2) NOT NULL DEFAULT 50;
ALTER TABLE public.tenant_settings
    ADD COLUMN cancellation_fee_window_hours integer NOT NULL DEFAULT 24;
ALTER TABLE public.tenant_settings
    ADD COLUMN cancellation_fee_payee text NOT NULL DEFAULT 'instructor';
