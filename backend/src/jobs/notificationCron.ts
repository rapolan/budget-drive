import cron from 'node-cron';
import { notificationProcessor } from '../services/notificationProcessor';
import { verifyEmailConnection } from '../config/email';

/**
 * Notification Cron Job
 * Runs every 5 minutes to process pending notifications
 */
export function startNotificationCron(): void {
  const schedule = process.env.NOTIFICATION_CRON_SCHEDULE || '*/5 * * * *'; // Every 5 minutes

  console.log('📧 [NotificationCron] Initializing notification cron job...');
  console.log(`📧 [NotificationCron] Schedule: ${schedule} (every 5 minutes)`);

  // Verify email connection on startup
  verifyEmailConnection().then((isValid) => {
    if (!isValid) {
      console.warn('⚠️  [NotificationCron] Email connection failed. Notifications will not be sent.');
      console.warn('⚠️  [NotificationCron] Please configure SMTP settings in .env file');
    }
  });

  // Schedule the cron job
  cron.schedule(schedule, async () => {
    try {
      console.log(`\n📧 [NotificationCron] Running scheduled notification processing...`);
      await notificationProcessor.processQueue();
    } catch (error) {
      console.error('❌ [NotificationCron] Error during scheduled processing:', error);
    }
  });

  console.log('✅ [NotificationCron] Notification cron job started successfully');
  console.log('📧 [NotificationCron] Notifications will be processed automatically every 5 minutes\n');
}

/**
 * Stop all cron jobs (for graceful shutdown)
 */
export function stopNotificationCron(): void {
  cron.getTasks().forEach((task) => {
    task.stop();
  });
  console.log('✅ [NotificationCron] Notification cron job stopped');
}
