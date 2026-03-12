/**
 * Student Service
 * Business logic for student management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Student } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('StudentService');

/**
 * Helper to convert empty strings to null (for date fields)
 */
const emptyToNull = (value: any): any => {
  return value === '' ? null : value;
};

/**
 * Get all students for a tenant (with pagination)
 */
export const getAllStudents = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ students: Student[]; total: number; page: number; totalPages: number }> => {
  const startTime = Date.now();
  logger.info('Fetching all students', { tenantId, page, limit });

  try {
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM students WHERE tenant_id = $1',
      [tenantId]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get students with creator/editor names
    const result = await query(
      `SELECT s.*,
              u1.full_name as created_by_name,
              u2.full_name as updated_by_name
       FROM students s
       LEFT JOIN users u1 ON s.created_by = u1.id
       LEFT JOIN users u2 ON s.updated_by = u2.id
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    const duration = Date.now() - startTime;
    logger.info('Successfully fetched students', {
      tenantId,
      count: result.rows.length,
      total,
      page,
      duration: `${duration}ms`,
    });

    return {
      students: result.rows.map(keysToCamel) as Student[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Failed to fetch students', error as Error, { tenantId, page, limit });
    throw error;
  }
};

/**
 * Get student by ID
 */
export const getStudentById = async (
  id: string,
  tenantId: string
): Promise<Student | null> => {
  logger.debug('Fetching student by ID', { tenantId, studentId: id });

  const result = await query(
    `SELECT s.*,
            u1.full_name as created_by_name,
            u2.full_name as updated_by_name
     FROM students s
     LEFT JOIN users u1 ON s.created_by = u1.id
     LEFT JOIN users u2 ON s.updated_by = u2.id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.debug('Student not found', { tenantId, studentId: id });
    return null;
  }

  return keysToCamel(result.rows[0]) as Student;
};

/**
 * Create new student
 * Form order: Name → DOB → Address → Student Phone → Parent/Guardian → Email → Permit → Notes
 * Business rule: At least one contact method required (student phone OR Parent/Guardian)
 */
export const createStudent = async (
  tenantId: string,
  data: {
    fullName: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    email: string;
    phone?: string; // Student phone (optional - can use Parent/Guardian instead)
    dateOfBirth?: Date;
    address?: string; // Legacy combined address
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    emergencyContact?: string; // Legacy field
    emergencyContactName?: string; // Parent/Guardian name
    emergencyContactPhone?: string; // Parent/Guardian phone
    emergencyContact2Name?: string; // Secondary contact name
    emergencyContact2Phone?: string; // Secondary contact phone
    hoursRequired?: number; // Default: 6 (California requirement)
    assignedInstructorId?: string;
    learnerPermitNumber?: string;
    learnerPermitIssueDate?: Date;
    learnerPermitExpiration?: Date;
    notes?: string;
  },
  userId?: string
): Promise<Student> => {
  logger.info('Creating new student', {
    tenantId,
    fullName: data.fullName,
    email: data.email,
  });

  try {
    // Validate: At least one contact method required (student phone OR Parent/Guardian)
    const hasStudentPhone = data.phone && data.phone.trim().length > 0;
    const hasParentContact = data.emergencyContactPhone && data.emergencyContactPhone.trim().length > 0;
    
    if (!hasStudentPhone && !hasParentContact) {
      throw new AppError('At least one contact phone is required (Student Phone or Parent/Guardian)', 400);
    }

    // Check if email already exists for this tenant
    const existing = await query(
      'SELECT id FROM students WHERE email = $1 AND tenant_id = $2',
      [data.email, tenantId]
    );

    if (existing.rows.length > 0) {
      logger.warn('Duplicate student email detected', {
        tenantId,
        email: data.email,
      });
      throw new AppError('Student with this email already exists', 400);
    }

    // Handle emergency contact - prefer split fields, fall back to legacy field
    // Use empty string instead of null because DB has NOT NULL constraint
    const emergencyContact = data.emergencyContact ||
      (data.emergencyContactName && data.emergencyContactPhone
        ? `${data.emergencyContactName} - ${data.emergencyContactPhone}`
        : '') || '';

    // Set defaults for optional fields
    const hoursRequired = data.hoursRequired ?? 6; // Default to 6 hours (California requirement for under 18)

    const result = await query(
      `INSERT INTO students (
        tenant_id, full_name, first_name, last_name, middle_name, email, phone, date_of_birth, address,
        address_line1, address_line2, city, state, zip_code,
        emergency_contact, emergency_contact_name, emergency_contact_phone,
        emergency_contact_2_name, emergency_contact_2_phone,
        enrollment_date, hours_required,
        assigned_instructor_id,
        learner_permit_number, learner_permit_issue_date, learner_permit_expiration,
        notes, status, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), $20, $21, $22, $23, $24, $25, 'active', $26, $26)
      RETURNING *`,
      [
        tenantId,
        data.fullName,
        data.firstName || null,
        data.lastName || null,
        data.middleName || null,
        data.email,
        data.phone || null, // Allow null phone
        data.dateOfBirth || null,
        data.address || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.state || null,
        data.zipCode || null,
        emergencyContact,
        data.emergencyContactName || null,
        data.emergencyContactPhone || null,
        data.emergencyContact2Name || null,
        data.emergencyContact2Phone || null,
        hoursRequired,
        data.assignedInstructorId || null,
        data.learnerPermitNumber || null,
        data.learnerPermitIssueDate || null,
        data.learnerPermitExpiration || null,
        data.notes || null,
        userId || null,
      ]
    );

    const newStudent = keysToCamel(result.rows[0]) as Student;
    logger.info('Successfully created student', {
      tenantId,
      studentId: newStudent.id,
      fullName: newStudent.fullName,
    });

    return newStudent;
  } catch (error) {
    logger.error('Failed to create student', error as Error, {
      tenantId,
      email: data.email,
    });
    throw error;
  }
};

/**
 * Update student
 */
export const updateStudent = async (
  id: string,
  tenantId: string,
  data: Partial<Student>,
  userId?: string
): Promise<Student> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Build dynamic update query
  if (data.fullName !== undefined) {
    fields.push(`full_name = $${paramCount++}`);
    values.push(data.fullName);
  }
  if (data.firstName !== undefined) {
    fields.push(`first_name = $${paramCount++}`);
    values.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    fields.push(`last_name = $${paramCount++}`);
    values.push(data.lastName);
  }
  if (data.middleName !== undefined) {
    fields.push(`middle_name = $${paramCount++}`);
    values.push(data.middleName);
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
  if (data.emergencyContact !== undefined) {
    fields.push(`emergency_contact = $${paramCount++}`);
    values.push(data.emergencyContact);
  }
  if (data.emergencyContactName !== undefined) {
    fields.push(`emergency_contact_name = $${paramCount++}`);
    values.push(data.emergencyContactName);
  }
  if (data.emergencyContactPhone !== undefined) {
    fields.push(`emergency_contact_phone = $${paramCount++}`);
    values.push(data.emergencyContactPhone);
  }
  if (data.emergencyContact2Name !== undefined) {
    fields.push(`emergency_contact_2_name = $${paramCount++}`);
    values.push(data.emergencyContact2Name);
  }
  if (data.emergencyContact2Phone !== undefined) {
    fields.push(`emergency_contact_2_phone = $${paramCount++}`);
    values.push(data.emergencyContact2Phone);
  }
  if (data.learnerPermitNumber !== undefined) {
    fields.push(`learner_permit_number = $${paramCount++}`);
    values.push(emptyToNull(data.learnerPermitNumber));
  }
  if (data.learnerPermitIssueDate !== undefined) {
    fields.push(`learner_permit_issue_date = $${paramCount++}`);
    values.push(emptyToNull(data.learnerPermitIssueDate));
  }
  if (data.learnerPermitExpiration !== undefined) {
    fields.push(`learner_permit_expiration = $${paramCount++}`);
    values.push(emptyToNull(data.learnerPermitExpiration));
  }
  if (data.hoursRequired !== undefined) {
    fields.push(`hours_required = $${paramCount++}`);
    values.push(data.hoursRequired);
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
  if (data.lastContactedAt !== undefined) {
    fields.push(`last_contacted_at = $${paramCount++}`);
    values.push(emptyToNull(data.lastContactedAt));
  }
  if (userId) {
    fields.push(`updated_by = $${paramCount++}`);
    values.push(userId);
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

  return keysToCamel(result.rows[0]) as Student;
};

/**
 * Delete student (hard delete for now, will be soft delete when blockchain is implemented)
 * NOTE: When blockchain is integrated, this will change to set a deleted_at timestamp
 * instead of actually removing the record, since blockchain data is immutable.
 */
export const deleteStudent = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Deleting student', { tenantId, studentId: id });

  try {
    const result = await query(
      `DELETE FROM students
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      logger.warn('Student not found for deletion', { tenantId, studentId: id });
      throw new AppError('Student not found', 404);
    }

    logger.info('Successfully deleted student', { tenantId, studentId: id });
  } catch (error) {
    logger.error('Failed to delete student', error as Error, { tenantId, studentId: id });
    throw error;
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
    `SELECT s.*,
            u1.full_name as created_by_name,
            u2.full_name as updated_by_name
     FROM students s
     LEFT JOIN users u1 ON s.created_by = u1.id
     LEFT JOIN users u2 ON s.updated_by = u2.id
     WHERE s.tenant_id = $1 AND s.status = $2
     ORDER BY s.created_at DESC`,
    [tenantId, status]
  );

  return result.rows.map(keysToCamel) as Student[];
};

/**
 * Get students by assigned instructor
 */
export const getStudentsByInstructor = async (
  tenantId: string,
  instructorId: string
): Promise<Student[]> => {
  const result = await query(
    `SELECT s.*,
            u1.full_name as created_by_name,
            u2.full_name as updated_by_name
     FROM students s
     LEFT JOIN users u1 ON s.created_by = u1.id
     LEFT JOIN users u2 ON s.updated_by = u2.id
     WHERE s.tenant_id = $1 AND s.assigned_instructor_id = $2
     ORDER BY s.created_at DESC`,
    [tenantId, instructorId]
  );

  return result.rows.map(keysToCamel) as Student[];
};
