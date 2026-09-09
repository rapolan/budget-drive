-- Driver Education has had no pricing concept at all: no default cost,
-- no per-enrollment cost field populated, and payments could not even be
-- recorded against a DE-only student (paymentService.createPayment
-- requires an active driver_training enrollment). This adds the tenant-
-- configurable default half of that - one flat course fee per DE
-- enrollment, billed at enrollment (not per class day, unlike BTW's
-- per-lesson pricing). Classroom and online get separate defaults since
-- they're different offerings with different real-world costs. $150.00
-- is a placeholder in both cases - editable per tenant in Settings,
-- exactly like default_lesson_cost - so the exact figure doesn't block
-- this work. Mirrors default_lesson_cost's NOT NULL DEFAULT / numeric(10,2)
-- shape exactly.
ALTER TABLE public.tenant_settings
    ADD COLUMN default_de_classroom_cost numeric(10,2) NOT NULL DEFAULT 150.00;
ALTER TABLE public.tenant_settings
    ADD COLUMN default_de_online_cost numeric(10,2) NOT NULL DEFAULT 150.00;
