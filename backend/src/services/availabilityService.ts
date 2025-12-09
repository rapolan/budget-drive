/**
 * Availability Service
 * Manages instructor availability schedules and time off
 */

import { query } from '../config/database';
import { InstructorAvailability, InstructorTimeOff, SchedulingSettings } from '../types';
import { AppError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('AvailabilityService');

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Transform snake_case database row to camelCase TypeScript object
 */
const transformAvailability = (row: any): InstructorAvailability => ({
  id: row.id,
  tenantId: row.tenant_id,
  instructorId: row.instructor_id,
  dayOfWeek: row.day_of_week,
  startTime: row.start_time,
  endTime: row.end_time,
  maxStudents: row.max_students,
  isActive: row.is_active,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// =====================================================
// INSTRUCTOR AVAILABILITY (RECURRING SCHEDULE)
// =====================================================

export const getInstructorAvailability = async (
  instructorId: string,
  tenantId: string
): Promise<InstructorAvailability[]> => {
  logger.debug('Fetching instructor availability', { tenantId, instructorId });

  const result = await query(
    `SELECT * FROM instructor_availability
     WHERE instructor_id = $1 AND tenant_id = $2 AND is_active = true
     ORDER BY day_of_week, start_time`,
    [instructorId, tenantId]
  );

  logger.debug('Successfully fetched instructor availability', {
    tenantId,
    instructorId,
    count: result.rows.length,
  });

  return result.rows.map(transformAvailability);
};

export const getAllInstructorsAvailability = async (
  tenantId: string
): Promise<InstructorAvailability[]> => {
  logger.debug('Fetching all instructors availability', { tenantId });

  const result = await query(
    `SELECT * FROM instructor_availability
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY instructor_id, day_of_week, start_time`,
    [tenantId]
  );

  logger.debug('Successfully fetched all instructors availability', {
    tenantId,
    count: result.rows.length,
  });

  return result.rows.map(transformAvailability);
};

export const createAvailability = async (
  tenantId: string,
  instructorId: string,
  data: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    maxStudents?: number | null;
    notes?: string;
  }
): Promise<InstructorAvailability> => {
  logger.info('Creating instructor availability', {
    tenantId,
    instructorId,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
  });

  // Validate instructor belongs to tenant
  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
    logger.error('Instructor not found for availability creation', undefined, {
      tenantId,
      instructorId,
    });
    throw new AppError('Instructor not found or does not belong to this organization', 404);
  }

  // Validate day of week
  if (data.dayOfWeek < 0 || data.dayOfWeek > 6) {
    logger.warn('Invalid day of week for availability', {
      tenantId,
      instructorId,
      dayOfWeek: data.dayOfWeek,
    });
    throw new AppError('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)', 400);
  }

  // Validate time format and logic
  if (data.startTime >= data.endTime) {
    logger.warn('Invalid time range for availability', {
      tenantId,
      instructorId,
      startTime: data.startTime,
      endTime: data.endTime,
    });
    throw new AppError('startTime must be before endTime', 400);
  }

  const result = await query(
    `INSERT INTO instructor_availability (
      tenant_id, instructor_id, day_of_week, start_time, end_time, max_students, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [tenantId, instructorId, data.dayOfWeek, data.startTime, data.endTime, data.maxStudents ?? null, data.notes || null]
  );

  const availability = transformAvailability(result.rows[0]);
  logger.info('Successfully created instructor availability', {
    tenantId,
    instructorId,
    availabilityId: availability.id,
  });

  return availability;
};

export const updateAvailability = async (
  id: string,
  tenantId: string,
  data: Partial<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    maxStudents: number | null;
    isActive: boolean;
    notes: string;
  }>
): Promise<InstructorAvailability> => {
  logger.debug('Updating instructor availability', {
    tenantId,
    availabilityId: id,
    updates: Object.keys(data),
  });

  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.dayOfWeek !== undefined) {
    if (data.dayOfWeek < 0 || data.dayOfWeek > 6) {
      logger.warn('Invalid day of week for availability update', {
        tenantId,
        availabilityId: id,
        dayOfWeek: data.dayOfWeek,
      });
      throw new AppError('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)', 400);
    }
    fields.push(`day_of_week = $${paramCount++}`);
    values.push(data.dayOfWeek);
  }
  if (data.startTime !== undefined) {
    fields.push(`start_time = $${paramCount++}`);
    values.push(data.startTime);
  }
  if (data.endTime !== undefined) {
    fields.push(`end_time = $${paramCount++}`);
    values.push(data.endTime);
  }
  if (data.maxStudents !== undefined) {
    fields.push(`max_students = $${paramCount++}`);
    values.push(data.maxStudents);
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = $${paramCount++}`);
    values.push(data.isActive);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramCount++}`);
    values.push(data.notes);
  }

  if (fields.length === 0) {
    logger.warn('No fields provided for availability update', {
      tenantId,
      availabilityId: id,
    });
    throw new AppError('No fields to update', 400);
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE instructor_availability SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    logger.warn('Availability not found for update', {
      tenantId,
      availabilityId: id,
    });
    throw new AppError('Availability not found', 404);
  }

  logger.info('Successfully updated instructor availability', {
    tenantId,
    availabilityId: id,
  });

  return transformAvailability(result.rows[0]);
};

export const deleteAvailability = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Deleting instructor availability (soft delete)', {
    tenantId,
    availabilityId: id,
  });

  // Soft delete - set is_active to false
  const result = await query(
    `UPDATE instructor_availability SET is_active = false
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.warn('Availability not found for deletion', {
      tenantId,
      availabilityId: id,
    });
    throw new AppError('Availability not found', 404);
  }

  logger.info('Successfully deleted instructor availability', {
    tenantId,
    availabilityId: id,
  });
};

