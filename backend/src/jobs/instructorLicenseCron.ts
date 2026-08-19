import cron, { ScheduledTask } from 'node-cron';
import { query } from '../config/database';
import { getTenantSettings } from '../services/tenantService';
import { resolveTenantTimezone, tenantToday } from '../utils/tenantTime';
import { runInstructorLicenseCheck } from '../services/instructorLicenseNotificationService';
import { createLogger } from '../utils/logger';

const logger = createLogger('InstructorLicenseCron');

let scheduledTask: ScheduledTask | null = null;

/**
 * Instructor License Expiry Cron Job
 * Runs once daily, scanning every tenant's active instructors for a
 * Driving School Instructor License approaching or past expiration.
 *
 * The schedule string below fires at a fixed SERVER wall-clock time (cron
 * scheduling is inherently server-local), but the WORK inside resolves
 * "today" per-tenant via tenantToday(timezone) - so which server instant
 * the job happens to run at never affects which tenant-calendar-day a
 * threshold is evaluated against (Constraint A). Running once around the
 * same server time each day is sufficient since thresholds are day-level,
 * not time-level.
 */
export function startInstructorLicenseCron(): void {
  const schedule = process.env.INSTRUCTOR_LICENSE_CRON_SCHEDULE || '0 8 * * *'; // Daily at 8am server time

  logger.info('Initializing instructor license expiry cron job', { schedule });

  scheduledTask = cron.schedule(schedule, async () => {
    try {
      logger.info('Running scheduled instructor license expiry check...');
      await runForAllTenants();
    } catch (error) {
      logger.error('Error during instructor license expiry check', error as Error);
    }
  });

  logger.info('Instructor license expiry cron job started successfully');
}

async function runForAllTenants(): Promise<void> {
  const tenantsResult = await query('SELECT id FROM tenants', []);

  for (const tenant of tenantsResult.rows as Array<{ id: string }>) {
    try {
      const settings = await getTenantSettings(tenant.id);
      const timezone = resolveTenantTimezone(settings?.timezone);
      const todayStr = tenantToday(timezone);

      await runInstructorLicenseCheck(tenant.id, todayStr);
    } catch (error) {
      logger.error('Failed to run instructor license check for tenant', error as Error, {
        tenantId: tenant.id,
      });
    }
  }
}

export function stopInstructorLicenseCron(): void {
  scheduledTask?.stop();
  scheduledTask = null;
  logger.info('Instructor license expiry cron job stopped');
}
