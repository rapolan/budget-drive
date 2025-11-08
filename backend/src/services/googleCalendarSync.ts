/**
 * Google Calendar Sync Service
 * Handles two-way synchronization between lessons and Google Calendar
 */

import { pool } from '../config/database';
import { googleCalendarAuthService } from './googleCalendarAuth';

export class GoogleCalendarSyncService {
  /**
   * Sync lessons to Google Calendar
   */
  async syncToGoogle(instructorId: string, tenantId: string): Promise<any> {
    const calendar = await googleCalendarAuthService.getCalendarClient(instructorId);
    const credentials = await googleCalendarAuthService.getCredentials(instructorId);

    // Get unsynced lessons
    const lessonsResult = await pool.query(
      `SELECT l.*, s.full_name as student_name
       FROM lessons l
       JOIN students s ON l.student_id = s.id
       WHERE l.instructor_id = $1
       AND l.tenant_id = $2
       AND (l.calendar_sync_status = 'not_synced' OR l.calendar_sync_status IS NULL)
       AND l.status = 'scheduled'
       AND l.date >= CURRENT_DATE
       LIMIT 50`,
      [instructorId, tenantId]
    );

    let created = 0;

    for (const lesson of lessonsResult.rows) {
      try {
        const event = {
          summary: `Driving Lesson - ${lesson.student_name}`,
          description: `Lesson Type: ${lesson.lesson_type}\nDuration: ${lesson.duration} minutes`,
          start: {
            dateTime: `${lesson.date.toISOString().split('T')[0]}T${lesson.start_time}`,
            timeZone: 'America/New_York',
          },
          end: {
            dateTime: `${lesson.date.toISOString().split('T')[0]}T${lesson.end_time}`,
            timeZone: 'America/New_York',
          },
        };

        const response = await calendar.events.insert({
          calendarId: credentials.google_calendar_id,
          requestBody: event,
        });

        // Save mapping
        await pool.query(
          `INSERT INTO calendar_event_mappings
           (tenant_id, lesson_id, instructor_id, google_event_id, google_calendar_id,
            event_title, event_start, event_end, sync_status, sync_direction)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'synced', 'to_google')`,
          [
            tenantId,
            lesson.id,
            instructorId,
            response.data.id,
            credentials.google_calendar_id,
            event.summary,
            event.start.dateTime,
            event.end.dateTime,
          ]
        );

        // Update lesson
        await pool.query(
          `UPDATE lessons
           SET google_calendar_event_id = $1, calendar_sync_status = 'synced'
           WHERE id = $2`,
          [response.data.id, lesson.id]
        );

        created++;
      } catch (error) {
        console.error(`Failed to sync lesson ${lesson.id}:`, error);
      }
    }

    return { eventsCreated: created };
  }

  /**
   * Sync from Google Calendar (fetch external events)
   */
  async syncFromGoogle(instructorId: string, tenantId: string): Promise<any> {
    const calendar = await googleCalendarAuthService.getCalendarClient(instructorId);
    const credentials = await googleCalendarAuthService.getCredentials(instructorId);

    const now = new Date();
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const response = await calendar.events.list({
      calendarId: credentials.google_calendar_id,
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    let fetched = 0;

    for (const event of events) {
      // Skip our own events
      const isOurEvent = await pool.query(
        'SELECT id FROM calendar_event_mappings WHERE google_event_id = $1',
        [event.id]
      );

      if (isOurEvent.rows.length > 0) continue;

      // Store external event
      try {
        await pool.query(
          `INSERT INTO external_calendar_events
           (tenant_id, instructor_id, google_event_id, google_calendar_id,
            event_title, event_start, event_end, event_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (google_calendar_id, google_event_id) DO UPDATE
           SET event_title = $5, event_start = $6, event_end = $7, event_status = $8,
               last_fetched_at = CURRENT_TIMESTAMP`,
          [
            tenantId,
            instructorId,
            event.id,
            credentials.google_calendar_id,
            event.summary || 'No title',
            event.start?.dateTime || event.start?.date,
            event.end?.dateTime || event.end?.date,
            event.status || 'confirmed',
          ]
        );

        fetched++;
      } catch (error) {
        console.error(`Failed to store external event ${event.id}:`, error);
      }
    }

    return { externalEventsFetched: fetched };
  }

  /**
   * Full two-way sync
   */
  async performFullSync(instructorId: string, tenantId: string): Promise<any> {
    const startTime = Date.now();

    try {
      const toGoogleResult = await this.syncToGoogle(instructorId, tenantId);
      const fromGoogleResult = await this.syncFromGoogle(instructorId, tenantId);

      const durationMs = Date.now() - startTime;

      // Log sync
      await pool.query(
        `INSERT INTO calendar_sync_logs
         (tenant_id, instructor_id, sync_type, sync_direction, status,
          events_synced, events_created, duration_ms, started_at, completed_at)
         VALUES ($1, $2, 'manual', 'two_way', 'success', $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          tenantId,
          instructorId,
          toGoogleResult.eventsCreated + fromGoogleResult.externalEventsFetched,
          toGoogleResult.eventsCreated,
          durationMs,
          new Date(startTime),
        ]
      );

      // Update credentials
      await pool.query(
        `UPDATE instructor_calendar_credentials
         SET last_sync_at = CURRENT_TIMESTAMP, last_sync_status = 'success'
         WHERE instructor_id = $1`,
        [instructorId]
      );

      return {
        success: true,
        toGoogle: toGoogleResult,
        fromGoogle: fromGoogleResult,
        durationMs,
      };
    } catch (error: any) {
      // Log failure
      await pool.query(
        `INSERT INTO calendar_sync_logs
         (tenant_id, instructor_id, sync_type, sync_direction, status,
          error_message, started_at, completed_at)
         VALUES ($1, $2, 'manual', 'two_way', 'failed', $3, $4, CURRENT_TIMESTAMP)`,
        [tenantId, instructorId, error.message, new Date(startTime)]
      );

      throw error;
    }
  }
}

export const googleCalendarSyncService = new GoogleCalendarSyncService();
