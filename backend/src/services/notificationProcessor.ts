import pool from '../config/database';
import { createEmailTransporter, getEmailConfig } from '../config/email';
import {
  generate24HourReminderEmail,
  generate1HourReminderEmail,
  generateBookingConfirmationEmail,
  generateCancellationEmail,
} from '../templates/emailTemplates';

interface NotificationQueueItem {
  id: string;
  tenantId: string;
  lessonId: string;
  notificationType: 'reminder_24h' | 'reminder_1h' | 'booking_confirmation' | 'cancellation';
  recipientEmail: string;
  recipientType: 'student' | 'instructor';
  scheduledSendTime: Date;
  status: 'pending' | 'sent' | 'failed';
  attemptCount: number;
  lastAttemptAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LessonDetails {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  instructorId: string;
  instructorName: string;
  instructorEmail: string;
  lessonType: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  duration: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  cost?: number;
  status: string;
}

export class NotificationProcessor {
  private transporter;
  private emailConfig;
  private batchSize: number;
  private maxRetries: number;

  constructor() {
    this.transporter = createEmailTransporter();
    this.emailConfig = getEmailConfig();
    this.batchSize = parseInt(process.env.NOTIFICATION_BATCH_SIZE || '50');
    this.maxRetries = parseInt(process.env.NOTIFICATION_MAX_RETRIES || '3');
  }

  /**
   * Main processing function - called by cron job
   */
  async processQueue(): Promise<void> {
    try {
      console.log('🔄 [NotificationProcessor] Starting queue processing...');

      const pendingNotifications = await this.getPendingNotifications();

      if (pendingNotifications.length === 0) {
        console.log('✅ [NotificationProcessor] No pending notifications');
        return;
      }

      console.log(`📧 [NotificationProcessor] Found ${pendingNotifications.length} notifications to process`);

      let successCount = 0;
      let failureCount = 0;

      for (const notification of pendingNotifications) {
        try {
          await this.processNotification(notification);
          successCount++;
        } catch (error) {
          console.error(`❌ [NotificationProcessor] Failed to process notification ${notification.id}:`, error);
          failureCount++;
        }
      }

      console.log(`✅ [NotificationProcessor] Batch complete: ${successCount} sent, ${failureCount} failed`);
    } catch (error) {
      console.error('❌ [NotificationProcessor] Queue processing error:', error);
    }
  }

