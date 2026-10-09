-- Real-time Google Calendar sync for instructors (additive - the existing
-- ICS feed subscription via instructors.calendar_feed_token is completely
-- unaffected and stays the zero-setup fallback for anyone who doesn't
-- connect Google). An instructor connects their own Google account from
-- My Profile; this app creates a dedicated "Driving Lessons" calendar in
-- their account and writes lesson events into it directly, rather than
-- relying on a client to poll a subscribed feed URL.
--
-- Two tenant-scoped tables, built fresh rather than reusing the dormant
-- instructor_calendar_auth/lesson_calendar_events tables already present
-- in the baseline schema (both are zero-reference scaffolding from before
-- this app's current conventions existed) - those two store OAuth tokens
-- in PLAINTEXT and have NO tenant_id column at all, both of which
-- directly contradict this feature's requirements (real encryption at
-- rest, every table tenant-scoped from row one like everywhere else in
-- this schema). They are left untouched here; flagged in
-- docs/ARCHITECTURE.md as pre-existing dead scaffolding for a future,
-- separate cleanup decision - not something to retrofit or reuse.
--
-- google_calendar_connections: one row per instructor (at most one
-- connected Google account each). Tokens are stored encrypted
-- (backend/src/utils/encryption.ts, AES-256-GCM) - access_token and
-- refresh_token columns hold ciphertext, never plaintext. google_calendar_id
-- is the dedicated calendar's id, created once on first connect, so every
-- subsequent write targets the right calendar without having to look it
-- up or re-derive it. last_sync_error/last_sync_at back the "last sync
-- failed" indicator and the reconnect-required state on My Profile.
--
-- google_calendar_events: a CONVENIENCE lesson -> Google-event-id mapping
-- only, never a correctness dependency - the Google event id itself is
-- derived deterministically from the lesson's own UUID (dashes stripped;
-- see googleCalendarService.ts), so this table can be absent, stale, or
-- lost without ever producing a duplicate event. It exists purely for
-- fast per-lesson "has this synced, and when" lookups.

CREATE TABLE google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL UNIQUE REFERENCES instructors(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  access_token_expires_at timestamp without time zone NOT NULL,
  last_sync_at timestamp without time zone,
  last_sync_error text,
  connected_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_google_calendar_connections_tenant ON google_calendar_connections(tenant_id);

CREATE TABLE google_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  last_synced_at timestamp without time zone NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, instructor_id)
);

CREATE INDEX idx_google_calendar_events_tenant ON google_calendar_events(tenant_id);
CREATE INDEX idx_google_calendar_events_lesson ON google_calendar_events(lesson_id);
