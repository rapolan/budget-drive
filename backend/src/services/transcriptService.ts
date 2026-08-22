/**
 * Transcript Service
 *
 * 13 CCR §340.27 entitles a minor who withdraws before completing their
 * program to a transcript of training received. Generated on demand from
 * an enrollment's own record - not queued, not restricted to withdrawn
 * enrollments specifically, and not age-gated: it's simply a record of
 * training received, always safe to produce on request for any
 * driver_training enrollment that isn't completed.
 *
 * Hand-rolled plain-text document, following calendarFeedService's own
 * generateICSFeed precedent exactly (no PDF library anywhere in this
 * repo - introducing one needs prior approval per CLAUDE.md).
 */

import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone, formatInTenantZone } from '../utils/tenantTime';

export interface WithdrawalTranscript {
  filename: string;
  content: string;
}

export const generateWithdrawalTranscript = async (
  enrollmentId: string,
  tenantId: string
): Promise<WithdrawalTranscript> => {
  const enrollmentResult = await query(
    `SELECT e.*, s.full_name AS student_name, s.date_of_birth
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE e.id = $1 AND e.tenant_id = $2`,
    [enrollmentId, tenantId]
  );
  if (enrollmentResult.rows.length === 0) {
    throw new AppError('Enrollment not found', 404);
  }
  const enrollment = enrollmentResult.rows[0];

  if (enrollment.program_type !== 'driver_training') {
    throw new AppError('A training-received transcript is only available for driver_training enrollments', 400);
  }
  if (enrollment.completed) {
    throw new AppError('A completed enrollment does not need a training-received transcript - see its certificate instead', 400);
  }

  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);

  const lessonsResult = await query(
    `SELECT l.date, l.start_time, l.end_time, l.duration, l.status, i.full_name AS instructor_name
     FROM lessons l
     LEFT JOIN instructors i ON i.id = l.instructor_id
     WHERE l.enrollment_id = $1 AND l.tenant_id = $2
     ORDER BY l.date ASC, l.start_time ASC`,
    [enrollmentId, tenantId]
  );

  const completedLessons = lessonsResult.rows.filter((l: any) => l.status === 'completed');
  const totalHours = completedLessons.reduce((sum: number, l: any) => sum + parseFloat(l.duration) / 60, 0);

  const now = new Date();
  const lines: string[] = [
    'TRAINING RECEIVED TRANSCRIPT',
    '13 CCR §340.27',
    '',
    `Student: ${enrollment.student_name}`,
    `Program: Driver Training`,
    `Enrollment date: ${formatDateOnly(enrollment.enrollment_date)}`,
  ];

  if (enrollment.status === 'withdrawn') {
    lines.push(
      `Withdrawn: ${enrollment.withdrawn_at ? formatInTenantZone(new Date(enrollment.withdrawn_at), timezone) : 'unknown date'}`,
      `Withdrawal reason: ${enrollment.withdrawn_reason || 'not recorded'}`
    );
  } else {
    lines.push(`Status: ${enrollment.status}`);
  }

  lines.push('', 'LESSONS', '');

  if (lessonsResult.rows.length === 0) {
    lines.push('No lessons recorded for this enrollment.');
  } else {
    for (const lesson of lessonsResult.rows) {
      const dateStr = formatDateOnly(lesson.date);
      lines.push(
        `${dateStr}  ${lesson.start_time.slice(0, 5)}-${lesson.end_time.slice(0, 5)}  ` +
        `${lesson.duration} min  ${lesson.status}  ${lesson.instructor_name || 'Unassigned'}`
      );
    }
  }

  lines.push(
    '',
    `Total completed hours: ${totalHours.toFixed(2)}`,
    '',
    `Generated: ${formatInTenantZone(now, timezone, 'yyyy-MM-dd HH:mm')} (${timezone})`
  );

  const filenameDate = formatInTenantZone(now, timezone);
  const filenameSafeName = enrollment.student_name.replace(/[^a-zA-Z0-9]+/g, '-');

  return {
    filename: `transcript-${filenameSafeName}-${filenameDate}.txt`,
    content: lines.join('\n'),
  };
};

// lesson.date and enrollment.enrollment_date are plain DATE columns (no
// time component) - a Date instance pg returns for one is always UTC
// midnight of that calendar date, so this split carries no roll risk (same
// reasoning calendarFeedService documents for its own identical case).
function formatDateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().split('T')[0] : String(value).split('T')[0];
}