  /**
   * Get pending notifications ready to send
   */
  private async getPendingNotifications(): Promise<NotificationQueueItem[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM notification_queue
         WHERE status = 'pending'
         AND scheduled_for <= NOW()
         AND retry_count < $1
         ORDER BY scheduled_for ASC
         LIMIT $2`,
        [this.maxRetries, this.batchSize]
      );

      return result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        lessonId: row.lesson_id,
        notificationType: row.notification_type,
        recipientEmail: row.recipient_email,
        recipientType: row.recipient_type,
        scheduledSendTime: row.scheduled_send_time,
        status: row.status,
        attemptCount: row.attempt_count,
        lastAttemptAt: row.last_attempt_at,
        errorMessage: row.error_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Process a single notification
   */
  private async processNotification(notification: NotificationQueueItem): Promise<void> {
    console.log(`📧 [NotificationProcessor] Processing notification ${notification.id} (${notification.notificationType})`);

    try {
      // Fetch lesson details
      const lessonDetails = await this.getLessonDetails(notification.lessonId, notification.tenantId);

      if (!lessonDetails) {
        throw new Error(`Lesson not found: ${notification.lessonId}`);
      }

      // Generate email content based on type
      const emailContent = this.generateEmailContent(notification, lessonDetails);

      // Send email
      await this.sendEmail(notification.recipientEmail, emailContent.subject, emailContent.html, emailContent.text);

      // Mark as sent
      await this.markNotificationSent(notification.id);

      // Record treasury fee (1 sat per notification)
      await this.recordNotificationFee(notification.tenantId, notification.id);

      console.log(`✅ [NotificationProcessor] Notification ${notification.id} sent successfully to ${notification.recipientEmail}`);
    } catch (error: any) {
      console.error(`❌ [NotificationProcessor] Failed to send notification ${notification.id}:`, error);

      // Mark as failed and increment attempt count
      await this.markNotificationFailed(notification.id, error.message);

      throw error;
    }
  }

  /**
   * Get lesson details from database
   */
  private async getLessonDetails(lessonId: string, tenantId: string): Promise<LessonDetails | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT
          l.id,
          l.student_id,
          s.full_name as student_name,
          s.email as student_email,
          l.instructor_id,
          i.full_name as instructor_name,
          i.email as instructor_email,
          l.lesson_type,
          l.lesson_date::text,
          l.start_time,
          l.end_time,
          EXTRACT(EPOCH FROM (l.end_time::time - l.start_time::time))/60 as duration,
          v.make as vehicle_make,
          v.model as vehicle_model,
          v.year as vehicle_year,
          l.cost,
          l.status
        FROM lessons l
        JOIN students s ON l.student_id = s.id
        JOIN instructors i ON l.instructor_id = i.id
        LEFT JOIN vehicles v ON l.vehicle_id = v.id
        WHERE l.id = $1 AND l.tenant_id = $2`,
        [lessonId, tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        studentEmail: row.student_email,
        instructorId: row.instructor_id,
        instructorName: row.instructor_name,
        instructorEmail: row.instructor_email,
        lessonType: row.lesson_type,
        lessonDate: new Date(row.lesson_date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        startTime: row.start_time,
        endTime: row.end_time,
        duration: parseInt(row.duration),
        vehicleMake: row.vehicle_make,
        vehicleModel: row.vehicle_model,
        vehicleYear: row.vehicle_year,
        cost: row.cost,
        status: row.status,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Generate email content based on notification type
   */
  private generateEmailContent(
    notification: NotificationQueueItem,
    lesson: LessonDetails
  ): { subject: string; html: string; text: string } {
    const lessonData = {
      studentName: lesson.studentName,
      instructorName: lesson.instructorName,
      lessonType: lesson.lessonType,
      lessonDate: lesson.lessonDate,
      lessonTime: lesson.startTime,
      duration: lesson.duration,
      vehicleInfo: lesson.vehicleMake
        ? `${lesson.vehicleYear} ${lesson.vehicleMake} ${lesson.vehicleModel}`
        : undefined,
      cost: lesson.cost,
    };

    switch (notification.notificationType) {
      case 'reminder_24h':
        return generate24HourReminderEmail(lessonData, notification.recipientEmail);
      case 'reminder_1h':
        return generate1HourReminderEmail(lessonData, notification.recipientEmail);
      case 'booking_confirmation':
        return generateBookingConfirmationEmail(lessonData, notification.recipientEmail);
      case 'cancellation':
        return generateCancellationEmail(lessonData, notification.recipientEmail);
      default:
        throw new Error(`Unknown notification type: ${notification.notificationType}`);
    }
  }

  /**
   * Send email via SMTP
   */
  private async sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
    const mailOptions = {
      from: `"${this.emailConfig.from.name}" <${this.emailConfig.from.email}>`,
      to,
      subject,
      text,
      html,
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Mark notification as sent
   */
  private async markNotificationSent(notificationId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE notification_queue
         SET status = 'sent',
             sent_at = NOW(),
             last_attempt_at = NOW(),
             attempt_count = attempt_count + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [notificationId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Mark notification as failed
   */
  private async markNotificationFailed(notificationId: string, errorMessage: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE notification_queue
         SET status = CASE
           WHEN attempt_count + 1 >= $2 THEN 'failed'
           ELSE 'pending'
         END,
         attempt_count = attempt_count + 1,
         last_attempt_at = NOW(),
         error_message = $3,
         updated_at = NOW()
         WHERE id = $1`,
        [notificationId, this.maxRetries, errorMessage]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Record notification fee in treasury (1 sat per notification)
   */
  private async recordNotificationFee(tenantId: string, notificationId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO treasury_transactions (
          tenant_id,
          transaction_type,
          amount_sats,
          amount_usd,
          description,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          tenantId,
          'notification_fee',
          1, // 1 satoshi per notification
          0.0000005, // ~$0.0000005 USD (approximate)
          `Email notification sent (ID: ${notificationId})`,
          JSON.stringify({ notificationId }),
        ]
      );

      console.log(`💰 [NotificationProcessor] Recorded 1 sat fee for notification ${notificationId}`);
    } catch (error) {
      console.error('❌ [NotificationProcessor] Failed to record treasury fee:', error);
      // Don't throw - notification was still sent successfully
    } finally {
      client.release();
    }
  }

  /**
   * Retry a failed notification manually
   */
  async retryNotification(notificationId: string): Promise<void> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM notification_queue WHERE id = $1`,
        [notificationId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Notification not found: ${notificationId}`);
      }

      const notification: NotificationQueueItem = {
        id: result.rows[0].id,
        tenantId: result.rows[0].tenant_id,
        lessonId: result.rows[0].lesson_id,
        notificationType: result.rows[0].notification_type,
        recipientEmail: result.rows[0].recipient_email,
        recipientType: result.rows[0].recipient_type,
        scheduledSendTime: result.rows[0].scheduled_send_time,
        status: result.rows[0].status,
        attemptCount: result.rows[0].attempt_count,
        lastAttemptAt: result.rows[0].last_attempt_at,
        errorMessage: result.rows[0].error_message,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
      };

      await this.processNotification(notification);
    } finally {
      client.release();
    }
  }
}

// Singleton instance
export const notificationProcessor = new NotificationProcessor();
