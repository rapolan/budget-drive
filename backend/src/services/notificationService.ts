/**
 * Notification Service
 *
 * In-app alert dismissal tracking, using the notifications table (distinct
 * from notification_queue, the outbound email/SMS delivery pipeline).
 * notifications.user_id is NOT NULL - each row is owned by the user who
 * triggered it (e.g. whoever marked a lesson no-show), not a tenant-wide
 * broadcast. The alert LIST is still computed independently from raw
 * lesson/student data (see dashboardService), so any admin sees the alert;
 * this table only tracks whether it's been dismissed.
 */

import { query } from '../config/database';
import { Notification } from '../types';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('NotificationService');

export const getActiveNoShowNotification = async (
  tenantId: string,
  studentId: string
): Promise<Notification | null> => {
  const result = await query(
    `SELECT * FROM notifications
     WHERE tenant_id = $1 AND related_entity_type = 'student' AND related_entity_id = $2
       AND type = 'follow_up_due' AND is_read = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, studentId]
  );

  if (result.rows.length === 0) return null;
  return keysToCamel(result.rows[0]) as Notification;
};

export const createNoShowNotification = async (
  tenantId: string,
  userId: string,
  studentId: string,
  studentName: string
): Promise<Notification> => {
  const result = await query(
    `INSERT INTO notifications (
      tenant_id, user_id, type, title, message,
      related_entity_type, related_entity_id, action_url, action_label
    ) VALUES ($1, $2, 'follow_up_due', $3, $4, 'student', $5, $6, $7)
    RETURNING *`,
    [
      tenantId,
      userId,
      'No-show follow-up needed',
      `${studentName} missed a scheduled lesson - follow up to reschedule.`,
      studentId,
      `/students`,
      'View Student',
    ]
  );

  return keysToCamel(result.rows[0]) as Notification;
};

export const dismissNotification = async (id: string, tenantId: string): Promise<void> => {
  const result = await query(
    `UPDATE notifications SET is_read = true, read_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.warn('Notification not found for dismissal', { tenantId, notificationId: id });
  }
};

/**
 * Marks any active undismissed no-show notification for a student as read.
 * Called when a new lesson is booked for that student - the sole clearing
 * mechanism for this alert, alongside manual dismissal.
 */
export const dismissNoShowNotificationsForStudent = async (
  tenantId: string,
  studentId: string
): Promise<void> => {
  await query(
    `UPDATE notifications SET is_read = true, read_at = NOW()
     WHERE tenant_id = $1 AND related_entity_type = 'student' AND related_entity_id = $2
       AND type = 'follow_up_due' AND is_read = false`,
    [tenantId, studentId]
  );
};
