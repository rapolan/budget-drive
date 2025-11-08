/**
 * Instructor Service
 * Business logic for instructor management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Instructor } from '../types';
import { AppError } from '../middleware/errorHandler';

export const getAllInstructors = async (tenantId: string): Promise<Instructor[]> => {
  const result = await query(
    'SELECT * FROM instructors WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows as Instructor[];
};

export const getInstructorById = async (
  id: string,
  tenantId: string
): Promise<Instructor | null> => {
  const result = await query(
    'SELECT * FROM instructors WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows.length > 0 ? (result.rows[0] as Instructor) : null;
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
  return result.rows[0] as Instructor;
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

  return result.rows[0] as Instructor;
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
