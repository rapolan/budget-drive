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

const logger = createLogger('DashboardService');

export interface NoShowAlert {
  studentId: string;
  studentName: string;
  noShowDate: string;
  notificationId: string;
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
