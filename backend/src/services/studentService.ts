/**
 * Student Service
 * Business logic for student management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Student } from '../types';
import { AppError } from '../middleware/errorHandler';

/**
 * Get all students for a tenant (with pagination)
 */
export const getAllStudents = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ students: Student[]; total: number; page: number; totalPages: number }> => {
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) FROM students WHERE tenant_id = $1',
    [tenantId]
  );
  const total = parseInt(countResult.rows[0].count);

  // Get students
  const result = await query(
    `SELECT * FROM students
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );

  return {
    students: result.rows as Student[],
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Get student by ID
 */
export const getStudentById = async (
  id: string,
  tenantId: string
): Promise<Student | null> => {
  const result = await query(
    'SELECT * FROM students WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Student;
};

/**
 * Create new student
 */
export const createStudent = async (
  tenantId: string,
  data: {
    fullName: string;
    email: string;
    phone: string;
    dateOfBirth: Date;
    address: string;
    emergencyContact: string;
    licenseType: 'car' | 'motorcycle' | 'commercial';
    hoursRequired: number;
    assignedInstructorId?: string;
  }
): Promise<Student> => {
  // Check if email already exists for this tenant
  const existing = await query(
    'SELECT id FROM students WHERE email = $1 AND tenant_id = $2',
    [data.email, tenantId]
  );

  if (existing.rows.length > 0) {
    throw new AppError('Student with this email already exists', 400);
  }

  const result = await query(
    `INSERT INTO students (
      tenant_id, full_name, email, phone, date_of_birth, address,
      emergency_contact, license_type, enrollment_date, hours_required,
      assigned_instructor_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, 'active')
    RETURNING *`,
    [
      tenantId,
      data.fullName,
      data.email,
      data.phone,
      data.dateOfBirth,
      data.address,
      data.emergencyContact,
      data.licenseType,
      data.hoursRequired,
      data.assignedInstructorId || null,
    ]
  );

  return result.rows[0] as Student;
};

/**
 * Update student
 */
export const updateStudent = async (
  id: string,
  tenantId: string,
  data: Partial<Student>
): Promise<Student> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Build dynamic update query
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
  if (data.address !== undefined) {
    fields.push(`address = $${paramCount++}`);
    values.push(data.address);
  }
  if (data.emergencyContact !== undefined) {
    fields.push(`emergency_contact = $${paramCount++}`);
    values.push(data.emergencyContact);
  }
  if (data.status !== undefined) {
    fields.push(`status = $${paramCount++}`);
    values.push(data.status);
  }
  if (data.assignedInstructorId !== undefined) {
    fields.push(`assigned_instructor_id = $${paramCount++}`);
    values.push(data.assignedInstructorId);
  }
  if (data.totalHoursCompleted !== undefined) {
    fields.push(`total_hours_completed = $${paramCount++}`);
    values.push(data.totalHoursCompleted);
  }
  if (data.paymentStatus !== undefined) {
    fields.push(`payment_status = $${paramCount++}`);
    values.push(data.paymentStatus);
  }
  if (data.totalPaid !== undefined) {
    fields.push(`total_paid = $${paramCount++}`);
    values.push(data.totalPaid);
  }
  if (data.outstandingBalance !== undefined) {
    fields.push(`outstanding_balance = $${paramCount++}`);
    values.push(data.outstandingBalance);
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
    `UPDATE students
     SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Student not found', 404);
  }

  return result.rows[0] as Student;
};

/**
 * Delete student (soft delete by setting status to inactive)
 */
export const deleteStudent = async (
  id: string,
  tenantId: string
): Promise<void> => {
  const result = await query(
    `UPDATE students SET status = 'inactive'
     WHERE id = $1 AND tenant_id = $2
     RETURNING id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Student not found', 404);
  }
};

/**
 * Get students by status
 */
export const getStudentsByStatus = async (
  tenantId: string,
  status: 'active' | 'completed' | 'inactive' | 'suspended'
): Promise<Student[]> => {
  const result = await query(
    'SELECT * FROM students WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC',
    [tenantId, status]
  );

  return result.rows as Student[];
};

/**
 * Get students by assigned instructor
 */
export const getStudentsByInstructor = async (
  tenantId: string,
  instructorId: string
): Promise<Student[]> => {
  const result = await query(
    `SELECT * FROM students
     WHERE tenant_id = $1 AND assigned_instructor_id = $2
     ORDER BY created_at DESC`,
    [tenantId, instructorId]
  );

  return result.rows as Student[];
};
