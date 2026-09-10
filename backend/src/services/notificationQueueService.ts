/**
 * Notification Queue Service
 *
 * The outbound email delivery pipeline - `notification_queue` (distinct
 * from the `notifications` table, in-app alert dismissal tracking, see
 * notificationService.ts). lessonService.ts writes rows here on booking
 * and cancellation; automatic sending is driven by notificationProcessor's
 * processQueue(), triggered manually via POST /notifications/process.
 * There is no automatic scheduler - the cron job that used to call this
 * on a timer (jobs/notificationCron.ts) was confirmed dead/never wired to
 * index.ts and was removed entirely in a later health-audit pass; wiring
 * up real automatic sending remains out of scope here.
 *
 * Moved out of routes/notifications.ts (which previously ran this SQL
 * directly in the route handler) to match this codebase's service-layer
 * convention - routes/controllers never own DB access.
 *
 * `l.date AS lesson_date` below (not a bare `l.lesson_date`) - the
 * original route SQL referenced a `lessons.lesson_date` column that has
 * never existed (the real column is `lessons.date`); this went uncaught
 * because notification_queue itself didn't exist yet either, so the
 * query never actually ran until this fix restored the table.
 */

import { query } from '../config/database';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('NotificationQueueService');

export interface NotificationQueueEntry {
  id: string;
  lessonId: string;
  notificationType: 'reminder_24h' | 'reminder_1h' | 'booking_confirmation' | 'cancellation';
  recipientEmail: string;
  recipientType: 'student' | 'instructor';
  scheduledSendTime: string;
  sentAt: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attemptCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  lessonDate: string;
  lessonTime: string;
  studentName: string;
  instructorName: string;
  createdAt: string;
}

export interface NotificationHistoryEntry extends NotificationQueueEntry {
  studentEmail: string;
  instructorEmail: string;
}

export interface NotificationStats {
  totalSent: number;
  totalFailed: number;
  totalPending: number;
  totalNotifications: number;
  totalFeesSats: number;
  totalFeesUsd: number;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Pending/sent/failed/cancelled notification_queue rows for a tenant,
 * newest-scheduled-first, joined with the lesson/student/instructor names
 * the list view needs.
 */
export const getNotificationQueue = async (
  tenantId: string,
  status: string | undefined,
  pagination: PaginationParams
): Promise<{ data: NotificationQueueEntry[]; total: number }> => {
  const params: any[] = [tenantId];
  let sql = `
    SELECT
      nq.*,
      l.date as lesson_date,
      l.start_time,
      s.full_name as student_name,
      i.full_name as instructor_name
    FROM notification_queue nq
    JOIN lessons l ON nq.lesson_id = l.id
    JOIN enrollments e ON e.id = l.enrollment_id
    JOIN students s ON e.student_id = s.id
    JOIN instructors i ON l.instructor_id = i.id
    WHERE nq.tenant_id = $1
  `;

  if (status) {
    params.push(status);
    sql += ` AND nq.status = $${params.length}`;
  }

  sql += ` ORDER BY nq.scheduled_send_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(pagination.limit, pagination.offset);

  const result = await query(sql, params);

  const countParams: any[] = [tenantId];
  let countSql = 'SELECT COUNT(*) FROM notification_queue WHERE tenant_id = $1';
  if (status) {
    countParams.push(status);
    countSql += ` AND status = $${countParams.length}`;
  }
  const countResult = await query(countSql, countParams);

  return {
    data: result.rows.map((row: any) => keysToCamel(row) as NotificationQueueEntry),
    total: parseInt(countResult.rows[0].count, 10),
  };
};

/**
 * Sent/failed notification_queue rows for a tenant (notification history),
 * optionally bounded by sent_at date range, plus tenant-wide stats.
 */
export const getNotificationHistory = async (
  tenantId: string,
  startDate: string | undefined,
  endDate: string | undefined,
  pagination: PaginationParams
): Promise<{ data: NotificationHistoryEntry[]; stats: NotificationStats }> => {
  const params: any[] = [tenantId];
  let sql = `
    SELECT
      nq.*,
      l.date as lesson_date,
      l.start_time,
      s.full_name as student_name,
      s.email as student_email,
      i.full_name as instructor_name,
      i.email as instructor_email
    FROM notification_queue nq
    JOIN lessons l ON nq.lesson_id = l.id
    JOIN enrollments e ON e.id = l.enrollment_id
    JOIN students s ON e.student_id = s.id
    JOIN instructors i ON l.instructor_id = i.id
    WHERE nq.tenant_id = $1
    AND nq.status IN ('sent', 'failed')
  `;

  if (startDate) {
    params.push(startDate);
    sql += ` AND nq.sent_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    sql += ` AND nq.sent_at <= $${params.length}`;
  }

  sql += ` ORDER BY nq.sent_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(pagination.limit, pagination.offset);

  const result = await query(sql, params);

  const statsResult = await query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
      COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
      COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
      COUNT(*) as total_notifications
    FROM notification_queue
    WHERE tenant_id = $1`,
    [tenantId]
  );

  const statsRow = statsResult.rows[0];
  const totalFeesSats = parseInt(statsRow.total_sent, 10);

  logger.debug('Fetched notification history', { tenantId, rowCount: result.rows.length });

  return {
    data: result.rows.map((row: any) => keysToCamel(row) as NotificationHistoryEntry),
    stats: {
      totalSent: parseInt(statsRow.total_sent, 10),
      totalFailed: parseInt(statsRow.total_failed, 10),
      totalPending: parseInt(statsRow.total_pending, 10),
      totalNotifications: parseInt(statsRow.total_notifications, 10),
      totalFeesSats,
      // 1 sat per sent notification, approximate USD conversion - matches
      // the rate notificationProcessor.recordNotificationFee actually
      // records per-notification.
      totalFeesUsd: parseFloat((totalFeesSats * 0.0000005).toFixed(10)),
    },
  };
};

/**
 * A random scheduled lesson for the tenant - used only to seed a test
 * notification (POST /notifications/test, dev/admin tooling).
 */
export const getRandomScheduledLessonId = async (tenantId: string): Promise<string | null> => {
  const result = await query(
    `SELECT id FROM lessons WHERE tenant_id = $1 AND status = 'scheduled' ORDER BY RANDOM() LIMIT 1`,
    [tenantId]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
};

export const createTestNotification = async (
  tenantId: string,
  lessonId: string,
  email: string,
  scheduledTime: Date
): Promise<{ id: string; scheduledSendTime: string }> => {
  const result = await query(
    `INSERT INTO notification_queue (
      tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
      scheduled_send_time, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING id, scheduled_send_time`,
    [tenantId, lessonId, 'reminder_24h', email, 'student', scheduledTime, 'pending']
  );

  logger.info('Created test notification', { tenantId, lessonId, notificationId: result.rows[0].id });

  return {
    id: result.rows[0].id,
    scheduledSendTime: result.rows[0].scheduled_send_time,
  };
};
