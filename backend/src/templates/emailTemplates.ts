import { getEmailConfig } from '../config/email';

interface LessonDetails {
  studentName: string;
  instructorName: string;
  lessonType: string;
  lessonDate: string;
  lessonTime: string;
  duration: number;
  vehicleInfo?: string;
  cost?: number;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function getBaseStyles(): string {
  return `
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 30px;
        border-radius: 10px 10px 0 0;
        text-align: center;
      }
      .content {
        background: #ffffff;
        padding: 30px;
        border-left: 1px solid #e5e7eb;
        border-right: 1px solid #e5e7eb;
      }
      .footer {
        background: #f9fafb;
        padding: 20px 30px;
        border-radius: 0 0 10px 10px;
        border: 1px solid #e5e7eb;
        text-align: center;
        font-size: 12px;
        color: #6b7280;
      }
      .lesson-details {
        background: #f3f4f6;
        padding: 20px;
        border-radius: 8px;
        margin: 20px 0;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #e5e7eb;
      }
      .detail-row:last-child {
        border-bottom: none;
      }
      .detail-label {
        font-weight: 600;
        color: #4b5563;
      }
      .detail-value {
        color: #111827;
      }
      .cta-button {
        display: inline-block;
        background: #667eea;
        color: white;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 6px;
        margin: 20px 0;
      }
      .alert {
        background: #fef3c7;
        border-left: 4px solid #f59e0b;
        padding: 15px;
        margin: 20px 0;
        border-radius: 4px;
      }
      .success {
        background: #d1fae5;
        border-left: 4px solid #10b981;
      }
      .bdp-notice {
        background: #dbeafe;
        border-left: 4px solid #3b82f6;
        padding: 12px;
        margin: 20px 0;
        border-radius: 4px;
        font-size: 12px;
      }
    </style>
  `;
}

export function generate24HourReminderEmail(lesson: LessonDetails, _recipientEmail: string): EmailTemplate {
  const config = getEmailConfig();

  const subject = `Reminder: Your driving lesson tomorrow at ${lesson.lessonTime}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${getBaseStyles()}
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0; font-size: 28px;">📅 Lesson Reminder</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Tomorrow at ${lesson.lessonTime}</p>
      </div>

      <div class="content">
        <p>Hi ${lesson.studentName},</p>

        <p>This is a friendly reminder that you have a driving lesson scheduled for <strong>tomorrow</strong>.</p>

        <div class="lesson-details">
          <div class="detail-row">
            <span class="detail-label">📅 Date:</span>
            <span class="detail-value">${lesson.lessonDate}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">🕐 Time:</span>
            <span class="detail-value">${lesson.lessonTime}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">⏱️ Duration:</span>
            <span class="detail-value">${lesson.duration} minutes</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">👨‍🏫 Instructor:</span>
            <span class="detail-value">${lesson.instructorName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">📚 Lesson Type:</span>
            <span class="detail-value">${lesson.lessonType}</span>
          </div>
          ${lesson.vehicleInfo ? `
          <div class="detail-row">
            <span class="detail-label">🚗 Vehicle:</span>
            <span class="detail-value">${lesson.vehicleInfo}</span>
          </div>
          ` : ''}
        </div>

        <div class="alert">
          <strong>⏰ Please arrive 5-10 minutes early</strong><br>
          This allows time for a pre-lesson briefing and vehicle inspection.
        </div>

        <p><strong>What to bring:</strong></p>
        <ul>
          <li>Valid learner's permit or driver's license</li>
          <li>Comfortable clothing and closed-toe shoes</li>
          <li>Any required prescription eyewear</li>
        </ul>

        <p>If you need to cancel or reschedule, please contact us as soon as possible.</p>

        <p>See you tomorrow!<br>
        <strong>${config.from.name}</strong></p>

        <div class="bdp-notice">
          <strong>💎 Powered by Budget Drive Protocol (BDP)</strong><br>
          This notification was sent using the BSV blockchain micropayment system.
          Cost: 1 satoshi (~$0.0000005 USD) • Transparent • Scalable
        </div>
      </div>

      <div class="footer">
        <p>${config.from.name}<br>
        Email: ${config.from.email}</p>
        <p style="margin-top: 10px;">You're receiving this because you have an upcoming lesson.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
Reminder: Your driving lesson tomorrow at ${lesson.lessonTime}

Hi ${lesson.studentName},

This is a friendly reminder that you have a driving lesson scheduled for tomorrow.

LESSON DETAILS:
- Date: ${lesson.lessonDate}
- Time: ${lesson.lessonTime}
- Duration: ${lesson.duration} minutes
- Instructor: ${lesson.instructorName}
- Lesson Type: ${lesson.lessonType}
${lesson.vehicleInfo ? `- Vehicle: ${lesson.vehicleInfo}` : ''}

Please arrive 5-10 minutes early for a pre-lesson briefing.

What to bring:
- Valid learner's permit or driver's license
- Comfortable clothing and closed-toe shoes
- Any required prescription eyewear

If you need to cancel or reschedule, please contact us as soon as possible.

See you tomorrow!
${config.from.name}
${config.from.email}

---
Powered by Budget Drive Protocol (BDP) • 1 satoshi per notification
  `;

  return { subject, html, text };
}

export function generate1HourReminderEmail(lesson: LessonDetails, _recipientEmail: string): EmailTemplate {
  const config = getEmailConfig();

  const subject = `⏰ Your lesson starts in 1 hour! (${lesson.lessonTime})`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${getBaseStyles()}
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0; font-size: 28px;">⏰ Lesson Starting Soon!</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">In 1 hour at ${lesson.lessonTime}</p>
      </div>

      <div class="content">
        <p>Hi ${lesson.studentName},</p>

        <p>Your driving lesson starts in <strong>1 hour</strong>!</p>

        <div class="lesson-details">
          <div class="detail-row">
            <span class="detail-label">🕐 Time:</span>
            <span class="detail-value">${lesson.lessonTime} (${lesson.lessonDate})</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">👨‍🏫 Instructor:</span>
            <span class="detail-value">${lesson.instructorName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">⏱️ Duration:</span>
            <span class="detail-value">${lesson.duration} minutes</span>
          </div>
        </div>

        <div class="alert">
          <strong>🚗 Time to head out!</strong><br>
          Make sure to arrive a few minutes early for the pre-lesson briefing.
        </div>

        <p><strong>Quick checklist:</strong></p>
        <ul>
          <li>✅ Learner's permit or license</li>
          <li>✅ Comfortable shoes (no flip-flops)</li>
          <li>✅ Glasses/contacts if needed</li>
        </ul>

        <p>Your instructor ${lesson.instructorName} is looking forward to seeing you!</p>

        <p>Drive safe!<br>
        <strong>${config.from.name}</strong></p>
      </div>

      <div class="footer">
        <p>${config.from.name}<br>
        Email: ${config.from.email}</p>
        <p style="margin-top: 10px;">Powered by Budget Drive Protocol (BDP) • BSV Blockchain</p>
      </div>
    </body>
    </html>
  `;

  const text = `
⏰ Your lesson starts in 1 hour! (${lesson.lessonTime})

Hi ${lesson.studentName},

Your driving lesson starts in 1 hour!

LESSON DETAILS:
- Time: ${lesson.lessonTime} (${lesson.lessonDate})
- Instructor: ${lesson.instructorName}
- Duration: ${lesson.duration} minutes

Quick checklist:
✅ Learner's permit or license
✅ Comfortable shoes (no flip-flops)
✅ Glasses/contacts if needed

Your instructor ${lesson.instructorName} is looking forward to seeing you!

Drive safe!
${config.from.name}
${config.from.email}
  `;

  return { subject, html, text };
}

export function generateBookingConfirmationEmail(lesson: LessonDetails, _recipientEmail: string): EmailTemplate {
  const config = getEmailConfig();

  const subject = `✅ Lesson Confirmed - ${lesson.lessonDate} at ${lesson.lessonTime}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${getBaseStyles()}
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0; font-size: 28px;">✅ Booking Confirmed!</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your lesson has been scheduled</p>
      </div>

      <div class="content">
        <p>Hi ${lesson.studentName},</p>

        <p>Great news! Your driving lesson has been successfully booked.</p>

        <div class="lesson-details">
          <div class="detail-row">
            <span class="detail-label">📅 Date:</span>
            <span class="detail-value">${lesson.lessonDate}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">🕐 Time:</span>
            <span class="detail-value">${lesson.lessonTime}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">⏱️ Duration:</span>
            <span class="detail-value">${lesson.duration} minutes</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">👨‍🏫 Instructor:</span>
            <span class="detail-value">${lesson.instructorName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">📚 Lesson Type:</span>
            <span class="detail-value">${lesson.lessonType}</span>
          </div>
          ${lesson.vehicleInfo ? `
          <div class="detail-row">
            <span class="detail-label">🚗 Vehicle:</span>
            <span class="detail-value">${lesson.vehicleInfo}</span>
          </div>
          ` : ''}
          ${lesson.cost ? `
          <div class="detail-row">
            <span class="detail-label">💰 Cost:</span>
            <span class="detail-value">$${lesson.cost.toFixed(2)}</span>
          </div>
          ` : ''}
        </div>

        <div class="alert success">
          <strong>📧 You'll receive reminders</strong><br>
          We'll send you a reminder 24 hours before and 1 hour before your lesson.
        </div>

        <p><strong>What to bring:</strong></p>
        <ul>
          <li>Valid learner's permit or driver's license</li>
          <li>Comfortable clothing and closed-toe shoes</li>
          <li>Any required prescription eyewear</li>
        </ul>

        <p>If you need to cancel or reschedule, please contact us at least 24 hours in advance.</p>

        <p>We're excited to help you on your journey to becoming a confident driver!</p>

        <p>Best regards,<br>
        <strong>${config.from.name}</strong></p>

        <div class="bdp-notice">
          <strong>💎 Powered by Budget Drive Protocol (BDP)</strong><br>
          This booking generated a 5 satoshi fee on the BSV blockchain.
          Transparent • Scalable • No middlemen
        </div>
      </div>

      <div class="footer">
        <p>${config.from.name}<br>
        Email: ${config.from.email}</p>
        <p style="margin-top: 10px;">You're receiving this because you booked a lesson with us.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
✅ Lesson Confirmed - ${lesson.lessonDate} at ${lesson.lessonTime}

Hi ${lesson.studentName},

Great news! Your driving lesson has been successfully booked.

LESSON DETAILS:
- Date: ${lesson.lessonDate}
- Time: ${lesson.lessonTime}
- Duration: ${lesson.duration} minutes
- Instructor: ${lesson.instructorName}
- Lesson Type: ${lesson.lessonType}
${lesson.vehicleInfo ? `- Vehicle: ${lesson.vehicleInfo}` : ''}
${lesson.cost ? `- Cost: $${lesson.cost.toFixed(2)}` : ''}

You'll receive reminders 24 hours and 1 hour before your lesson.

What to bring:
- Valid learner's permit or driver's license
- Comfortable clothing and closed-toe shoes
- Any required prescription eyewear

If you need to cancel or reschedule, please contact us at least 24 hours in advance.

We're excited to help you on your journey to becoming a confident driver!

Best regards,
${config.from.name}
${config.from.email}

---
Powered by Budget Drive Protocol (BDP) • 5 sats per booking • BSV Blockchain
  `;

  return { subject, html, text };
}

export function generateCancellationEmail(lesson: LessonDetails, _recipientEmail: string, reason?: string): EmailTemplate {
  const config = getEmailConfig();

  const subject = `❌ Lesson Cancelled - ${lesson.lessonDate} at ${lesson.lessonTime}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${getBaseStyles()}
    </head>
    <body>
      <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
        <h1 style="margin: 0; font-size: 28px;">❌ Lesson Cancelled</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Scheduled for ${lesson.lessonDate}</p>
      </div>

      <div class="content">
        <p>Hi ${lesson.studentName},</p>

        <p>We're writing to inform you that your driving lesson has been <strong>cancelled</strong>.</p>

        <div class="lesson-details">
          <div class="detail-row">
            <span class="detail-label">📅 Date:</span>
            <span class="detail-value">${lesson.lessonDate}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">🕐 Time:</span>
            <span class="detail-value">${lesson.lessonTime}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">👨‍🏫 Instructor:</span>
            <span class="detail-value">${lesson.instructorName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">📚 Lesson Type:</span>
            <span class="detail-value">${lesson.lessonType}</span>
          </div>
        </div>

        ${reason ? `
        <div class="alert">
          <strong>Reason for cancellation:</strong><br>
          ${reason}
        </div>
        ` : ''}

        <p><strong>Need to reschedule?</strong></p>
        <p>Contact us to book a new lesson at a time that works for you.</p>

        <p>We apologize for any inconvenience this may have caused.</p>

        <p>Best regards,<br>
        <strong>${config.from.name}</strong></p>
      </div>

      <div class="footer">
        <p>${config.from.name}<br>
        Email: ${config.from.email}</p>
        <p style="margin-top: 10px;">Questions? Contact us anytime.</p>
      </div>
    </body>
    </html>
  `;

  const text = `
❌ Lesson Cancelled - ${lesson.lessonDate} at ${lesson.lessonTime}

Hi ${lesson.studentName},

We're writing to inform you that your driving lesson has been cancelled.

CANCELLED LESSON DETAILS:
- Date: ${lesson.lessonDate}
- Time: ${lesson.lessonTime}
- Instructor: ${lesson.instructorName}
- Lesson Type: ${lesson.lessonType}

${reason ? `Reason for cancellation: ${reason}` : ''}

Need to reschedule?
Contact us to book a new lesson at a time that works for you.

We apologize for any inconvenience this may have caused.

Best regards,
${config.from.name}
${config.from.email}
  `;

  return { subject, html, text };
}
