/**
 * Instructor License Notification Service
 *
 * Escalating reminders for an instructor's Driving School Instructor
 * License (California DMV, renewed every 3 years) approaching or past its
 * expiration. Fires at most once per (instructor, expiration date,
 * threshold) - see instructor_license_notifications (migration 017), whose
 * UNIQUE constraint is the actual dedup enforcement (INSERT ... ON CONFLICT
 * DO NOTHING), not just an application-level check.
 *
 * "Days until expiry" is tenant-timezone date-string arithmetic
 * (daysBetweenTenantDates) - never new Date()/local getters (Constraint A).
 * instructor_license_expiration is a plain DATE column with no time
 * component, so this is pure calendar-day math once the caller has already
 * resolved "today" in the tenant's timezone.
 *
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security.
 */

import { query } from '../config/database';
import { createLogger } from '../utils/logger';
import { daysBetweenTenantDates } from '../utils/tenantTime';

const logger = createLogger('InstructorLicenseNotificationService');

// Pre-expiry reminder thresholds, in days before expiry: 6mo/3mo/1mo/2wk/1wk.
export const THRESHOLDS = [180, 90, 30, 14, 7];

// Post-expiry escalation cadence: every 7 days after expiry, indefinitely,
// until the license is renewed to a future date.
export const POST_EXPIRY_INTERVAL_DAYS = 7;

/**
 * Given the signed number of days until expiry (negative once past expiry),
 * returns the single threshold bucket "today" falls into, or null if none
 * matches (the common case on most days - a threshold only matches on the
 * exact day the search window is set for).
 */
export function resolveThresholdForOffset(daysUntilExpiry: number): number | null {
  if (daysUntilExpiry >= 0) {
    if (daysUntilExpiry === 0) return 0;
    return THRESHOLDS.includes(daysUntilExpiry) ? daysUntilExpiry : null;
  }
  // Past expiry: fire on exact multiples of the post-expiry interval.
  return daysUntilExpiry % POST_EXPIRY_INTERVAL_DAYS === 0 ? daysUntilExpiry : null;
}

interface InstructorLicenseRow {
  id: string;
  full_name: string;
  // pg returns a native Date object for a `date`-typed column (no time
  // component, UTC-midnight-safe) - same normalization dashboardService.ts's
  // review-queue query already documents for the identical situation.
  instructor_license_expiration: string | Date;
}

/**
 * Attempts to record that (instructorId, expirationDate, threshold) has
 * been notified. Returns true if this call is the one that actually
 * recorded it (i.e. it hadn't fired before) - false if it was already
 * recorded (ON CONFLICT DO NOTHING), meaning the caller must NOT create any
 * further notifications for this occurrence.
 */
async function recordThresholdFired(
  tenantId: string,
  instructorId: string,
  expirationDate: string,
  threshold: number
): Promise<boolean> {
  const result = await query(
    `INSERT INTO instructor_license_notifications (tenant_id, instructor_id, expiration_date, threshold)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (instructor_id, expiration_date, threshold) DO NOTHING
     RETURNING id`,
    [tenantId, instructorId, expirationDate, threshold]
  );
  return result.rows.length > 0;
}

function formatThresholdMessage(instructorName: string, expirationDate: string, threshold: number): { title: string; message: string } {
  if (threshold > 0) {
    return {
      title: 'Instructor license expiring soon',
      message: `${instructorName}'s Driving School Instructor License expires on ${expirationDate} (in ${threshold} days).`,
    };
  }
  if (threshold === 0) {
    return {
      title: 'Instructor license expires today',
      message: `${instructorName}'s Driving School Instructor License expires today (${expirationDate}).`,
    };
  }
  const daysPast = Math.abs(threshold);
  return {
    title: 'Instructor license expired',
    message: `${instructorName}'s Driving School Instructor License expired on ${expirationDate} (${daysPast} days ago). This is a compliance risk.`,
  };
}

/**
 * Creates one 'license_expiring' notification for every active owner/admin
 * user in the tenant, for a single (instructor, threshold) firing event.
 */
async function notifyAdmins(
  tenantId: string,
  instructorId: string,
  instructorName: string,
  expirationDate: string,
  threshold: number
): Promise<void> {
  const adminsResult = await query(
    `SELECT u.id FROM users u
     INNER JOIN user_tenant_memberships utm ON u.id = utm.user_id
     WHERE utm.tenant_id = $1 AND utm.role IN ('owner', 'admin') AND utm.status = 'active'`,
    [tenantId]
  );

  const { title, message } = formatThresholdMessage(instructorName, expirationDate, threshold);

  for (const admin of adminsResult.rows) {
    await query(
      `INSERT INTO notifications (
        tenant_id, user_id, type, title, message,
        related_entity_type, related_entity_id, action_url, action_label
      ) VALUES ($1, $2, 'license_expiring', $3, $4, 'instructor', $5, $6, $7)`,
      [tenantId, admin.id, title, message, instructorId, '/instructors', 'View Instructor']
    );
  }
}

/**
 * Scans every active instructor with a non-null license expiration for the
 * given tenant, and fires a notification for any that fall on a threshold
 * boundary as of `todayStr` (already resolved in the tenant's timezone by
 * the caller - see instructorLicenseCron.ts).
 *
 * Instructors with a NULL expiration are excluded from this query entirely
 * - no threshold makes sense with no date. They're surfaced instead by the
 * always-visible "missing" flag on the instructor record/list (see
 * frontend/src/utils/licenseExpiry.ts), not by this cron.
 */
export async function runInstructorLicenseCheck(tenantId: string, todayStr: string): Promise<void> {
  const instructorsResult = await query(
    `SELECT id, full_name, instructor_license_expiration
     FROM instructors
     WHERE tenant_id = $1 AND status = 'active' AND instructor_license_expiration IS NOT NULL`,
    [tenantId]
  );

  for (const row of instructorsResult.rows as InstructorLicenseRow[]) {
    const expirationDateStr = row.instructor_license_expiration instanceof Date
      ? row.instructor_license_expiration.toISOString().split('T')[0]
      : String(row.instructor_license_expiration).split('T')[0];

    const daysUntilExpiry = daysBetweenTenantDates(todayStr, expirationDateStr);
    const threshold = resolveThresholdForOffset(daysUntilExpiry);
    if (threshold === null) continue;

    const firstTimeFiring = await recordThresholdFired(tenantId, row.id, expirationDateStr, threshold);
    if (!firstTimeFiring) continue;

    try {
      await notifyAdmins(tenantId, row.id, row.full_name, expirationDateStr, threshold);
    } catch (error) {
      logger.error('Failed to notify admins of instructor license threshold', error as Error, {
        tenantId,
        instructorId: row.id,
        threshold,
      });
    }
  }
}
