/**
 * Instructor Service
 * Business logic for instructor management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Instructor } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('InstructorService');

export const getAllInstructors = async (tenantId: string): Promise<Instructor[]> => {
  logger.debug('Fetching all instructors', { tenantId });

  const result = await query(
    'SELECT * FROM instructors WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );

  logger.debug('Successfully fetched instructors', {
    tenantId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Instructor[];
};

export const getInstructorById = async (
  id: string,
  tenantId: string
): Promise<Instructor | null> => {
  logger.debug('Fetching instructor by ID', { tenantId, instructorId: id });

  const result = await query(
    'SELECT * FROM instructors WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.debug('Instructor not found', { tenantId, instructorId: id });
    return null;
  }

  return keysToCamel(result.rows[0]) as Instructor;
};

export const createInstructor = async (
  tenantId: string,
  data: any,
  userId?: string
): Promise<Instructor> => {
  logger.info('Creating new instructor', {
    tenantId,
    fullName: data.fullName,
    email: data.email,
    employmentType: data.employmentType || 'w2_employee',
  });

  try {
    const result = await query(
      `INSERT INTO instructors (
        tenant_id, full_name, email, phone, date_of_birth, address,
        address_line1, address_line2, city, state, zip_code,
        employment_type, hire_date, status, hourly_rate,
        created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', $14, $15, $15)
      RETURNING *`,
      [
        tenantId,
        data.fullName,
        data.email,
        data.phone,
        data.dateOfBirth || null,
        data.address || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.state || null,
        data.zipCode || null,
        data.employmentType || 'w2_employee',
        data.hireDate || new Date(),
        data.hourlyRate || null,
        userId || null,
      ]
    );

    const instructor = keysToCamel(result.rows[0]) as Instructor;
    logger.info('Successfully created instructor', {
      tenantId,
      instructorId: instructor.id,
      fullName: instructor.fullName,
    });

    return instructor;
  } catch (error) {
    logger.error('Failed to create instructor', error as Error, {
      tenantId,
      email: data.email,
    });
    throw error;
  }
};

export const updateInstructor = async (
  id: string,
  tenantId: string,
  data: Partial<Instructor>,
  userId?: string
): Promise<Instructor> => {
  logger.info('Updating instructor', {
    tenantId,
    instructorId: id,
    updateFields: Object.keys(data),
  });

  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.fullName !== undefined) {
      fields.push(`full_name = $${paramCount++}`);
      values.push(data.fullName);
    }
    if (data.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(data.email);
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(data.phone);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.hourlyRate !== undefined) {
      fields.push(`hourly_rate = $${paramCount++}`);
      values.push(data.hourlyRate);
    }
    if (data.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(data.address);
    }
    if (data.addressLine1 !== undefined) {
      fields.push(`address_line1 = $${paramCount++}`);
      values.push(data.addressLine1);
    }
    if (data.addressLine2 !== undefined) {
      fields.push(`address_line2 = $${paramCount++}`);
      values.push(data.addressLine2);
    }
    if (data.city !== undefined) {
      fields.push(`city = $${paramCount++}`);
      values.push(data.city);
    }
    if (data.state !== undefined) {
      fields.push(`state = $${paramCount++}`);
      values.push(data.state);
    }
    if (data.zipCode !== undefined) {
      fields.push(`zip_code = $${paramCount++}`);
      values.push(data.zipCode);
    }
    if (userId) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(userId);
    }

    if (fields.length === 0) {
      logger.warn('No fields to update in instructor', { tenantId, instructorId: id });
      throw new AppError('No fields to update', 400);
    }

    values.push(id, tenantId);

    const result = await query(
      `UPDATE instructors SET ${fields.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      logger.warn('Instructor not found for update', { tenantId, instructorId: id });
      throw new AppError('Instructor not found', 404);
    }

    logger.info('Instructor updated successfully', {
      tenantId,
      instructorId: id,
      updatedFields: Object.keys(data),
    });

    return keysToCamel(result.rows[0]) as Instructor;
  } catch (error) {
    logger.error('Failed to update instructor', error as Error, {
      tenantId,
      instructorId: id,
    });
    throw error;
  }
};

export const deleteInstructor = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Terminating instructor', { tenantId, instructorId: id });

  try {
    const result = await query(
      `UPDATE instructors SET status = 'terminated'
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      logger.warn('Instructor not found for termination', { tenantId, instructorId: id });
      throw new AppError('Instructor not found', 404);
    }

    logger.info('Instructor terminated successfully', { tenantId, instructorId: id });
  } catch (error) {
    logger.error('Failed to terminate instructor', error as Error, {
      tenantId,
      instructorId: id,
    });
    throw error;
  }
};

/**
 * Get instructor earnings for a date range
 * Calculates total earnings from completed lessons with BDP fees
 */
export const getInstructorEarnings = async (
  instructorId: string,
  tenantId: string,
  startDate?: string,
  endDate?: string
) => {
  const startTime = Date.now();
  logger.info('Calculating instructor earnings', {
    tenantId,
    instructorId,
    startDate,
    endDate,
  });

  try {
    // Build date filter if provided
    let dateFilter = '';
    const params: any[] = [instructorId, tenantId];

    if (startDate && endDate) {
      dateFilter = ' AND l.date >= $3 AND l.date <= $4';
      params.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = ' AND l.date >= $3';
      params.push(startDate);
    } else if (endDate) {
      dateFilter = ' AND l.date <= $3';
      params.push(endDate);
    }

    // Query lessons and treasury transactions
    const earningsQuery = `
      SELECT
        COUNT(l.id) as total_lessons,
        SUM(CAST(l.cost AS NUMERIC)) as gross_earnings,
        SUM(COALESCE(CAST(t.treasury_split AS NUMERIC), 0)) as total_fees,
        SUM(CAST(l.cost AS NUMERIC)) - SUM(COALESCE(CAST(t.treasury_split AS NUMERIC), 0)) as net_earnings
      FROM lessons l
      LEFT JOIN treasury_transactions t ON t.source_id = l.id AND t.bsv_action = 'BDP_BOOK'
      WHERE l.instructor_id = $1
        AND l.tenant_id = $2
        AND l.status = 'completed'
        ${dateFilter}
    `;

    const result = await query(earningsQuery, params);

    const earnings = {
      totalLessons: parseInt(result.rows[0].total_lessons) || 0,
      grossEarnings: parseFloat(result.rows[0].gross_earnings) || 0,
      totalFees: parseFloat(result.rows[0].total_fees) || 0,
      netEarnings: parseFloat(result.rows[0].net_earnings) || 0,
    };

    const duration = Date.now() - startTime;
    logger.info('Successfully calculated instructor earnings', {
      tenantId,
      instructorId,
      ...earnings,
      duration: `${duration}ms`,
    });

    return earnings;
  } catch (error) {
    logger.error('Failed to calculate instructor earnings', error as Error, {
      tenantId,
      instructorId,
      startDate,
      endDate,
    });
    throw error;
  }
};
 
