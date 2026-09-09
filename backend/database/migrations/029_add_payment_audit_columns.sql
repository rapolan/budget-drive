-- payments.created_by/updated_by were referenced unconditionally by
-- paymentService.createPayment/updatePayment (INSERT/UPDATE column
-- lists), matching the created_by/updated_by uuid pattern every other
-- audited table (students, lessons, etc.) already has - but no migration
-- ever added these two columns to payments. Every POST /payments has
-- been hitting a hard Postgres error (42703 undefined_column) since the
-- feature was built; the 27 payment rows in the dev seed data were
-- inserted directly by database/seeds/001_budget_driving_school.sql,
-- bypassing this codepath entirely, which is how the bug went unnoticed.
ALTER TABLE public.payments ADD COLUMN created_by uuid;
ALTER TABLE public.payments ADD COLUMN updated_by uuid;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;
