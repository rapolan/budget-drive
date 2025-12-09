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

  // Get upcoming lessons for this instructor
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
      s.hours_required
     FROM lessons l
     JOIN students s ON l.student_id = s.id
     WHERE l.instructor_id = $1 
     AND l.tenant_id = $2
     AND l.status IN ('scheduled', 'completed')
     AND l.date >= CURRENT_DATE - INTERVAL '7 days'
     ORDER BY l.date, l.start_time`,
    [instructorId, tenantId]
  );

  // Build ICS content
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Budget Driving School//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(instructorName)}'s Driving Lessons`,
    'X-WR-TIMEZONE:America/Los_Angeles',
  ];

  // Add timezone definition
  lines.push(
    'BEGIN:VTIMEZONE',
    'TZID:America/Los_Angeles',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0800',
    'TZOFFSETTO:-0700',
    'TZNAME:PDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0700',
    'TZOFFSETTO:-0800',
    'TZNAME:PST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  );

  // Add each lesson as an event
  for (const lesson of lessonsResult.rows) {
    // Parse date and times
    const dateStr = lesson.date.toISOString().split('T')[0].replace(/-/g, '');
    const startTime = lesson.start_time.replace(/:/g, '').substring(0, 6);
    const endTime = lesson.end_time.replace(/:/g, '').substring(0, 6);

    // Build description
    const descParts = [
      `Student: ${lesson.student_name}`,
      `Phone: ${lesson.student_phone || 'N/A'}`,
    ];
    
    // Add lesson number info if available
    if (lesson.lesson_number && lesson.hours_required) {
      const estimatedTotalLessons = Math.ceil(parseFloat(lesson.hours_required) / 2);
      descParts.push(`Lesson: ${lesson.lesson_number} of ${estimatedTotalLessons}`);
    } else if (lesson.lesson_number) {
      descParts.push(`Lesson: #${lesson.lesson_number}`);
    }
    
    descParts.push(`Lesson Type: ${lesson.lesson_type.replace(/_/g, ' ')}`);
    descParts.push(`Duration: ${lesson.duration} minutes`);
    
    if (lesson.pickup_address) {
      descParts.push(`Pickup: ${lesson.pickup_address}`);
    }
    if (lesson.notes) {
      descParts.push(`Notes: ${lesson.notes}`);
    }

    // Build summary with lesson number if available
    const lessonLabel = lesson.lesson_number 
      ? `Lesson #${lesson.lesson_number}` 
      : 'Driving Lesson';
    const summary = `🚗 ${lessonLabel} - ${lesson.student_name}`;
    const description = descParts.join('\\n');
    const location = lesson.pickup_address || '';
    const uid = `lesson-${lesson.id}@budgetdrivingschool.com`;

    // Status mapping
    const status = lesson.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART;TZID=America/Los_Angeles:${dateStr}T${startTime}`,
      `DTEND;TZID=America/Los_Angeles:${dateStr}T${endTime}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      `LOCATION:${escapeICS(location)}`,
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
};
