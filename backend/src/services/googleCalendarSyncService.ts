/**
 * Google Calendar Event Sync
 *
 * Pushes a single lesson's create/update/cancel into the instructor's own
 * dedicated "Driving Lessons" Google Calendar (see googleCalendarService.ts
 * for connection management). One-directional: this app is always the
 * source of truth, and overwrites the Google event unconditionally on
 * every sync - a manual edit made directly in Google Calendar is silently
 * lost on the next sync. Never blocks or fails a lesson write: every
 * export here is designed to be called fire-and-forget (not awaited) from
 * lessonService.ts, and every failure is caught, logged, and recorded on
 * google_calendar_connections.last_sync_error.
 *
 * Deterministic event ids: derived directly from the lesson's own UUID
 * (dashes stripped -> 32 lowercase hex characters). UUID hex digits
 * (0-9, a-f) are a strict subset of Google's accepted event-id charset
 * (base32hex, lowercase a-v and 0-9), so this is always valid with no
 * transformation needed. This makes "the Google event for lesson X"
 * derivable from lesson.id alone, with no DB lookup required -
 * google_calendar_events (below) is a pure convenience mapping for the
 * UI/debugging, never a correctness dependency.
 */

import { query } from '../config/database';
import { calendar as googleCalendar, calendar_v3 } from '@googleapis/calendar';
import {
  getLessonForCalendarEvent,
  buildLessonEventContent,
  CalendarLessonRow,
} from './calendarFeedService';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone } from '../utils/tenantTime';
import { createLogger } from '../utils/logger';
import * as googleCalendarService from './googleCalendarService';
import { GOOGLE_API_TIMEOUT_MS } from './googleCalendarService';

const logger = createLogger('GoogleCalendarSyncService');

/** Derives the deterministic Google event id for a lesson - see file doc above. */
export const deriveGoogleEventId = (lessonId: string): string => lessonId.replace(/-/g, '');

function toGoogleEventResource(content: ReturnType<typeof buildLessonEventContent>): calendar_v3.Schema$Event {
  return {
    summary: content.summary,
    description: content.description,
    location: content.location,
    start: { dateTime: content.startInstant.toISOString() },
    end: { dateTime: content.endInstant.toISOString() },
    status: content.isCancelled ? 'cancelled' : 'confirmed',
  };
}

function isHttpStatus(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === status;
}

async function recordSyncOutcome(instructorId: string, tenantId: string, error: string | null): Promise<void> {
  await query(
    `UPDATE google_calendar_connections SET last_sync_at = NOW(), last_sync_error = $1, updated_at = NOW()
     WHERE instructor_id = $2 AND tenant_id = $3`,
    [error, instructorId, tenantId]
  );
}

async function upsertEventMapping(
  tenantId: string,
  lessonId: string,
  instructorId: string,
  googleEventId: string
): Promise<void> {
  await query(
    `INSERT INTO google_calendar_events (tenant_id, lesson_id, instructor_id, google_event_id, last_synced_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (lesson_id, instructor_id)
     DO UPDATE SET google_event_id = $4, last_synced_at = NOW()`,
    [tenantId, lessonId, instructorId, googleEventId]
  );
}

/**
 * Syncs a single lesson to its instructor's Google Calendar: no-ops
 * silently if the instructor hasn't connected Google. Treats a 409 on
 * insert as "the event already exists" and falls through to update -
 * this covers both a retried sync and an A->B->A instructor reassignment
 * landing back on a previously-deleted (soft-deleted/"tombstoned" for
 * ~30 days by Google) event id, where the update must explicitly set
 * status: 'confirmed' to undo the tombstone, not just update content
 * fields (content-only fields would be silently ignored on a
 * cancelled/tombstoned event otherwise).
 *
 * Designed to be called without awaiting on the request path - every
 * Google API call below carries GOOGLE_API_TIMEOUT_MS, so a hanging
 * connection fails fast into the catch block rather than hanging
 * indefinitely.
 */
