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
import lessonInviteService from './lessonInviteService';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('LessonService');

export const getAllLessons = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ lessons: Lesson[]; total: number; page: number; totalPages: number }> => {
  const startTime = Date.now();
  logger.info('Fetching all lessons', { tenantId, page, limit });

  try {
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

    const duration = Date.now() - startTime;
    logger.info('Successfully fetched lessons', {
      tenantId,
      count: result.rows.length,
      total,
      page,
      duration: `${duration}ms`,
    });

    return {
      lessons: result.rows.map(keysToCamel) as Lesson[],
      total,
      page,
      totalPages,
    };
  } catch (error) {
    logger.error('Failed to fetch lessons', error as Error, { tenantId, page, limit });
    throw error;
  }
};

export const getLessonById = async (
  id: string,
  tenantId: string
): Promise<Lesson | null> => {
  logger.debug('Fetching lesson by ID', { tenantId, lessonId: id });

  const result = await query(
    'SELECT * FROM lessons WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.debug('Lesson not found', { tenantId, lessonId: id });
    return null;
  }

  return keysToCamel(result.rows[0]) as Lesson;
};

export const getLessonsByStudent = async (
  tenantId: string,
  studentId: string
): Promise<Lesson[]> => {
  logger.debug('Fetching lessons for student', { tenantId, studentId });

  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1 AND student_id = $2
     ORDER BY date DESC, start_time DESC`,
    [tenantId, studentId]
  );

  logger.debug('Successfully fetched student lessons', {
    tenantId,
    studentId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Lesson[];
};

export const getLessonsByInstructor = async (
  tenantId: string,
  instructorId: string
): Promise<Lesson[]> => {
  logger.debug('Fetching lessons for instructor', { tenantId, instructorId });

  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1 AND instructor_id = $2
     ORDER BY date DESC, start_time DESC`,
    [tenantId, instructorId]
  );

  logger.debug('Successfully fetched instructor lessons', {
    tenantId,
    instructorId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Lesson[];
};

export const getLessonsByStatus = async (
  tenantId: string,
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
): Promise<Lesson[]> => {
  logger.debug('Fetching lessons by status', { tenantId, status });

  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1 AND status = $2
     ORDER BY date DESC, start_time DESC`,
    [tenantId, status]
  );

  logger.debug('Successfully fetched lessons by status', {
    tenantId,
    status,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Lesson[];
};

export const getLessonsByDateRange = async (
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<Lesson[]> => {
  logger.debug('Fetching lessons by date range', { tenantId, startDate, endDate });

  const result = await query(
    `SELECT * FROM lessons
     WHERE tenant_id = $1
     AND date >= $2
     AND date <= $3
     ORDER BY date ASC, start_time ASC`,
    [tenantId, startDate, endDate]
  );

  logger.debug('Successfully fetched lessons by date range', {
    tenantId,
    startDate,
    endDate,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Lesson[];
};

export const createLesson = async (
  tenantId: string,
  data: any
): Promise<Lesson> => {
  const startTime = Date.now();
  logger.info('Creating new lesson', {
    tenantId,
    studentId: data.studentId,
    instructorId: data.instructorId,
    vehicleId: data.vehicleId,
    scheduledStart: data.scheduledStart,
    scheduledEnd: data.scheduledEnd,
    lessonType: data.lessonType,
    cost: data.cost,
    pickupAddress: data.pickupAddress,
  });

  try {

    // Validate that student, instructor, and vehicle belong to the same tenant
    const studentCheck = await query(
      'SELECT id FROM students WHERE id = $1 AND tenant_id = $2',
      [data.studentId, tenantId]
    );
    if (studentCheck.rows.length === 0) {
      logger.error('Student not found', undefined, { tenantId, studentId: data.studentId });
      throw new AppError('Student not found or does not belong to this organization', 404);
    }
    logger.debug('Student validated', { tenantId, studentId: data.studentId });

    const instructorCheck = await query(
      'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
      [data.instructorId, tenantId]
    );
    if (instructorCheck.rows.length === 0) {
      logger.error('Instructor not found', undefined, { tenantId, instructorId: data.instructorId });
      throw new AppError('Instructor not found or does not belong to this organization', 404);
    }
    logger.debug('Instructor validated', { tenantId, instructorId: data.instructorId });

    // Vehicle is optional - instructors will assign vehicles later
    if (data.vehicleId) {
      const vehicleCheck = await query(
        'SELECT id FROM vehicles WHERE id = $1 AND tenant_id = $2',
        [data.vehicleId, tenantId]
      );
      if (vehicleCheck.rows.length === 0) {
        logger.error('Vehicle not found', undefined, { tenantId, vehicleId: data.vehicleId });
        throw new AppError('Vehicle not found or does not belong to this organization', 404);
      }
      logger.debug('Vehicle validated', { tenantId, vehicleId: data.vehicleId });
    } else {
      logger.debug('No vehicle assigned - instructor will assign later', { tenantId });
    }

    // Extract date and time from scheduledStart/scheduledEnd if provided (ISO format)
    // Otherwise use separate date/startTime/endTime fields
    let lessonDate, lessonStartTime, endTime, duration;

    if (data.scheduledStart && data.scheduledEnd) {
      const startDate = new Date(data.scheduledStart);
      const endDate = new Date(data.scheduledEnd);

      lessonDate = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      lessonStartTime = startDate.toTimeString().substring(0, 8); // HH:MM:SS
      endTime = endDate.toTimeString().substring(0, 8); // HH:MM:SS

      // Calculate duration in minutes
      duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

      logger.debug('Parsed lesson schedule from timestamps', {
        tenantId,
        lessonDate,
        startTime: lessonStartTime,
        endTime,
        duration,
      });
    } else {
      lessonDate = data.date;
      lessonStartTime = data.startTime;
      endTime = data.endTime;
      duration = data.duration;

      logger.debug('Using provided lesson schedule', {
        tenantId,
        lessonDate,
        startTime: lessonStartTime,
        endTime,
        duration,
      });
    }

    logger.debug('Inserting lesson into database', { tenantId });
    const result = await query(
      `INSERT INTO lessons (
        tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time,
        duration, lesson_number, lesson_type, cost, status, pickup_address, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled', $12, $13)
      RETURNING *`,
      [
        tenantId,
        data.studentId,
        data.instructorId,
        data.vehicleId,
        lessonDate,
        lessonStartTime,
        endTime,
        duration,
        data.lessonNumber || null,
        data.lessonType || 'behind_wheel',
        data.cost || 0,
        data.pickupAddress || null,
        data.notes || null,
      ]
    );

    const lesson = result.rows[0] as Lesson;
    logger.info('Lesson created successfully', {
      tenantId,
      lessonId: lesson.id,
      date: lesson.date,
      status: lesson.status,
      pickupAddress: lesson.pickupAddress,
    });

    // BDP Phase 1: Record 1% treasury split on lesson booking (Patent Claim #2)
    if (lesson.cost && lesson.cost > 0) {
      try {
        logger.debug('Recording treasury split for lesson booking', {
          tenantId,
          lessonId: lesson.id,
          cost: lesson.cost,
        });

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

        logger.info('Treasury split recorded successfully', {
          tenantId,
          lessonId: lesson.id,
        });
      } catch (error) {
        logger.warn('Treasury split recording failed (non-blocking)', {
          tenantId,
          lessonId: lesson.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Don't fail the lesson creation if treasury split fails
      }
    }

    // BDP Phase 2A: Queue email notifications (1 sat per notification)
    try {
      logger.debug('Queueing email notifications for lesson', {
        tenantId,
        lessonId: lesson.id,
      });

      // Get student and instructor emails
      const studentResult = await query(
        'SELECT email, full_name FROM students WHERE id = $1',
        [data.studentId]
      );
      const instructorResult = await query(
        'SELECT email FROM instructors WHERE id = $1',
        [data.instructorId]
      );

      const studentEmail = studentResult.rows[0]?.email;
      const instructorEmail = instructorResult.rows[0]?.email;

      // Calculate notification times
      const lessonDateTime = new Date(`${lessonDate}T${lessonStartTime}`);
      const twentyFourHoursBefore = new Date(lessonDateTime.getTime() - 24 * 60 * 60 * 1000);
      const oneHourBefore = new Date(lessonDateTime.getTime() - 60 * 60 * 1000);

    // Queue booking confirmation (send immediately) for student
    if (studentEmail) {
      await query(
        `INSERT INTO notification_queue (
          tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
          scheduled_send_time, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', NOW(), NOW())`,
        [tenantId, lesson.id, 'booking_confirmation', studentEmail, 'student']
      );
    }

    // Queue 24-hour reminder for student
    if (studentEmail && twentyFourHoursBefore > new Date()) {
      await query(
        `INSERT INTO notification_queue (
          tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
          scheduled_send_time, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())`,
        [tenantId, lesson.id, 'reminder_24h', studentEmail, 'student', twentyFourHoursBefore]
      );
    }

    // Queue 1-hour reminder for student
    if (studentEmail && oneHourBefore > new Date()) {
      await query(
        `INSERT INTO notification_queue (
          tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
          scheduled_send_time, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())`,
        [tenantId, lesson.id, 'reminder_1h', studentEmail, 'student', oneHourBefore]
      );
    }

    // Queue instructor booking confirmation
    if (instructorEmail) {
      await query(
        `INSERT INTO notification_queue (
          tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
          scheduled_send_time, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', NOW(), NOW())`,
        [tenantId, lesson.id, 'booking_confirmation', instructorEmail, 'instructor']
      );

      // Queue 24-hour reminder for instructor
      if (twentyFourHoursBefore > new Date()) {
        await query(
          `INSERT INTO notification_queue (
            tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
            scheduled_send_time, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())`,
          [tenantId, lesson.id, 'reminder_24h', instructorEmail, 'instructor', twentyFourHoursBefore]
        );
      }
    }

      logger.info('Notifications queued successfully', {
        tenantId,
        lessonId: lesson.id,
        studentEmail,
        instructorEmail,
      });
    } catch (error) {
      logger.warn('Notification queueing failed (non-blocking)', {
        tenantId,
        lessonId: lesson.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't fail the lesson creation if notification queueing fails
    }

    // Send calendar invite email to instructor
    try {
      logger.debug('Sending calendar invite email to instructor', {
        tenantId,
        lessonId: lesson.id,
        instructorId: data.instructorId,
      });

      const emailSent = await lessonInviteService.sendLessonInviteForLesson(lesson.id, tenantId);
      
      if (emailSent) {
        logger.info('Calendar invite email sent to instructor', {
          tenantId,
          lessonId: lesson.id,
        });
      } else {
        logger.debug('Calendar invite email not sent (email not configured)', {
          tenantId,
          lessonId: lesson.id,
        });
      }
    } catch (error) {
      logger.warn('Calendar invite email failed (non-blocking)', {
        tenantId,
        lessonId: lesson.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't fail the lesson creation if email fails
    }

    const totalDuration = Date.now() - startTime;
    logger.info('Lesson creation completed', {
      tenantId,
      lessonId: lesson.id,
      duration: `${totalDuration}ms`,
    });

    return lesson;
  } catch (error) {
    logger.error('Failed to create lesson', error as Error, {
      tenantId,
      studentId: data.studentId,
      instructorId: data.instructorId,
    });
    throw error;
  }
};

export const updateLesson = async (
  id: string,
  tenantId: string,
  data: Partial<Lesson>
): Promise<Lesson> => {
  logger.info('Updating lesson', {
    tenantId,
    lessonId: id,
    updateFields: Object.keys(data),
  });

  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.instructorId !== undefined) {
      const instructorCheck = await query(
        'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
        [data.instructorId, tenantId]
      );
      if (instructorCheck.rows.length === 0) {
        logger.error('Instructor not found for lesson update', undefined, {
          tenantId,
          lessonId: id,
          instructorId: data.instructorId,
        });
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
        logger.error('Vehicle not found for lesson update', undefined, {
          tenantId,
          lessonId: id,
          vehicleId: data.vehicleId,
        });
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
  if (data.lessonNumber !== undefined) {
    fields.push(`lesson_number = $${paramCount++}`);
    values.push(data.lessonNumber);
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
      logger.warn('No fields to update in lesson', { tenantId, lessonId: id });
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
      logger.warn('Lesson not found for update', { tenantId, lessonId: id });
      throw new AppError('Lesson not found', 404);
    }

    logger.info('Lesson updated successfully', {
      tenantId,
      lessonId: id,
      updatedFields: Object.keys(data),
    });

    return keysToCamel(result.rows[0]) as Lesson;
  } catch (error) {
    logger.error('Failed to update lesson', error as Error, {
      tenantId,
      lessonId: id,
    });
    throw error;
  }
};

export const deleteLesson = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Cancelling lesson', { tenantId, lessonId: id });

  try {
    const result = await query(
      `UPDATE lessons SET status = 'cancelled'
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, student_id, instructor_id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      logger.warn('Lesson not found for cancellation', { tenantId, lessonId: id });
      throw new AppError('Lesson not found', 404);
    }

    const lesson = result.rows[0];

  // BDP Phase 2A: Queue cancellation notifications
  try {
    // Get student and instructor emails
    const studentResult = await query(
      'SELECT email FROM students WHERE id = $1',
      [lesson.student_id]
    );
    const instructorResult = await query(
      'SELECT email FROM instructors WHERE id = $1',
      [lesson.instructor_id]
    );

    const studentEmail = studentResult.rows[0]?.email;
    const instructorEmail = instructorResult.rows[0]?.email;

    // Queue cancellation notification for student
    if (studentEmail) {
      await query(
        `INSERT INTO notification_queue (
          tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
          scheduled_send_time, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', NOW(), NOW())`,
        [tenantId, id, 'cancellation', studentEmail, 'student']
      );
    }

    // Queue cancellation notification for instructor
    if (instructorEmail) {
      await query(
        `INSERT INTO notification_queue (
          tenant_id, lesson_id, notification_type, recipient_email, recipient_type,
          scheduled_send_time, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', NOW(), NOW())`,
        [tenantId, id, 'cancellation', instructorEmail, 'instructor']
      );
    }

    // Delete any pending reminder notifications for this lesson
    await query(
      `UPDATE notification_queue
       SET status = 'cancelled'
       WHERE lesson_id = $1
       AND tenant_id = $2
       AND status = 'pending'
       AND notification_type IN ('reminder_24h', 'reminder_1h')`,
      [id, tenantId]
    );

      logger.info('Cancellation notifications queued successfully', {
        tenantId,
        lessonId: id,
      });
    } catch (error) {
      logger.warn('Cancellation notification queueing failed (non-blocking)', {
        tenantId,
        lessonId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't fail the lesson cancellation if notification queueing fails
    }

    logger.info('Lesson cancelled successfully', { tenantId, lessonId: id });
  } catch (error) {
    logger.error('Failed to cancel lesson', error as Error, {
      tenantId,
      lessonId: id,
    });
    throw error;
  }
};

export const completeLesson = async (
  id: string,
  tenantId: string
): Promise<Lesson> => {
  logger.info('Completing lesson', { tenantId, lessonId: id });

  try {
    const result = await query(
      `UPDATE lessons
       SET status = 'completed',
           completion_verified = true
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      logger.warn('Lesson not found for completion', { tenantId, lessonId: id });
      throw new AppError('Lesson not found', 404);
    }

    logger.info('Lesson completed successfully', { tenantId, lessonId: id });

    return keysToCamel(result.rows[0]) as Lesson;
  } catch (error) {
    logger.error('Failed to complete lesson', error as Error, {
      tenantId,
      lessonId: id,
    });
    throw error;
  }
};
