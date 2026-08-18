-- No-show / late-cancellation fee flags (Constraint A: a flag on the
-- student recording amount and reason - never a payment record, never
-- revenue). Modeled on student_guardians' FK/index/tenant-scoping shape.
-- Deliberately NOT referenced by, or joined into, any revenue/earnings
-- query (instructorService.getInstructorEarnings, Payments.tsx's totals) -
-- that isolation is structural, not enforced by application code.
--
-- status: one enum column plus nullable resolution-detail columns for
-- however a flag got resolved, mirroring students.completed/completed_at/
-- completed_by's existing shape.
-- 'outstanding' -> 'cleared' (student's next lesson completed, all
-- outstanding flags clear at once) | 'waived' (staff judgment call, with
-- attribution) | 'paid' (school-payee only - converted into a real payment
-- record via the existing payment-creation path, row kept for audit).

CREATE TABLE public.fee_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    student_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'outstanding',
    waived_by uuid,
    waived_reason text,
    waived_at timestamp without time zone,
    paid_payment_id uuid,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT fee_flags_status_check CHECK (status IN ('outstanding','cleared','waived','paid'))
);

ALTER TABLE public.fee_flags
    ADD CONSTRAINT fee_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.fee_flags
    ADD CONSTRAINT fee_flags_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE public.fee_flags
    ADD CONSTRAINT fee_flags_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
ALTER TABLE public.fee_flags
    ADD CONSTRAINT fee_flags_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.fee_flags
    ADD CONSTRAINT fee_flags_paid_payment_id_fkey FOREIGN KEY (paid_payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX idx_fee_flags_student ON public.fee_flags (student_id);
CREATE INDEX idx_fee_flags_tenant ON public.fee_flags (tenant_id);

-- Hot-path lookup: "does this student owe anything right now."
CREATE INDEX idx_fee_flags_outstanding_by_student
    ON public.fee_flags (student_id) WHERE (status = 'outstanding');
