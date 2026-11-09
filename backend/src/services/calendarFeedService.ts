/**
 * Calendar Feed Service
 * Generates ICS/iCal feeds for instructors
 * 
 * This provides a universal calendar subscription that works with:
 * - Google Calendar
 * - Apple Calendar
 * - Microsoft Outlook
 * - Any calendar app that supports iCal/ICS
 */

import { query } from '../config/database';
import crypto from 'crypto';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone, zonedWallClockToUtc } from '../utils/tenantTime';

/**
 * Generate a unique, secure feed token for an instructor
 */
export const generateFeedToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Get or create a feed token for an instructor
 */
export const getOrCreateFeedToken = async (
  instructorId: string,
  tenantId: string
): Promise<string> => {
  // Check if token exists
  const existing = await query(
    `SELECT calendar_feed_token FROM instructors 
     WHERE id = $1 AND tenant_id = $2`,
    [instructorId, tenantId]
  );

  if (existing.rows[0]?.calendar_feed_token) {
    return existing.rows[0].calendar_feed_token;
  }

  // Generate new token
  const token = generateFeedToken();
  
  await query(
    `UPDATE instructors 
     SET calendar_feed_token = $1 
     WHERE id = $2 AND tenant_id = $3`,
    [token, instructorId, tenantId]
  );

  return token;
};

/**
 * Get feed token for an instructor (without creating one)
 */
export const getFeedToken = async (
  instructorId: string,
  tenantId: string
): Promise<string | null> => {
  const result = await query(
    `SELECT calendar_feed_token FROM instructors 
     WHERE id = $1 AND tenant_id = $2`,
    [instructorId, tenantId]
  );

  return result.rows[0]?.calendar_feed_token || null;
};

/**
 * Get instructor by feed token (for public feed access)
 */
export const getInstructorByFeedToken = async (
  token: string
): Promise<{ id: string; tenantId: string; fullName: string } | null> => {
  const result = await query(
    `SELECT id, tenant_id, full_name 
     FROM instructors 
     WHERE calendar_feed_token = $1`,
    [token]
  );

  if (result.rows.length === 0) return null;

  return {
    id: result.rows[0].id,
    tenantId: result.rows[0].tenant_id,
    fullName: result.rows[0].full_name,
  };
};

/**
 * Regenerate feed token (invalidates old subscriptions)
 */
export const regenerateFeedToken = async (
  instructorId: string,
  tenantId: string
): Promise<string> => {
  const token = generateFeedToken();
  
  await query(
    `UPDATE instructors 
     SET calendar_feed_token = $1 
     WHERE id = $2 AND tenant_id = $3`,
    [token, instructorId, tenantId]
  );

  return token;
};

/**
 * Escape special characters for ICS format
 */
const escapeICS = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
};

/**
 * Format date for ICS (YYYYMMDDTHHMMSS)
 */
const formatICSDate = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};

/**
 * The raw per-lesson row shape both generateICSFeed's batch query and
 * buildLessonEventContent's single-lesson query (googleCalendarSyncService.ts)
 * produce - kept as snake_case/raw pg types since this is an internal,
 * not-camelCased shape consumed only by these two calendar-content builders.
 */
export interface CalendarLessonRow {
  id: string;
  date: Date | string;
  start_time: string;
  end_time: string;
  lesson_type: string;
  status: string;
  pickup_address: string | null;
  notes: string | null;
  duration: number;
  lesson_number: number | null;
  student_name: string;
  student_phone: string | null;
  parent_phone: string | null;
  hours_required: string | null;
}

export interface LessonEventContent {
  summary: string;
  description: string;
  location: string;
  startInstant: Date;
  endInstant: Date;
  isCancelled: boolean;
}

/**
 * Builds the title/description/location/instant content for a single
 * lesson's calendar event - the exact same content the ICS feed emits
 * for this lesson (student name, tenant-timezone date/time, pickup
 * address, notes, lesson type), extracted here so the Google Calendar
 * sync write path (googleCalendarSyncService.ts) and this file's own ICS
 * generation stay byte-identical in substance, with each caller applying
 * its own format-specific escaping/encoding on top (ICS text-escaping
 * here, Google API JSON string fields there - neither escaping style
 * belongs in this shared builder).
 */