export async function syncLessonToGoogle(lessonId: string, instructorId: string, tenantId: string): Promise<void> {
  try {
    const connection = await googleCalendarService.getConnectionRow(instructorId, tenantId);
    if (!connection) {
      return; // instructor hasn't connected Google - nothing to do
    }

    const lesson = await getLessonForCalendarEvent(lessonId, tenantId);
    if (!lesson) {
      logger.warn('Lesson not found for Google Calendar sync', { tenantId, instructorId, lessonId });
      return;
    }

    const tenantSettings = await getTenantSettings(tenantId);
    const timezone = resolveTenantTimezone(tenantSettings?.timezone);
    const content = buildLessonEventContent(lesson as CalendarLessonRow, timezone);
    const eventResource = toGoogleEventResource(content);
    const eventId = deriveGoogleEventId(lessonId);

    const client = await googleCalendarService.getAuthenticatedClient(connection);
    const cal = googleCalendar({ version: 'v3', auth: client });

    try {
      await cal.events.insert(
        { calendarId: connection.googleCalendarId, requestBody: { id: eventId, ...eventResource } },
        { timeout: GOOGLE_API_TIMEOUT_MS }
      );
    } catch (insertError) {
      if (!isHttpStatus(insertError, 409)) {
        throw insertError;
      }
      // Already exists (retried sync, or reviving a tombstoned event from
      // an A->B->A reassignment) - update must explicitly set status:
      // 'confirmed' to undo a prior cancellation/tombstone.
      await cal.events.update(
        { calendarId: connection.googleCalendarId, eventId, requestBody: eventResource },
        { timeout: GOOGLE_API_TIMEOUT_MS }
      );
    }

    await upsertEventMapping(tenantId, lessonId, instructorId, eventId);
    await recordSyncOutcome(instructorId, tenantId, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Google Calendar lesson sync failed (non-blocking)', {
      tenantId,
      instructorId,
      lessonId,
      error: message,
    });
    try {
      await recordSyncOutcome(instructorId, tenantId, message);
    } catch (recordError) {
      logger.warn('Failed to record Google Calendar sync error (non-blocking)', {
        tenantId,
        instructorId,
        error: recordError instanceof Error ? recordError.message : 'Unknown error',
      });
    }
  }
}

/**
 * Removes a lesson's event from a SPECIFIC instructor's Google Calendar -
 * used only when a lesson is reassigned to a different instructor
 * (A -> B): the lesson is synced onto B's calendar via syncLessonToGoogle
 * as usual, but A's calendar would otherwise keep showing a lesson A no
 * longer teaches. Deletes (rather than just cancels) the event, since
 * Google's own events.delete is itself a soft delete/tombstone for ~30
 * days - the exact mechanism syncLessonToGoogle's 409-as-exists-update
 * handling already accounts for if this same lesson is ever reassigned
 * back to A (A->B->A).
 */
export async function removeLessonEventFromInstructorCalendar(
  lessonId: string,
  instructorId: string,
  tenantId: string
): Promise<void> {
  try {
    const connection = await googleCalendarService.getConnectionRow(instructorId, tenantId);
    if (!connection) {
      return;
    }

    const client = await googleCalendarService.getAuthenticatedClient(connection);
    const cal = googleCalendar({ version: 'v3', auth: client });
    const eventId = deriveGoogleEventId(lessonId);

    try {
      await cal.events.delete(
        { calendarId: connection.googleCalendarId, eventId },
        { timeout: GOOGLE_API_TIMEOUT_MS }
      );
    } catch (deleteError) {
      // Already gone (never existed, or already removed) - not an error
      // for this operation's purpose (make sure A's calendar doesn't show
      // this lesson).
      if (!isHttpStatus(deleteError, 404) && !isHttpStatus(deleteError, 410)) {
        throw deleteError;
      }
    }

    await query(
      `DELETE FROM google_calendar_events WHERE lesson_id = $1 AND instructor_id = $2 AND tenant_id = $3`,
      [lessonId, instructorId, tenantId]
    );
  } catch (error) {
    logger.warn('Failed to remove lesson event from previous instructor\'s Google Calendar (non-blocking)', {
      tenantId,
      instructorId,
      lessonId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Backfills every upcoming (today forward) scheduled lesson for an
 * instructor into their newly-connected Google Calendar - fired
 * non-blocking right after a successful OAuth connect, and exposed via
 * the "Resync now" button/route for on-demand re-sync. A failed
 * individual lesson here is only retried the next time that lesson
 * itself changes, or the next time this function is called again
 * (resync), never automatically in the background.
 */
export async function syncAllUpcomingLessonsForInstructor(instructorId: string, tenantId: string): Promise<void> {
  const result = await query(
    `SELECT id FROM lessons
     WHERE instructor_id = $1 AND tenant_id = $2 AND status = 'scheduled' AND date >= CURRENT_DATE
     ORDER BY date, start_time`,
    [instructorId, tenantId]
  );

  for (const row of result.rows) {
    await syncLessonToGoogle(row.id, instructorId, tenantId);
  }
}