export const setInstructorSchedule = async (
  tenantId: string,
  instructorId: string,
  schedule: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    notes?: string;
  }>
): Promise<InstructorAvailability[]> => {
  logger.info('Setting instructor schedule', {
    tenantId,
    instructorId,
    scheduleEntries: schedule.length,
  });

  // Validate instructor
  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
    logger.error('Instructor not found for schedule setting', undefined, {
      tenantId,
      instructorId,
    });
    throw new AppError('Instructor not found or does not belong to this organization', 404);
  }

  // Deactivate all existing availability for this instructor
  await query(
    'UPDATE instructor_availability SET is_active = false WHERE instructor_id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );

  // Insert new schedule
  const availabilities: InstructorAvailability[] = [];
  for (const entry of schedule) {
    const result = await query(
      `INSERT INTO instructor_availability (
        tenant_id, instructor_id, day_of_week, start_time, end_time, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [tenantId, instructorId, entry.dayOfWeek, entry.startTime, entry.endTime, entry.notes || null]
    );
    availabilities.push(transformAvailability(result.rows[0]));
  }

  logger.info('Successfully set instructor schedule', {
    tenantId,
    instructorId,
    createdEntries: availabilities.length,
  });

  return availabilities;
};

// =====================================================
// TIME OFF / UNAVAILABILITY
// =====================================================

/**
 * Transform snake_case database row to camelCase TypeScript object
 */
const transformTimeOff = (row: any): InstructorTimeOff => ({
  id: row.id,
  tenantId: row.tenant_id,
  instructorId: row.instructor_id,
  startDate: row.start_date,
  endDate: row.end_date,
  startTime: row.start_time,
  endTime: row.end_time,
  reason: row.reason,
  notes: row.notes,
  isApproved: row.is_approved,
  approvedBy: row.approved_by,
  approvedAt: row.approved_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getInstructorTimeOff = async (
  instructorId: string,
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<InstructorTimeOff[]> => {
  logger.debug('Fetching instructor time off', {
    tenantId,
    instructorId,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
  });

  let queryText = `
    SELECT * FROM instructor_time_off
    WHERE instructor_id = $1 AND tenant_id = $2
  `;
  const params: any[] = [instructorId, tenantId];
  let paramCount = 3;

  if (startDate) {
    queryText += ` AND end_date >= $${paramCount++}`;
    params.push(startDate);
  }
  if (endDate) {
    queryText += ` AND start_date <= $${paramCount++}`;
    params.push(endDate);
  }

  queryText += ' ORDER BY start_date, start_time';

  const result = await query(queryText, params);

  logger.debug('Successfully fetched instructor time off', {
    tenantId,
    instructorId,
    count: result.rows.length,
  });

  return result.rows.map(transformTimeOff);
};

export const createTimeOff = async (
  tenantId: string,
  instructorId: string,
  data: {
    startDate: Date;
    endDate: Date;
    startTime?: string;
    endTime?: string;
    reason: string;
    notes?: string;
    isApproved?: boolean;
    approvedBy?: string;
  }
): Promise<InstructorTimeOff> => {
  logger.info('Creating instructor time off', {
    tenantId,
    instructorId,
    startDate: data.startDate,
    endDate: data.endDate,
    reason: data.reason,
  });

  // Validate instructor
  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
    logger.error('Instructor not found for time off creation', undefined, {
      tenantId,
      instructorId,
    });
    throw new AppError('Instructor not found or does not belong to this organization', 404);
  }

  // Validate dates
  if (data.startDate > data.endDate) {
    logger.warn('Invalid date range for time off', {
      tenantId,
      instructorId,
      startDate: data.startDate,
      endDate: data.endDate,
    });
    throw new AppError('startDate must be before or equal to endDate', 400);
  }

  const result = await query(
    `INSERT INTO instructor_time_off (
      tenant_id, instructor_id, start_date, end_date, start_time, end_time,
      reason, notes, is_approved, approved_by, approved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      tenantId,
      instructorId,
      data.startDate,
      data.endDate,
      data.startTime || null,
      data.endTime || null,
      data.reason,
      data.notes || null,
      data.isApproved !== undefined ? data.isApproved : true,
      data.approvedBy || null,
      data.isApproved ? new Date() : null,
    ]
  );

  const timeOff = transformTimeOff(result.rows[0]);
  logger.info('Successfully created instructor time off', {
    tenantId,
    instructorId,
    timeOffId: timeOff.id,
    isApproved: timeOff.isApproved,
  });

  return timeOff;
};

export const updateTimeOff = async (
  id: string,
  tenantId: string,
  data: Partial<InstructorTimeOff>
): Promise<InstructorTimeOff> => {
  logger.debug('Updating instructor time off', {
    tenantId,
    timeOffId: id,
    updates: Object.keys(data),
  });

  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.startDate !== undefined) {
    fields.push(`start_date = $${paramCount++}`);
    values.push(data.startDate);
  }
  if (data.endDate !== undefined) {
    fields.push(`end_date = $${paramCount++}`);
    values.push(data.endDate);
  }
  if (data.startTime !== undefined) {
    fields.push(`start_time = $${paramCount++}`);
    values.push(data.startTime);
  }
  if (data.endTime !== undefined) {
    fields.push(`end_time = $${paramCount++}`);
    values.push(data.endTime);
  }
  if (data.reason !== undefined) {
    fields.push(`reason = $${paramCount++}`);
    values.push(data.reason);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramCount++}`);
    values.push(data.notes);
  }
  if (data.isApproved !== undefined) {
    fields.push(`is_approved = $${paramCount++}`);
    values.push(data.isApproved);
    if (data.isApproved) {
      fields.push(`approved_at = NOW()`);
    }
  }
  if (data.approvedBy !== undefined) {
    fields.push(`approved_by = $${paramCount++}`);
    values.push(data.approvedBy);
  }

  if (fields.length === 0) {
    logger.warn('No fields provided for time off update', {
      tenantId,
      timeOffId: id,
    });
    throw new AppError('No fields to update', 400);
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE instructor_time_off SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    logger.warn('Time off not found for update', {
      tenantId,
      timeOffId: id,
    });
    throw new AppError('Time off not found', 404);
  }

  logger.info('Successfully updated instructor time off', {
    tenantId,
    timeOffId: id,
  });

  return transformTimeOff(result.rows[0]);
};

export const deleteTimeOff = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Deleting instructor time off', {
    tenantId,
    timeOffId: id,
  });

  const result = await query(
    'DELETE FROM instructor_time_off WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.warn('Time off not found for deletion', {
      tenantId,
      timeOffId: id,
    });
    throw new AppError('Time off not found', 404);
  }

  logger.info('Successfully deleted instructor time off', {
    tenantId,
    timeOffId: id,
  });
};

// =====================================================
// SCHEDULING SETTINGS
// =====================================================

/**
 * Transform snake_case database row to camelCase TypeScript object
 */
const transformSchedulingSettings = (row: any): SchedulingSettings => ({
  id: row.id,
  tenantId: row.tenant_id,
  bufferTimeBetweenLessons: row.buffer_time_between_lessons,
  bufferTimeBeforeFirstLesson: row.buffer_time_before_first_lesson,
  bufferTimeAfterLastLesson: row.buffer_time_after_last_lesson,
  minHoursAdvanceBooking: row.min_hours_advance_booking,
  maxDaysAdvanceBooking: row.max_days_advance_booking,
  defaultLessonDuration: row.default_lesson_duration,
  defaultMaxStudentsPerDay: row.default_max_students_per_day ?? 3, // Fallback to 3 if null
  lessonDurationTemplates: row.lesson_duration_templates ?? [
    { name: 'Quick (1 hour)', minutes: 60 },
    { name: 'Standard (2 hours)', minutes: 120 },
    { name: 'Extended (2.5 hours)', minutes: 150 },
    { name: 'Intensive (3 hours)', minutes: 180 }
  ], // Fallback to default templates if null
  allowBackToBackLessons: row.allow_back_to_back_lessons,
  defaultWorkStartTime: row.default_work_start_time,
  defaultWorkEndTime: row.default_work_end_time,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getSchedulingSettings = async (
  tenantId: string
): Promise<SchedulingSettings> => {
  logger.debug('Fetching scheduling settings', { tenantId });

  const result = await query(
    'SELECT * FROM scheduling_settings WHERE tenant_id = $1',
    [tenantId]
  );

  if (result.rows.length === 0) {
    logger.info('Creating default scheduling settings', { tenantId });
    // Create default settings if none exist
    const createResult = await query(
      `INSERT INTO scheduling_settings (tenant_id)
       VALUES ($1)
       RETURNING *`,
      [tenantId]
    );
    logger.info('Successfully created default scheduling settings', { tenantId });
    return transformSchedulingSettings(createResult.rows[0]);
  }

  logger.debug('Successfully fetched scheduling settings', { tenantId });
  return transformSchedulingSettings(result.rows[0]);
};

export const updateSchedulingSettings = async (
  tenantId: string,
  data: Partial<SchedulingSettings>
): Promise<SchedulingSettings> => {
  logger.info('Updating scheduling settings', {
    tenantId,
    updates: Object.keys(data),
  });

  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.bufferTimeBetweenLessons !== undefined) {
    fields.push(`buffer_time_between_lessons = $${paramCount++}`);
    values.push(data.bufferTimeBetweenLessons);
  }
  if (data.bufferTimeBeforeFirstLesson !== undefined) {
    fields.push(`buffer_time_before_first_lesson = $${paramCount++}`);
    values.push(data.bufferTimeBeforeFirstLesson);
  }
  if (data.bufferTimeAfterLastLesson !== undefined) {
    fields.push(`buffer_time_after_last_lesson = $${paramCount++}`);
    values.push(data.bufferTimeAfterLastLesson);
  }
  if (data.minHoursAdvanceBooking !== undefined) {
    fields.push(`min_hours_advance_booking = $${paramCount++}`);
    values.push(data.minHoursAdvanceBooking);
  }
  if (data.maxDaysAdvanceBooking !== undefined) {
    fields.push(`max_days_advance_booking = $${paramCount++}`);
    values.push(data.maxDaysAdvanceBooking);
  }
  if (data.defaultLessonDuration !== undefined) {
    fields.push(`default_lesson_duration = $${paramCount++}`);
    values.push(data.defaultLessonDuration);
  }
  if (data.defaultMaxStudentsPerDay !== undefined) {
    fields.push(`default_max_students_per_day = $${paramCount++}`);
    values.push(data.defaultMaxStudentsPerDay);
  }
  if (data.allowBackToBackLessons !== undefined) {
    fields.push(`allow_back_to_back_lessons = $${paramCount++}`);
    values.push(data.allowBackToBackLessons);
  }
  if (data.defaultWorkStartTime !== undefined) {
    fields.push(`default_work_start_time = $${paramCount++}`);
    values.push(data.defaultWorkStartTime);
  }
  if (data.defaultWorkEndTime !== undefined) {
    fields.push(`default_work_end_time = $${paramCount++}`);
    values.push(data.defaultWorkEndTime);
  }

  if (fields.length === 0) {
    logger.warn('No fields provided for scheduling settings update', { tenantId });
    throw new AppError('No fields to update', 400);
  }

  values.push(tenantId);

  const result = await query(
    `UPDATE scheduling_settings SET ${fields.join(', ')}
     WHERE tenant_id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    logger.warn('Scheduling settings not found for update', { tenantId });
    throw new AppError('Scheduling settings not found', 404);
  }

  logger.info('Successfully updated scheduling settings', { tenantId });

  return transformSchedulingSettings(result.rows[0]);
};
