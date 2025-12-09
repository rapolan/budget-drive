/**
 * Lesson Calendar Invite Service
 * Sends email invitations with ICS attachments when lessons are created
 */

import { createEmailTransporter, getEmailConfig } from '../config/email';
import { query } from '../config/database';

interface LessonInviteData {
  lessonId: string;
  studentName: string;
  studentPhone: string;
  instructorName: string;
  instructorEmail: string;
  lessonDate: string; // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  lessonType: string;
  duration: number;   // in minutes
  lessonNumber?: number | null;
  hoursRequired?: number | null;
  pickupAddress?: string;
  notes?: string;
  tenantName?: string;
}

/**
 * Format time from HH:MM to readable format (e.g., "2:00 PM")
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format date to readable format (e.g., "Tuesday, December 10, 2025")
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate ICS calendar file content for a lesson
 */
function generateICSContent(data: LessonInviteData): string {
  const uid = `lesson-${data.lessonId}@budgetdrivingschool.com`;
  
  // Convert date and time to ICS format (YYYYMMDDTHHMMSS)
  const dateStr = data.lessonDate.replace(/-/g, '');
  const startTime = data.startTime.replace(':', '') + '00';
  const endTime = data.endTime.replace(':', '') + '00';
  
  // Build description
  const descriptionParts = [
    `Student: ${data.studentName}`,
    `Phone: ${data.studentPhone}`,
  ];
  
  // Add lesson number info if available
  if (data.lessonNumber && data.hoursRequired) {
    const estimatedTotalLessons = Math.ceil(data.hoursRequired / 2);
    descriptionParts.push(`Lesson: ${data.lessonNumber} of ${estimatedTotalLessons}`);
  } else if (data.lessonNumber) {
    descriptionParts.push(`Lesson: #${data.lessonNumber}`);
  }
  
  descriptionParts.push(`Lesson Type: ${data.lessonType}`);
  descriptionParts.push(`Duration: ${data.duration} minutes`);
  
  if (data.pickupAddress) {
    descriptionParts.push(`Pickup Address: ${data.pickupAddress}`);
  }
  if (data.notes) {
    descriptionParts.push(`Notes: ${data.notes}`);
  }
  
  const description = descriptionParts.join('\\n');
  const location = data.pickupAddress || '';
  
  // Build summary with lesson number if available
  const lessonLabel = data.lessonNumber 
    ? `Lesson #${data.lessonNumber}` 
    : 'Driving Lesson';
  const summary = `🚗 ${lessonLabel} - ${data.studentName}`;

  // Build ICS content
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Budget Driving School//Lesson Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VTIMEZONE',
    'TZID:America/Los_Angeles',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0800',
    'TZOFFSETTO:-0700',
    'TZNAME:PDT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0700',
    'TZOFFSETTO:-0800',
    'TZNAME:PST',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;TZID=America/Los_Angeles:${dateStr}T${startTime}`,
    `DTEND;TZID=America/Los_Angeles:${dateStr}T${endTime}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:${escapeICS(location)}`,
    'STATUS:CONFIRMED',
    `ORGANIZER;CN=${data.tenantName || 'Budget Driving School'}:mailto:${getEmailConfig().from.email}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE;CN=${data.instructorName}:mailto:${data.instructorEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/**
 * Escape special characters for ICS format
 */
function escapeICS(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate HTML email content for lesson invite
 */
function generateEmailHTML(data: LessonInviteData): string {
  const formattedDate = formatDate(data.lessonDate);
  const formattedStartTime = formatTime(data.startTime);
  const formattedEndTime = formatTime(data.endTime);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Lesson Scheduled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">📅 New Lesson Scheduled</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">A new driving lesson has been assigned to you</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <p>Hi ${data.instructorName},</p>
    <p>You have a new driving lesson scheduled:</p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Student</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${data.studentName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Phone</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${data.studentPhone}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Date</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Time</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${formattedStartTime} - ${formattedEndTime}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Duration</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${data.duration} minutes</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Lesson Type</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${data.lessonType.replace(/_/g, ' ')}</td>
        </tr>
        ${data.pickupAddress ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Pickup Location</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${data.pickupAddress}</td>
        </tr>
        ` : ''}
        ${data.notes ? `
        <tr>
          <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Notes</td>
          <td style="padding: 8px 0; text-align: right;">${data.notes}</td>
        </tr>
        ` : ''}
      </table>
    </div>
    
    <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <strong>📎 Calendar Invite Attached</strong>
      <p style="margin: 5px 0 0 0; font-size: 14px; color: #1e40af;">
        Open the attached .ics file to add this lesson to your calendar (Google Calendar, Apple Calendar, Outlook, etc.)
      </p>
    </div>
  </div>
  
  <div style="background: #f9fafb; padding: 20px 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
    <p style="margin: 0;">This is an automated message from ${data.tenantName || 'Budget Driving School'}</p>
  </div>
</body>
</html>
`;
}

/**
 * Generate plain text email content
 */
function generateEmailText(data: LessonInviteData): string {
  const formattedDate = formatDate(data.lessonDate);
  const formattedStartTime = formatTime(data.startTime);
  const formattedEndTime = formatTime(data.endTime);

  return `
New Lesson Scheduled
====================

Hi ${data.instructorName},

You have a new driving lesson scheduled:

Student: ${data.studentName}
Phone: ${data.studentPhone}
Date: ${formattedDate}
Time: ${formattedStartTime} - ${formattedEndTime}
Duration: ${data.duration} minutes
Lesson Type: ${data.lessonType.replace(/_/g, ' ')}
${data.pickupAddress ? `Pickup Location: ${data.pickupAddress}` : ''}
${data.notes ? `Notes: ${data.notes}` : ''}

📎 A calendar invite (.ics file) is attached to this email.
Open it to add this lesson to your calendar.

---
This is an automated message from ${data.tenantName || 'Budget Driving School'}
`;
}

/**
 * Send lesson invite email to instructor
 */
export async function sendLessonInviteEmail(data: LessonInviteData): Promise<boolean> {
  try {
    const config = getEmailConfig();
    
    // Check if email is configured
    if (!config.auth.user || !config.auth.pass) {
      console.warn('⚠️  [LessonInvite] Email not configured, skipping invite email');
      return false;
    }

    const transporter = createEmailTransporter();
    
    const formattedDate = formatDate(data.lessonDate);
    const formattedTime = formatTime(data.startTime);
    
    // Generate ICS content
    const icsContent = generateICSContent(data);
    
    // Send email with ICS attachment
    await transporter.sendMail({
      from: `"${config.from.name}" <${config.from.email}>`,
      to: data.instructorEmail,
      subject: `📅 New Lesson Scheduled - ${formattedDate} at ${formattedTime}`,
      html: generateEmailHTML(data),
      text: generateEmailText(data),
      attachments: [
        {
          filename: `lesson-${data.lessonDate}.ics`,
          content: icsContent,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
        },
      ],
      // Special headers for calendar invite
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8; method=REQUEST',
      },
      alternatives: [
        {
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          content: icsContent,
        },
      ],
    });

    console.log(`✅ [LessonInvite] Email sent to ${data.instructorEmail} for lesson ${data.lessonId}`);
    return true;
  } catch (error) {
    console.error('❌ [LessonInvite] Failed to send email:', error);
    return false;
  }
}

/**
 * Get full lesson data and send invite email
 */
export async function sendLessonInviteForLesson(
  lessonId: string,
  tenantId: string
): Promise<boolean> {
  try {
    // Get lesson details with student and instructor info
    const result = await query(
      `SELECT 
        l.id,
        l.date as lesson_date,
        l.start_time,
        l.end_time,
        l.duration,
        l.lesson_type,
        l.lesson_number,
        l.pickup_address,
        l.notes,
        s.full_name as student_name,
        s.phone as student_phone,
        s.hours_required,
        i.full_name as instructor_name,
        i.email as instructor_email,
        t.name as tenant_name
       FROM lessons l
       JOIN students s ON l.student_id = s.id
       JOIN instructors i ON l.instructor_id = i.id
       LEFT JOIN tenants t ON l.tenant_id = t.id
       WHERE l.id = $1 AND l.tenant_id = $2`,
      [lessonId, tenantId]
    );

    if (result.rows.length === 0) {
      console.warn(`⚠️  [LessonInvite] Lesson ${lessonId} not found`);
      return false;
    }

    const lesson = result.rows[0];

    // Build invite data
    const inviteData: LessonInviteData = {
      lessonId: lesson.id,
      studentName: lesson.student_name,
      studentPhone: lesson.student_phone || 'Not provided',
      instructorName: lesson.instructor_name,
      instructorEmail: lesson.instructor_email,
      lessonDate: lesson.lesson_date instanceof Date 
        ? lesson.lesson_date.toISOString().split('T')[0]
        : lesson.lesson_date,
      startTime: lesson.start_time,
      endTime: lesson.end_time,
      lessonType: lesson.lesson_type,
      duration: lesson.duration,
      lessonNumber: lesson.lesson_number || null,
      hoursRequired: lesson.hours_required ? parseFloat(lesson.hours_required) : null,
      pickupAddress: lesson.pickup_address,
      notes: lesson.notes,
      tenantName: lesson.tenant_name,
    };

    return await sendLessonInviteEmail(inviteData);
  } catch (error) {
    console.error('❌ [LessonInvite] Error getting lesson data:', error);
    return false;
  }
}

export default {
  sendLessonInviteEmail,
  sendLessonInviteForLesson,
};
