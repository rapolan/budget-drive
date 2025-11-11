/**
 * Lesson Service
 * Business logic for lesson/appointment management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 *
 * BDP Integration: Treasury splits recorded on lesson booking (Phase 1)
 */

import { query } from '../config/database';
import { Lesson } from '../types';
import { AppError } from '../middleware/errorHandler';
import treasuryService from './treasuryService';

export const getAllLessons = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ lessons: Lesson[]; total: number; page: number; totalPages: number }> => {
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) FROM lessons WHERE tenant_id = $1',
    [tenantId]
  );
  const total = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(total / limit);

  // Get paginated lessons
  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1
     ORDER BY date DESC, start_time DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );

  return {
    lessons: result.rows as Lesson[],
    total,
    page,
    totalPages,
  };
};

export const getLessonById = async (
  id: string,
  tenantId: string
): Promise<Lesson | null> => {
  const result = await query(
    'SELECT * FROM lessons WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows.length > 0 ? (result.rows[0] as Lesson) : null;
};

export const getLessonsByStudent = async (
  tenantId: string,
  studentId: string
): Promise<Lesson[]> => {
  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1 AND student_id = $2
     ORDER BY date DESC, start_time DESC`,
    [tenantId, studentId]
  );
  return result.rows as Lesson[];
};

export const getLessonsByInstructor = async (
  tenantId: string,
  instructorId: string
): Promise<Lesson[]> => {
  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1 AND instructor_id = $2
     ORDER BY date DESC, start_time DESC`,
    [tenantId, instructorId]
  );
  return result.rows as Lesson[];
};

export const getLessonsByStatus = async (
  tenantId: string,
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
): Promise<Lesson[]> => {
  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1 AND status = $2
     ORDER BY date DESC, start_time DESC`,
    [tenantId, status]
  );
  return result.rows as Lesson[];
};

export const getLessonsByDateRange = async (
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<Lesson[]> => {
  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1
     AND date >= $2
     AND date <= $3
     ORDER BY date ASC, start_time ASC`,
    [tenantId, startDate, endDate]
  );
  return result.rows as Lesson[];
};

export const createLesson = async (
  tenantId: string,
  data: any
): Promise<Lesson> => {
  // Validate that student, instructor, and vehicle belong to the same tenant
  const studentCheck = await query(
    'SELECT id FROM students WHERE id = $1 AND tenant_id = $2',
    [data.studentId, tenantId]
  );
  if (studentCheck.rows.length === 0) {
    throw new AppError('Student not found or does not belong to this organization', 404);
  }

  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [data.instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
    throw new AppError('Instructor not found or does not belong to this organization', 404);
  }

  const vehicleCheck = await query(
    'SELECT id FROM vehicles WHERE id = $1 AND tenant_id = $2',
    [data.vehicleId, tenantId]
  );
  if (vehicleCheck.rows.length === 0) {
    throw new AppError('Vehicle not found or does not belong to this organization', 404);
  }

  const result = await query(
    `INSERT INTO lessons (
      tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time,
      duration, lesson_type, cost, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled')
    RETURNING *`,
    [
      tenantId,
      data.studentId,
      data.instructorId,
      data.vehicleId,
      data.date,
      data.startTime,
      data.endTime,
      data.duration,
      data.lessonType || 'behind_wheel',
      data.cost || 0,
    ]
  );

  const lesson = result.rows[0] as Lesson;

  // BDP Phase 1: Record 1% treasury split on lesson booking (Patent Claim #2)
  if (lesson.cost && lesson.cost > 0) {
    try {
      await treasuryService.createTransaction({
        tenant_id: tenantId,
        source_type: 'lesson_booking',
        source_id: lesson.id,
        gross_amount: lesson.cost,
        description: `Treasury split from lesson booking (${data.lessonType || 'behind_wheel'})`,
        metadata: {
          student_id: data.studentId,
          instructor_id: data.instructorId,
          vehicle_id: data.vehicleId,
          lesson_date: data.date,
          lesson_type: data.lessonType || 'behind_wheel',
        },
      });

      // Log BDP action
      await treasuryService.logBDPAction(
        tenantId,
        'BDP_BOOK',
        `${lesson.id}|${data.instructorId}|${data.date}|${data.startTime}`,
        {
          entityId: lesson.id,
          entityType: 'lesson',
          description: `Lesson booked with 1% treasury split`,
          metadata: {
            cost: lesson.cost,
            student_id: data.studentId,
            instructor_id: data.instructorId,
          },
        }
      );
    } catch (error) {
      console.error('Treasury split recording failed (non-blocking):', error);
      // Don't fail the lesson creation if treasury split fails
    }
  }

  return lesson;
};

export const updateLesson = async (
  id: string,
  tenantId: string,
  data: Partial<Lesson>
): Promise<Lesson> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.instructorId !== undefined) {
    const instructorCheck = await query(
      'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
      [data.instructorId, tenantId]
    );
    if (instructorCheck.rows.length === 0) {
      throw new AppError('Instructor not found or does not belong to this organization', 404);
    }
    fields.push(`instructor_id = $${paramCount++}`);
    values.push(data.instructorId);
  }

  if (data.vehicleId !== undefined) {
    const vehicleCheck = await query(
      'SELECT id FROM vehicles WHERE id = $1 AND tenant_id = $2',
      [data.vehicleId, tenantId]
    );
    if (vehicleCheck.rows.length === 0) {
      throw new AppError('Vehicle not found or does not belong to this organization', 404);
    }
    fields.push(`vehicle_id = $${paramCount++}`);
    values.push(data.vehicleId);
  }

  if (data.date !== undefined) {
    fields.push(`date = $${paramCount++}`);
    values.push(data.date);
  }
  if (data.startTime !== undefined) {
    fields.push(`start_time = $${paramCount++}`);
    values.push(data.startTime);
  }
  if (data.endTime !== undefined) {
    fields.push(`end_time = $${paramCount++}`);
    values.push(data.endTime);
  }
  if (data.duration !== undefined) {
    fields.push(`duration = $${paramCount++}`);
    values.push(data.duration);
  }
  if (data.lessonType !== undefined) {
    fields.push(`lesson_type = $${paramCount++}`);
    values.push(data.lessonType);
  }
  if (data.status !== undefined) {
    fields.push(`status = $${paramCount++}`);
    values.push(data.status);
  }
  if (data.cost !== undefined) {
    fields.push(`cost = $${paramCount++}`);
    values.push(data.cost);
  }
  if (data.studentPerformance !== undefined) {
    fields.push(`student_performance = $${paramCount++}`);
    values.push(data.studentPerformance);
  }
  if (data.instructorRating !== undefined) {
    fields.push(`instructor_rating = $${paramCount++}`);
    values.push(data.instructorRating);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramCount++}`);
    values.push(data.notes);
  }
  if (data.completionVerified !== undefined) {
    fields.push(`completion_verified = $${paramCount++}`);
    values.push(data.completionVerified);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE lessons SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Lesson not found', 404);
  }

  return result.rows[0] as Lesson;
};

export const deleteLesson = async (
  id: string,
  tenantId: string
): Promise<void> => {
  const result = await query(
    `UPDATE lessons SET status = 'cancelled'
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Lesson not found', 404);
  }
};

export const completeLesson = async (
  id: string,
  tenantId: string
): Promise<Lesson> => {
  const result = await query(
    `UPDATE lessons
     SET status = 'completed',
         completion_verified = true
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Lesson not found', 404);
  }

  return result.rows[0] as Lesson;
};
