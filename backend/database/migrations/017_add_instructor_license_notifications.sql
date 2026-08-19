-- Dedup tracking for instructor Driving School Instructor License expiry
-- reminders: one row per (instructor, expiration date, threshold) that has
-- already been notified. The UNIQUE constraint below is the actual
-- enforcement mechanism (INSERT ... ON CONFLICT DO NOTHING), not just an
-- application-level check - even a concurrent or retried cron run can't
-- double-fire the same threshold.
--
-- threshold is a signed integer, days relative to expiry: 180/90/30/14/7
-- (pre-expiry reminders), 0 (on the expiry date itself), or a negative
-- multiple of 7 (-7, -14, -21, ...) for the post-expiry weekly escalation
-- cadence, continuing indefinitely until the instructor's license is
-- renewed. See instructorLicenseNotificationService.ts.
--
-- Including expiration_date in the unique key (not just instructor_id +
-- threshold) is what makes "updating the expiration resets the schedule"
-- work for free: a new expiration date has no matching rows yet, so every
-- threshold fires fresh against it, while old rows for a superseded date
-- are left in place (audit trail, matching this codebase's "never delete,
-- only supersede" pattern - e.g. fee_flags, student_guardians) but are
-- permanently irrelevant, since nothing ever queries by a stale date again.

CREATE TABLE public.instructor_license_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    instructor_id uuid NOT NULL,
    expiration_date date NOT NULL,
    threshold integer NOT NULL,
    notified_at timestamp without time zone DEFAULT now(),
    CONSTRAINT instructor_license_notifications_unique UNIQUE (instructor_id, expiration_date, threshold)
);

ALTER TABLE public.instructor_license_notifications
    ADD CONSTRAINT instructor_license_notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.instructor_license_notifications
    ADD CONSTRAINT instructor_license_notifications_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.instructors(id) ON DELETE CASCADE;

CREATE INDEX idx_instructor_license_notifications_instructor ON public.instructor_license_notifications (instructor_id, expiration_date);
CREATE INDEX idx_instructor_license_notifications_tenant ON public.instructor_license_notifications (tenant_id);

-- Widen notifications.type to add the new in-app alert type this feature
-- creates for admin/owner users. Append-only per convention: this widens an
-- existing CHECK constraint rather than editing a prior migration. Matches
-- the exact cast shape Postgres itself generated for the original
-- constraint (001_baseline.sql) - each array element individually cast to
-- character varying, then the whole array cast to text[].
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
    ((type)::text = ANY ((ARRAY[
        'lesson_reminder'::character varying, 'lesson_cancelled'::character varying,
        'lesson_rescheduled'::character varying, 'payment_received'::character varying,
        'payment_overdue'::character varying, 'certificate_issued'::character varying,
        'instructor_assigned'::character varying, 'time_off_approved'::character varying,
        'follow_up_due'::character varying, 'system'::character varying,
        'general'::character varying, 'license_expiring'::character varying
    ])::text[]))
);
