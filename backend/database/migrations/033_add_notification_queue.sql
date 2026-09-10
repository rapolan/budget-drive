-- notification_queue was referenced by lessonService.ts (5 INSERT sites on
-- every lesson booking: booking confirmation + 24h/1h reminders, student
-- and instructor; 2 more on cancellation; 1 UPDATE cancelling pending
-- reminders) and by routes/notifications.ts / notificationProcessor.ts
-- (GET /notification-history, GET /notifications/queue, the manual
-- process/retry endpoints) but no migration ever created it - every
-- booking's INSERT silently no-op'd (wrapped in try/catch, logged as a
-- non-blocking warn) and the notification-history page hard-500'd on
-- every visit. Column set derived from every actual INSERT/SELECT/UPDATE
-- across lessonService.ts, routes/notifications.ts, and
-- notificationProcessor.ts - not a guessed minimal schema.
--
-- Modeled on fee_flags' shape (a lesson-scoped, tenant-scoped table with
-- a status enum plus attempt/resolution tracking).
--
-- Note: notificationProcessor.ts's getPendingNotifications() queries
-- scheduled_for/retry_count column names that don't match what's
-- actually written here (scheduled_send_time/attempt_count) - that
-- mismatch is inside the automatic-sending path (the cron that calls
-- processQueue(), itself confirmed separately dead/unwired) and is left
-- alone here; this migration only restores the table shape that the live,
-- reachable write (booking) and read (notification-history) paths need.

CREATE TABLE public.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    notification_type text NOT NULL,
    recipient_email text NOT NULL,
    recipient_type text NOT NULL,
    scheduled_send_time timestamp without time zone NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    sent_at timestamp without time zone,
    attempt_count integer NOT NULL DEFAULT 0,
    last_attempt_at timestamp without time zone,
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT notification_queue_notification_type_check
        CHECK (notification_type IN ('booking_confirmation', 'reminder_24h', 'reminder_1h', 'cancellation')),
    CONSTRAINT notification_queue_recipient_type_check
        CHECK (recipient_type IN ('student', 'instructor')),
    CONSTRAINT notification_queue_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'))
);

ALTER TABLE public.notification_queue
    ADD CONSTRAINT notification_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notification_queue
    ADD CONSTRAINT notification_queue_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

CREATE INDEX idx_notification_queue_tenant ON public.notification_queue (tenant_id);
CREATE INDEX idx_notification_queue_lesson ON public.notification_queue (lesson_id);

-- Hot-path lookups: notificationProcessor's own pending-scan (once wired)
-- and the cancellation UPDATE (lessonService.cancelLesson) both filter on
-- lesson_id + status = 'pending'.
CREATE INDEX idx_notification_queue_pending_by_lesson
    ON public.notification_queue (lesson_id) WHERE (status = 'pending');
