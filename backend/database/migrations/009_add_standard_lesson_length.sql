-- Standard lesson length, in minutes, used only to convert a minor's
-- required hours into an equivalent lesson count for display
-- (lessonsRequired = ceil(hoursRequired * 60 / standard_lesson_length_minutes)).
-- Deliberately a separate column from scheduling_settings.default_lesson_duration,
-- which drives the booking form's default duration - different table, different
-- purpose. The two may be set to different values without being a bug.

ALTER TABLE public.tenant_settings
    ADD COLUMN standard_lesson_length_minutes integer DEFAULT 120;