export const buildLessonEventContent = (lesson: CalendarLessonRow, timezone: string): LessonEventContent => {
  // lesson.date is a plain DATE column (no time component) - a Date
  // instance from pg is always UTC midnight of that calendar date, so this
  // split is safe (no wall-clock roll risk). start_time/end_time are
  // already tenant wall-clock strings, stored directly by lessonService -
  // zonedWallClockToUtc converts the pair to the correct UTC instant.
  const dateStr = lesson.date instanceof Date
    ? lesson.date.toISOString().split('T')[0]
    : String(lesson.date).split('T')[0];
  const startInstant = zonedWallClockToUtc(dateStr, lesson.start_time.slice(0, 5), timezone);
  const endInstant = zonedWallClockToUtc(dateStr, lesson.end_time.slice(0, 5), timezone);

  const descParts: string[] = [];

  if (lesson.student_phone) {
    descParts.push(`Student Phone: ${lesson.student_phone}`);
  }
  if (lesson.parent_phone) {
    descParts.push(`Parent/Guardian: ${lesson.parent_phone}`);
  }

  // Lesson progress - this is an *estimate* for the description's
  // numbering copy, not the student's real progress. See
  // studentProgressService.computeStudentProgress for the single source
  // of truth on actual progress.
  if (lesson.lesson_number) {
    const hoursRequired = parseFloat(lesson.hours_required || '6');
    // Under-18 minimum is 3 lessons; use hours_required / 2hr lessons as estimate
    const estimatedTotal = Math.max(3, Math.ceil(hoursRequired / 2));
    descParts.push('');
    descParts.push(`Lesson #${lesson.lesson_number} of ${estimatedTotal}`);
  }

  descParts.push(`Type: ${lesson.lesson_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`);

  const durationHours = Math.floor(lesson.duration / 60);
  const durationMins = lesson.duration % 60;
  const durationStr = durationHours > 0
    ? durationMins > 0 ? `${durationHours}h ${durationMins}m` : `${durationHours} hour${durationHours > 1 ? 's' : ''}`
    : `${durationMins} min`;
  descParts.push(`Duration: ${durationStr}`);

  if (lesson.notes) {
    descParts.push('');
    descParts.push(`Notes: ${lesson.notes}`);
  }

  return {
    summary: `🚗 ${lesson.student_name}`,
    description: descParts.join('\n'),
    location: lesson.pickup_address || '',
    startInstant,
    endInstant,
    isCancelled: lesson.status === 'cancelled',
  };
};

/**
 * Fetches a single lesson in the same shape buildLessonEventContent
 * expects, for the Google Calendar sync write path (one lesson at a time,
 * triggered by a create/update/complete/no-show/cancel), as opposed to
 * generateICSFeed's own batch query below (the whole feed at once).
 */
export const getLessonForCalendarEvent = async (
  lessonId: string,
  tenantId: string
): Promise<CalendarLessonRow | null> => {
  const result = await query(
    `SELECT
      l.id,
      l.date,
      l.start_time,
      l.end_time,
      l.lesson_type,
      l.status,
      l.pickup_address,
      l.notes,
      l.duration,
      l.lesson_number,
      s.full_name as student_name,
      s.phone as student_phone,
      s.emergency_contact_phone as parent_phone,
      e.hours_required
     FROM lessons l
     JOIN enrollments e ON l.enrollment_id = e.id
     JOIN students s ON e.student_id = s.id
     WHERE l.id = $1 AND l.tenant_id = $2`,
    [lessonId, tenantId]
  );

  return result.rows.length > 0 ? (result.rows[0] as CalendarLessonRow) : null;
};

/**
 * Generate ICS calendar feed for an instructor
 */
