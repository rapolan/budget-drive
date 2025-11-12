/**
 * Notification Service - Budget Drive Protocol (BDP)
 * Phase 1 - Week 1: Email notifications via Nodemailer + Gmail
 *
 * FREE EMAIL SOLUTION:
 * - Nodemailer + Gmail SMTP
 * - 500 emails/day limit (15,000/month)
 * - No cost during pilot phase
 * - Professional delivery via Gmail infrastructure
 *
 * FUTURE ENHANCEMENTS:
 * - Phase 1 Week 2: SMS via Twilio (when budget allows)
 * - Phase 2: Push notifications
 * - Phase 3: In-app notifications
 */

import nodemailer from 'nodemailer';
import pool from '../config/database';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class NotificationService {
  private transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize Gmail transporter
   * Uses Gmail SMTP with app-specific password
   */
  private async initializeTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;

    if (!emailUser || !emailPassword) {
      console.warn('⚠️  Email credentials not configured. Set EMAIL_USER and EMAIL_PASSWORD in .env');
      console.warn('   See NOTIFICATION_SETUP_GUIDE.md for Gmail app password setup');
      return null;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPassword, // Gmail app password (not regular password)
      },
    });

    // Verify connection
    try {
      await this.transporter.verify();
      console.log('✅ Gmail SMTP connection verified');
      return this.transporter;
    } catch (error) {
      console.error('❌ Gmail SMTP verification failed:', error);
      this.transporter = null;
      return null;
    }
  }

  /**
   * Send email via Gmail
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    const transporter = await this.initializeTransporter();
    if (!transporter) {
      console.error('Email transporter not available');
      return false;
    }

    try {
      const info = await transporter.sendMail({
        from: `"Budget Driving School" <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        text: options.text || '', // Plain text fallback
        html: options.html,
      });

      console.log('📧 Email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Email send failed:', error);
      return false;
    }
  }

  /**
   * Send lesson reminder email
   */
  async sendLessonReminder(
    recipientEmail: string,
    recipientName: string,
    lessonDetails: {
      date: string;
      time: string;
      duration: number;
      instructorName: string;
      lessonType: string;
      location?: string;
    },
    reminderType: '24_hour_reminder' | '1_hour_reminder'
  ): Promise<boolean> {
    const timeframe = reminderType === '24_hour_reminder' ? '24 hours' : '1 hour';

    const subject = `Reminder: Driving Lesson in ${timeframe}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .lesson-details { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; margin: 10px 0; }
          .detail-label { font-weight: bold; width: 150px; }
          .detail-value { flex: 1; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          .button { background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚗 Lesson Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${recipientName},</p>
            <p>This is a friendly reminder that you have a driving lesson coming up in <strong>${timeframe}</strong>.</p>

            <div class="lesson-details">
              <h2>Lesson Details</h2>
              <div class="detail-row">
                <div class="detail-label">Date:</div>
                <div class="detail-value">${lessonDetails.date}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Time:</div>
                <div class="detail-value">${lessonDetails.time}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Duration:</div>
                <div class="detail-value">${lessonDetails.duration} minutes</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Instructor:</div>
                <div class="detail-value">${lessonDetails.instructorName}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Type:</div>
                <div class="detail-value">${lessonDetails.lessonType}</div>
              </div>
              ${lessonDetails.location ? `
              <div class="detail-row">
                <div class="detail-label">Location:</div>
                <div class="detail-value">${lessonDetails.location}</div>
              </div>
              ` : ''}
            </div>

            <p>If you need to reschedule or have any questions, please contact your driving school.</p>

            <p>See you soon!</p>
            <p><strong>Budget Driving School Team</strong></p>
          </div>
          <div class="footer">
            <p>Powered by Budget Drive Protocol (BDP)</p>
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${recipientName},

This is a reminder that you have a driving lesson in ${timeframe}.

Lesson Details:
- Date: ${lessonDetails.date}
- Time: ${lessonDetails.time}
- Duration: ${lessonDetails.duration} minutes
- Instructor: ${lessonDetails.instructorName}
- Type: ${lessonDetails.lessonType}
${lessonDetails.location ? `- Location: ${lessonDetails.location}` : ''}

If you need to reschedule, please contact your driving school.

See you soon!
Budget Driving School Team

---
Powered by Budget Drive Protocol (BDP)
    `.trim();

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text,
    });
  }

  /**
   * Send booking confirmation email
   */
  async sendBookingConfirmation(
    recipientEmail: string,
    recipientName: string,
    lessonDetails: {
      date: string;
      time: string;
      duration: number;
      instructorName: string;
      lessonType: string;
      cost: number;
      location?: string;
    }
  ): Promise<boolean> {
    const subject = 'Lesson Booking Confirmed';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .lesson-details { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; margin: 10px 0; }
          .detail-label { font-weight: bold; width: 150px; }
          .detail-value { flex: 1; }
          .success-badge { background-color: #10b981; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; margin: 10px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Booking Confirmed!</h1>
          </div>
          <div class="content">
            <p>Hi ${recipientName},</p>
            <p>Great news! Your driving lesson has been successfully booked.</p>

            <div class="lesson-details">
              <h2>Lesson Details</h2>
              <div class="detail-row">
                <div class="detail-label">Date:</div>
                <div class="detail-value">${lessonDetails.date}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Time:</div>
                <div class="detail-value">${lessonDetails.time}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Duration:</div>
                <div class="detail-value">${lessonDetails.duration} minutes</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Instructor:</div>
                <div class="detail-value">${lessonDetails.instructorName}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Type:</div>
                <div class="detail-value">${lessonDetails.lessonType}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Cost:</div>
                <div class="detail-value">$${lessonDetails.cost.toFixed(2)}</div>
              </div>
              ${lessonDetails.location ? `
              <div class="detail-row">
                <div class="detail-label">Location:</div>
                <div class="detail-value">${lessonDetails.location}</div>
              </div>
              ` : ''}
            </div>

            <p>You'll receive reminder notifications 24 hours and 1 hour before your lesson.</p>

            <p>If you need to reschedule or have any questions, please contact us.</p>

            <p>We look forward to seeing you!</p>
            <p><strong>Budget Driving School Team</strong></p>
          </div>
          <div class="footer">
            <p>Powered by Budget Drive Protocol (BDP)</p>
            <p>This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hi ${recipientName},

Great news! Your driving lesson has been successfully booked.

Lesson Details:
- Date: ${lessonDetails.date}
- Time: ${lessonDetails.time}
- Duration: ${lessonDetails.duration} minutes
- Instructor: ${lessonDetails.instructorName}
- Type: ${lessonDetails.lessonType}
- Cost: $${lessonDetails.cost.toFixed(2)}
${lessonDetails.location ? `- Location: ${lessonDetails.location}` : ''}

You'll receive reminder notifications 24 hours and 1 hour before your lesson.

If you need to reschedule, please contact us.

We look forward to seeing you!
Budget Driving School Team

---
Powered by Budget Drive Protocol (BDP)
    `.trim();

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text,
    });
  }

  /**
   * Process notification queue (to be called by cron job)
   * Sends pending notifications that are due
   */
  async processNotificationQueue(): Promise<void> {
    try {
      // Get pending notifications that are due
      const query = `
        SELECT
          nq.id,
          nq.tenant_id,
          nq.lesson_id,
          nq.recipient_type,
          nq.recipient_id,
          nq.recipient_email,
          nq.notification_type,
          nq.scheduled_for,
          nq.metadata,
          l.date as lesson_date,
          l.start_time,
          l.duration,
          l.lesson_type,
          l.cost,
          CASE
            WHEN nq.recipient_type = 'student' THEN s.full_name
            WHEN nq.recipient_type = 'instructor' THEN i.full_name
          END as recipient_name,
          i.full_name as instructor_name
        FROM notification_queue nq
        JOIN lessons l ON nq.lesson_id = l.id
        LEFT JOIN students s ON nq.recipient_type = 'student' AND nq.recipient_id = s.id
        LEFT JOIN instructors i ON l.instructor_id = i.id
        WHERE nq.status = 'pending'
          AND nq.scheduled_for <= NOW()
        ORDER BY nq.scheduled_for ASC
        LIMIT 100
      `;

      const result = await pool.query(query);
      const notifications = result.rows;

      console.log(`📬 Processing ${notifications.length} pending notifications...`);

      for (const notification of notifications) {
        try {
          let success = false;

          // Format lesson details
          const lessonDetails = {
            date: new Date(notification.lesson_date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            time: notification.start_time,
            duration: notification.duration,
            instructorName: notification.instructor_name,
            lessonType: notification.lesson_type.replace('_', ' ').toUpperCase(),
            cost: parseFloat(notification.cost),
            location: notification.metadata?.location,
          };

          // Send appropriate notification type
          if (notification.notification_type === 'booking_confirmation') {
            success = await this.sendBookingConfirmation(
              notification.recipient_email,
              notification.recipient_name,
              lessonDetails
            );
          } else if (
            notification.notification_type === '24_hour_reminder' ||
            notification.notification_type === '1_hour_reminder'
          ) {
            success = await this.sendLessonReminder(
              notification.recipient_email,
              notification.recipient_name,
              lessonDetails,
              notification.notification_type
            );
          }

          // Update notification status
          if (success) {
            await pool.query(
              'UPDATE notification_queue SET status = $1, sent_at = NOW() WHERE id = $2',
              ['sent', notification.id]
            );
            console.log(`✅ Notification sent: ${notification.notification_type} to ${notification.recipient_email}`);
          } else {
            await pool.query(
              'UPDATE notification_queue SET status = $1, metadata = jsonb_set(COALESCE(metadata, \'{}\'::jsonb), \'{error}\', $2::jsonb) WHERE id = $3',
              ['failed', JSON.stringify('Email send failed'), notification.id]
            );
            console.error(`❌ Notification failed: ${notification.id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing notification ${notification.id}:`, error);
          await pool.query(
            'UPDATE notification_queue SET status = $1 WHERE id = $2',
            ['failed', notification.id]
          );
        }
      }

      console.log(`✅ Notification queue processing complete`);
    } catch (error) {
      console.error('❌ Error processing notification queue:', error);
    }
  }

  /**
   * Queue a notification (called when lesson is booked)
   */
  async queueNotification(
    tenantId: string,
    lessonId: string,
    recipientType: 'student' | 'instructor',
    recipientId: string,
    recipientEmail: string,
    notificationType: '24_hour_reminder' | '1_hour_reminder' | 'booking_confirmation',
    scheduledFor: Date,
    metadata?: any
  ): Promise<void> {
    const query = `
      INSERT INTO notification_queue (
        tenant_id, lesson_id, recipient_type, recipient_id, recipient_email,
        notification_type, scheduled_for, status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await pool.query(query, [
      tenantId,
      lessonId,
      recipientType,
      recipientId,
      recipientEmail,
      notificationType,
      scheduledFor,
      'pending',
      metadata ? JSON.stringify(metadata) : null,
    ]);

    console.log(`📝 Queued notification: ${notificationType} for ${recipientEmail} at ${scheduledFor}`);
  }
}

export default new NotificationService();
