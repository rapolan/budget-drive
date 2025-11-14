/**
 * Instructor Service
 * Business logic for instructor management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Instructor } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';

export const getAllInstructors = async (tenantId: string): Promise<Instructor[]> => {
  const result = await query(
    'SELECT * FROM instructors WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows.map(keysToCamel) as Instructor[];
};

export const getInstructorById = async (
  id: string,
  tenantId: string
): Promise<Instructor | null> => {
  const result = await query(
    'SELECT * FROM instructors WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows.length > 0 ? (keysToCamel(result.rows[0]) as Instructor) : null;
};

export const createInstructor = async (
  tenantId: string,
  data: any
): Promise<Instructor> => {
  const result = await query(
    `INSERT INTO instructors (
      tenant_id, full_name, email, phone, date_of_birth, address,
      employment_type, hire_date, status, hourly_rate
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
    RETURNING *`,
    [
      tenantId,
      data.fullName,
      data.email,
      data.phone,
      data.dateOfBirth || null,
      data.address || null,
      data.employmentType || 'w2_employee',
      data.hireDate || new Date(),
      data.hourlyRate || null,
    ]
  );
  return keysToCamel(result.rows[0]) as Instructor;
};

export const updateInstructor = async (
  id: string,
  tenantId: string,
  data: Partial<Instructor>
): Promise<Instructor> => {
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

  if (fields.length === 0) {
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
    throw new AppError('Instructor not found', 404);
  }

  return keysToCamel(result.rows[0]) as Instructor;
};

export const deleteInstructor = async (
  id: string,
  tenantId: string
): Promise<void> => {
  const result = await query(
    `UPDATE instructors SET status = 'terminated'
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Instructor not found', 404);
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

  return {
    totalLessons: parseInt(result.rows[0].total_lessons) || 0,
    grossEarnings: parseFloat(result.rows[0].gross_earnings) || 0,
    totalFees: parseFloat(result.rows[0].total_fees) || 0,
    netEarnings: parseFloat(result.rows[0].net_earnings) || 0,
  };
};
 