export const generateICSFeed = async (
  instructorId: string,
  tenantId: string
): Promise<string> => {
  // Get instructor info
  const instructorResult = await query(
    `SELECT full_name FROM instructors WHERE id = $1 AND tenant_id = $2`,
    [instructorId, tenantId]
  );

  const instructorName = instructorResult.rows[0]?.full_name || 'Instructor';

  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);

  // Get upcoming lessons for this instructor, including student contact info.
  // 'cancelled' is included deliberately (see the STATUS:CANCELLED emission
  // below) - excluding it here would silently drop the row from the feed
  // instead of telling the subscribed calendar client to remove it, which
  // some clients (notably ones that cache aggressively) leave behind as a
  // "ghost" event. 'no_show' stays visible as a normal event: the
  // instructor was actually there and that time was spent/blocked
  // regardless of whether the student showed, so the calendar should keep
  // reflecting that reality - only 'cancelled' emits STATUS:CANCELLED.
  const lessonsResult = await query(
    `SELECT
      l.id,
      l.date,
      l.start_time,
      l.end_time,
      l.lesson_type,
      l.status,
      l.pickup_address,
      l.notes,
      l.duration,
      l.lesson_number,
      s.full_name as student_name,
      s.phone as student_phone,
      s.emergency_contact_phone as parent_phone,
      e.hours_required
     FROM lessons l
     JOIN enrollments e ON l.enrollment_id = e.id
     JOIN students s ON e.student_id = s.id
     WHERE l.instructor_id = $1
     AND l.tenant_id = $2
     AND l.status IN ('scheduled', 'completed', 'cancelled', 'no_show')
     AND l.date >= CURRENT_DATE - INTERVAL '7 days'
     ORDER BY l.date, l.start_time`,
    [instructorId, tenantId]
  );

  // Build ICS content. DTSTART/DTEND are emitted as UTC instants (Z suffix,
  // computed via the tenant-timezone helper module) rather than a
  // hardcoded `TZID=America/Los_Angeles` + hand-rolled VTIMEZONE block with
  // Pacific Time's specific DST rules baked in - see lessonInviteService's
  // generateICSContent for the same fix and its rationale (a UTC DTSTART is
  // RFC-5545-legal and every mainstream calendar client renders it in the
  // viewer's own local time, without needing us to re-derive tzdata for
  // 400+ possible zones). X-WR-TIMEZONE is purely informational (a label
  // some clients show), so it's set to the tenant's real zone.
  // Refresh hints: a subscription feed is pull-only - the client decides
  // when to re-poll, and with no hint Google in particular may only poll
  // once a day, so a cancellation could sit stale on the instructor's
  // calendar until tomorrow. X-PUBLISHED-TTL (the de facto standard,
  // originated by Apple/iCal, widely honored) and REFRESH-INTERVAL (the
  // newer RFC 7986 equivalent) both say "please re-check within an hour" -
  // emitting both maximizes client support. This is still only a hint:
  // exact timing is up to the client, so "prompt" here means observed
  // within roughly an hour for clients that honor it, not instant.
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Budget Driving School//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(instructorName)}'s Driving Lessons`,
    `X-WR-TIMEZONE:${timezone}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  // Add each lesson as an event - content (title/description/location/
  // instants) comes from the shared buildLessonEventContent builder above,
  // so this stays byte-identical to what the Google Calendar sync write
  // path pushes for the same lesson; only ICS-specific escaping/UID/
  // STATUS formatting happens here.
  for (const lesson of lessonsResult.rows as CalendarLessonRow[]) {
    const content = buildLessonEventContent(lesson, timezone);

    // The SAME uid is kept for a cancelled lesson (not omitted, not a new
    // id) - this is what lets a subscribed client match the existing event
    // on its calendar and remove it, rather than just never seeing a new
    // one appear. no_show gets CONFIRMED like a normal lesson (see the
    // query comment above).
    const uid = `lesson-${lesson.id}@budgetdrivingschool.com`;
    const status = content.isCancelled ? 'CANCELLED' : 'CONFIRMED';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(content.startInstant)}`,
      `DTEND:${formatICSDate(content.endInstant)}`,
      `SUMMARY:${escapeICS(content.summary)}`,
      `DESCRIPTION:${escapeICS(content.description)}`,
      `LOCATION:${escapeICS(content.location)}`,
      `STATUS:${status}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
};


export default {
  generateFeedToken,
  getOrCreateFeedToken,
  getFeedToken,
  getInstructorByFeedToken,
  regenerateFeedToken,
  generateICSFeed,
  buildLessonEventContent,
  getLessonForCalendarEvent,
};
