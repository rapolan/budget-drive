/**
 * Recurring Pattern Service
 * Generates lessons from recurring patterns
 */

import pool from '../config/database';

export class RecurringPatternService {
  /**
   * Create a new recurring pattern
   */
  async createPattern(tenantId: string, data: any): Promise<any> {
    const query = `
      INSERT INTO recurring_lesson_patterns (
        tenant_id, pattern_name, description, student_id, instructor_id, vehicle_id,
        lesson_type, duration, cost, recurrence_type, days_of_week, time_of_day,
        start_date, end_date, max_occurrences, package_id, deduct_from_package
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      data.pattern_name,
      data.description || null,
      data.student_id,
      data.instructor_id,
      data.vehicle_id,
      data.lesson_type || 'behind_wheel',
      data.duration,
      data.cost,
      data.recurrence_type,
      data.days_of_week || null,
      data.time_of_day,
      data.start_date,
      data.end_date || null,
      data.max_occurrences || null,
      data.package_id || null,
      data.deduct_from_package || false,
    ]);

    return result.rows[0];
  }

  /**
   * Get all patterns for a tenant
   */
  async getPatterns(tenantId: string): Promise<any[]> {
    const result = await pool.query(
      'SELECT * FROM active_recurring_patterns WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Generate lessons from a pattern
   */
  async generateLessons(patternId: string, tenantId: string): Promise<any> {
    // Get pattern
    const patternResult = await pool.query(
      'SELECT * FROM recurring_lesson_patterns WHERE id = $1 AND tenant_id = $2',
      [patternId, tenantId]
    );

    if (patternResult.rows.length === 0) {
      throw new Error('Pattern not found');
    }

    const pattern = patternResult.rows[0];
    const lessons = [];
    let currentDate = new Date(pattern.start_date);
    const endDate = pattern.end_date ? new Date(pattern.end_date) : null;
    let occurrenceCount = 0;

    // Generate lessons
    while (true) {
      // Check max occurrences
      if (pattern.max_occurrences && occurrenceCount >= pattern.max_occurrences) break;

      // Check end date
      if (endDate && currentDate > endDate) break;

      // Check if date is exception
      const isException = await pool.query(
        'SELECT is_exception_date($1, $2) as is_exception',
        [patternId, currentDate.toISOString().split('T')[0]]
      );

      if (!isException.rows[0].is_exception) {
        // Check if lesson already exists
        const existingLesson = await pool.query(
          'SELECT id FROM pattern_generated_lessons WHERE pattern_id = $1 AND occurrence_number = $2',
          [patternId, occurrenceCount + 1]
        );

        if (existingLesson.rows.length === 0) {
          // Create lesson
          const lessonDate = currentDate.toISOString().split('T')[0];
          const startTime = pattern.time_of_day;
          const endTimeDate = new Date(`${lessonDate}T${startTime}`);
          endTimeDate.setMinutes(endTimeDate.getMinutes() + pattern.duration);
          const endTime = endTimeDate.toTimeString().split(' ')[0];

          const lessonResult = await pool.query(
            `INSERT INTO lessons (
              tenant_id, student_id, instructor_id, vehicle_id, date, start_time, end_time,
              duration, lesson_type, cost, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled')
            RETURNING *`,
            [
              tenantId,
              pattern.student_id,
              pattern.instructor_id,
              pattern.vehicle_id,
              lessonDate,
              startTime,
              endTime,
              pattern.duration,
              pattern.lesson_type,
              pattern.cost,
            ]
          );

          const lesson = lessonResult.rows[0];

          // Link to pattern
          await pool.query(
            `INSERT INTO pattern_generated_lessons (
              tenant_id, pattern_id, lesson_id, occurrence_number, scheduled_date
            ) VALUES ($1, $2, $3, $4, $5)`,
            [tenantId, patternId, lesson.id, occurrenceCount + 1, lessonDate]
          );

          lessons.push(lesson);
        }

        occurrenceCount++;
      }

      // Get next occurrence
      const nextDateResult = await pool.query(
        'SELECT get_next_occurrence_date($1, $2, $3) as next_date',
        [currentDate.toISOString().split('T')[0], pattern.recurrence_type, pattern.days_of_week]
      );

      currentDate = new Date(nextDateResult.rows[0].next_date);

      // Safety check
      if (occurrenceCount > 365) break; // Max 1 year
    }

    return {
      pattern_id: patternId,
      lessons_generated: lessons.length,
      lessons: lessons,
    };
  }

  /**
   * Add exception date
   */
  async addException(patternId: string, tenantId: string, date: string, reason?: string): Promise<any> {
    const result = await pool.query(
      `INSERT INTO recurring_pattern_exceptions (tenant_id, pattern_id, exception_date, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (pattern_id, exception_date) DO NOTHING
       RETURNING *`,
      [tenantId, patternId, date, reason || null]
    );

    return result.rows[0];
  }

  /**
   * Delete pattern
   */
  async deletePattern(patternId: string, tenantId: string): Promise<void> {
    await pool.query(
      'UPDATE recurring_lesson_patterns SET is_active = false WHERE id = $1 AND tenant_id = $2',
      [patternId, tenantId]
    );
  }
}

export const recurringPatternService = new RecurringPatternService();
