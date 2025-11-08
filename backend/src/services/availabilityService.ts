/**
 * Availability Service
 * Manages instructor availability schedules and time off
 */

import { query } from '../config/database';
import { InstructorAvailability, InstructorTimeOff, SchedulingSettings } from '../types';
import { AppError } from '../middleware/errorHandler';

// =====================================================
// INSTRUCTOR AVAILABILITY (RECURRING SCHEDULE)
// =====================================================

export const getInstructorAvailability = async (
  instructorId: string,
  tenantId: string
): Promise<InstructorAvailability[]> => {
  const result = await query(
    `SELECT * FROM instructor_availability
     WHERE instructor_id = $1 AND tenant_id = $2 AND is_active = true
     ORDER BY day_of_week, start_time`,
    [instructorId, tenantId]
  );
  return result.rows as InstructorAvailability[];
};

export const getAllInstructorsAvailability = async (
  tenantId: string
): Promise<InstructorAvailability[]> => {
  const result = await query(
    `SELECT * FROM instructor_availability
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY instructor_id, day_of_week, start_time`,
    [tenantId]
  );
  return result.rows as InstructorAvailability[];
};

export const createAvailability = async (
  tenantId: string,
  instructorId: string,
  data: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    notes?: string;
  }
): Promise<InstructorAvailability> => {
  // Validate instructor belongs to tenant
  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
    throw new AppError('Instructor not found or does not belong to this organization', 404);
  }

  // Validate day of week
  if (data.dayOfWeek < 0 || data.dayOfWeek > 6) {
    throw new AppError('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)', 400);
  }

  // Validate time format and logic
  if (data.startTime >= data.endTime) {
    throw new AppError('startTime must be before endTime', 400);
  }

  const result = await query(
    `INSERT INTO instructor_availability (
      tenant_id, instructor_id, day_of_week, start_time, end_time, notes
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [tenantId, instructorId, data.dayOfWeek, data.startTime, data.endTime, data.notes || null]
  );

  return result.rows[0] as InstructorAvailability;
};

export const updateAvailability = async (
  id: string,
  tenantId: string,
  data: Partial<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
    notes: string;
  }>
): Promise<InstructorAvailability> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.dayOfWeek !== undefined) {
    if (data.dayOfWeek < 0 || data.dayOfWeek > 6) {
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
  if (data.isActive !== undefined) {
    fields.push(`is_active = $${paramCount++}`);
    values.push(data.isActive);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramCount++}`);
    values.push(data.notes);
  }

  if (fields.length === 0) {
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
    throw new AppError('Availability not found', 404);
  }

  return result.rows[0] as InstructorAvailability;
};

export const deleteAvailability = async (
  id: string,
  tenantId: string
): Promise<void> => {
  // Soft delete - set is_active to false
  const result = await query(
    `UPDATE instructor_availability SET is_active = false
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Availability not found', 404);
  }
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
  // Validate instructor
  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
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
    availabilities.push(result.rows[0] as InstructorAvailability);
  }

  return availabilities;
};

// =====================================================
// TIME OFF / UNAVAILABILITY
// =====================================================

export const getInstructorTimeOff = async (
  instructorId: string,
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<InstructorTimeOff[]> => {
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
  return result.rows as InstructorTimeOff[];
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
  // Validate instructor
  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
    throw new AppError('Instructor not found or does not belong to this organization', 404);
  }

  // Validate dates
  if (data.startDate > data.endDate) {
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

  return result.rows[0] as InstructorTimeOff;
};

export const updateTimeOff = async (
  id: string,
  tenantId: string,
  data: Partial<InstructorTimeOff>
): Promise<InstructorTimeOff> => {
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
    throw new AppError('Time off not found', 404);
  }

  return result.rows[0] as InstructorTimeOff;
};

export const deleteTimeOff = async (
  id: string,
  tenantId: string
): Promise<void> => {
  const result = await query(
    'DELETE FROM instructor_time_off WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Time off not found', 404);
  }
};

// =====================================================
// SCHEDULING SETTINGS
// =====================================================

export const getSchedulingSettings = async (
  tenantId: string
): Promise<SchedulingSettings> => {
  const result = await query(
    'SELECT * FROM scheduling_settings WHERE tenant_id = $1',
    [tenantId]
  );

  if (result.rows.length === 0) {
    // Create default settings if none exist
    const createResult = await query(
      `INSERT INTO scheduling_settings (tenant_id)
       VALUES ($1)
       RETURNING *`,
      [tenantId]
    );
    return createResult.rows[0] as SchedulingSettings;
  }

  return result.rows[0] as SchedulingSettings;
};

export const updateSchedulingSettings = async (
  tenantId: string,
  data: Partial<SchedulingSettings>
): Promise<SchedulingSettings> => {
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
    throw new AppError('Scheduling settings not found', 404);
  }

  return result.rows[0] as SchedulingSettings;
};
