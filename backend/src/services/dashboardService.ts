/**
 * Dashboard Service
 *
 * First dedicated backend aggregation service for Dashboard-shaped queries
 * that can't be answered purely by filtering already-fetched REST lists
 * client-side (e.g. because they depend on a join the frontend hasn't
 * fetched, like notification dismissal state).
 */

import { query } from '../config/database';
import { createLogger } from '../utils/logger';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone, zonedWallClockToUtc, tenantToday, daysBetweenTenantDates } from '../utils/tenantTime';

const logger = createLogger('DashboardService');

export interface NoShowAlert {
  studentId: string;
  studentName: string;
  noShowDate: string;
  notificationId: string;
}

export interface LicenseExpiryAlert {
  instructorId: string;
  instructorName: string;
  expirationDate: string;
  daysUntilExpiry: number; // negative if already expired
  severity: 'warning' | 'danger';
}

export interface ReviewQueueLesson {
  id: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ReviewQueueDay {
  date: string;
  lessons: ReviewQueueLesson[];
  overdue: boolean;
}

/**
 * Students with a no-show lesson that still has an active (undismissed)
 * follow_up_due notification. The join to notifications IS the "still
 * active" check - dismissal (manual or via a new booking) is the sole
 * clearing mechanism, there is no separate time-decay window.
 */
export const getStudentsWithActiveNoShowAlert = async (tenantId: string): Promise<NoShowAlert[]> => {
  logger.debug('Fetching students with active no-show alerts', { tenantId });

  const result = await query(
    `SELECT DISTINCT ON (l.student_id)
       l.student_id AS "studentId",
       s.full_name AS "studentName",
       l.date AS "noShowDate",
       n.id AS "notificationId"
     FROM lessons l
     JOIN students s ON s.id = l.student_id AND s.tenant_id = l.tenant_id
     JOIN notifications n ON n.tenant_id = l.tenant_id
       AND n.related_entity_type = 'student'
       AND n.related_entity_id = l.student_id
       AND n.type = 'follow_up_due'
       AND n.is_read = false
     WHERE l.tenant_id = $1 AND l.status = 'no_show'
     ORDER BY l.student_id, l.date DESC`,
    [tenantId]
  );

  return result.rows;
};

/**
 * Lessons still 'scheduled' whose end time has already passed, grouped by
 * day, most-overdue-day-first. "Has this lesson ended" is inherently
 * tenant-timezone-aware math (Constraint C) - resolved here via
 * zonedWallClockToUtc, never client-side. Includes today's already-past
 * lessons.
 *
 * A day group is `overdue: true` when its earliest still-scheduled lesson's
 * end time is more than 24 hours in the past.
 *
 * Accepts an optional `instructorId` to scope to a single instructor's own
 * lessons - nothing calls it with one yet, but the query is built to accept
 * it from day one so wiring an instructor's own account into this view
 * later is a controller-only change, mirroring
 * lessonController.getAllLessons's existing instructor-scoping branch.
 */
export const getLessonsNeedingReview = async (
  tenantId: string,
  instructorId?: string
): Promise<ReviewQueueDay[]> => {
  logger.debug('Fetching lessons needing review', { tenantId, instructorId });

  const settings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(settings?.timezone);

  const params: string[] = [tenantId];
  let instructorFilter = '';
  if (instructorId) {
    params.push(instructorId);
    instructorFilter = `AND l.instructor_id = $${params.length}`;
  }

  const result = await query(
    `SELECT
       l.id,
       l.student_id AS "studentId",
       s.full_name AS "studentName",
       l.instructor_id AS "instructorId",
       i.full_name AS "instructorName",
       l.date,
       l.start_time AS "startTime",
       l.end_time AS "endTime"
     FROM lessons l
     JOIN students s ON s.id = l.student_id AND s.tenant_id = l.tenant_id
     JOIN instructors i ON i.id = l.instructor_id AND i.tenant_id = l.tenant_id
     WHERE l.tenant_id = $1 AND l.status = 'scheduled' ${instructorFilter}
     ORDER BY l.date ASC, l.start_time ASC`,
    params
  );

  const now = new Date();
  const OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  const lessonsWithEndInstant = result.rows
    .map(row => {
      // row.date comes back from pg as a native Date object (the `date`
      // column type, no time component - UTC-midnight-safe) - same
      // normalization lessonService.ts's cancelLesson fee-window check uses.
      const dateStr = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date;
      const lesson: ReviewQueueLesson = { ...row, date: dateStr };
      return {
        lesson,
        endInstant: zonedWallClockToUtc(dateStr, row.endTime, timezone),
      };
    })
    .filter(({ endInstant }) => endInstant < now);

  const byDate = new Map<string, { lessons: ReviewQueueLesson[]; earliestEndInstant: Date }>();
  for (const { lesson, endInstant } of lessonsWithEndInstant) {
    const existing = byDate.get(lesson.date);
    if (existing) {
      existing.lessons.push(lesson);
      if (endInstant < existing.earliestEndInstant) {
        existing.earliestEndInstant = endInstant;
      }
    } else {
      byDate.set(lesson.date, { lessons: [lesson], earliestEndInstant: endInstant });
    }
  }

  const days: ReviewQueueDay[] = Array.from(byDate.entries()).map(([date, { lessons, earliestEndInstant }]) => ({
    date,
    lessons,
    overdue: now.getTime() - earliestEndInstant.getTime() > OVERDUE_THRESHOLD_MS,
  }));

  days.sort((a, b) => a.date.localeCompare(b.date));

  return days;
}

// Matches instructorLicenseNotificationService's furthest pre-expiry
// reminder (180 days) - no point surfacing something further out than the
// escalation schedule itself would ever remind about.
const LICENSE_ALERT_WINDOW_DAYS = 180;
// Matches the existing "Permits Expiring" dashboard tile's own 30-day
// danger cutoff - the established convention for "urgent" on this dashboard.
const LICENSE_DANGER_WINDOW_DAYS = 30;

/**
 * Active instructors with a non-null license expiration inside the alert
 * window (already expired, or expiring within 180 days) - live-computed
 * from instructors.instructor_license_expiration + tenant "today" on every
 * call, the same pattern getLessonsNeedingReview uses (not a join against
 * persisted notification/dismissal state like the no-show alert - there is
 * no "dismiss" concept here, the alert simply stops appearing once the
 * expiration is updated to a comfortable future date).
 */
export const getInstructorsWithExpiringLicenses = async (tenantId: string): Promise<LicenseExpiryAlert[]> => {
  logger.debug('Fetching instructors with expiring licenses', { tenantId });

  const settings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(settings?.timezone);
  const todayStr = tenantToday(timezone);

  const result = await query(
    `SELECT id, full_name, instructor_license_expiration
     FROM instructors
     WHERE tenant_id = $1 AND status = 'active' AND instructor_license_expiration IS NOT NULL`,
    [tenantId]
  );

  const alerts: LicenseExpiryAlert[] = result.rows
    .map((row) => {
      // Same DATE-column normalization as getLessonsNeedingReview above -
      // pg returns a native Date object for a `date`-typed column, no time
      // component, UTC-midnight-safe.
      const expirationDate = row.instructor_license_expiration instanceof Date
        ? row.instructor_license_expiration.toISOString().split('T')[0]
        : String(row.instructor_license_expiration).split('T')[0];

      const daysUntilExpiry = daysBetweenTenantDates(todayStr, expirationDate);

      return {
        instructorId: row.id,
        instructorName: row.full_name,
        expirationDate,
        daysUntilExpiry,
        severity: (daysUntilExpiry <= LICENSE_DANGER_WINDOW_DAYS ? 'danger' : 'warning') as 'warning' | 'danger',
      };
    })
    .filter((alert) => alert.daysUntilExpiry <= LICENSE_ALERT_WINDOW_DAYS)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return alerts;
};
