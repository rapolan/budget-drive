/**
 * Guardian Service
 * Business logic for guardian management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Guardian } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';

const logger = createLogger('GuardianService');

/**
 * Get all guardians for a tenant (with pagination)
 */
export const getAllGuardians = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ guardians: Guardian[]; total: number; page: number; totalPages: number }> => {
  const offset = (page - 1) * limit;

  const countResult = await query(
    'SELECT COUNT(*) FROM guardians WHERE tenant_id = $1',
    [tenantId]
  );
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT * FROM guardians
     WHERE tenant_id = $1
     ORDER BY last_name, first_name
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );

  return {
    guardians: result.rows.map(keysToCamel) as Guardian[],
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Get guardian by ID
 */
export const getGuardianById = async (
  id: string,
  tenantId: string
): Promise<Guardian | null> => {
  const result = await query(
    'SELECT * FROM guardians WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return keysToCamel(result.rows[0]) as Guardian;
};

/**
 * Create new guardian
 * Business rule: at least one of email or phone is required (also enforced
 * at the DB level via guardians_email_or_phone_check).
 *
 * No duplicate-email/phone rejection here, unlike students - two guardian
 * records legitimately sharing contact info is expected (e.g. divorced
 * parents). Dedup is surfaced only via the guardian matching service and
 * acted on only through an explicit link (never automatically).
 */
export const createGuardian = async (
  tenantId: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  },
  userId?: string
): Promise<Guardian> => {
  logger.info('Creating new guardian', { tenantId });

  const hasEmail = data.email && data.email.trim().length > 0;
  const hasPhone = data.phone && data.phone.trim().length > 0;

  if (!hasEmail && !hasPhone) {
    throw new AppError('At least one of email or phone is required', 400);
  }

  const result = await query(
    `INSERT INTO guardians (
      tenant_id, first_name, last_name, email, phone, created_by, updated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $6)
    RETURNING *`,
    [
      tenantId,
      data.firstName || null,
      data.lastName || null,
      data.email || null,
      data.phone || null,
      userId || null,
    ]
  );

  const newGuardian = keysToCamel(result.rows[0]) as Guardian;
  logger.info('Successfully created guardian', { tenantId, guardianId: newGuardian.id });
  return newGuardian;
};

/**
 * Update guardian
 */
export const updateGuardian = async (
  id: string,
  tenantId: string,
  data: Partial<Guardian>,
  userId?: string
): Promise<Guardian> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.firstName !== undefined) {
    fields.push(`first_name = $${paramCount++}`);
    values.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    fields.push(`last_name = $${paramCount++}`);
    values.push(data.lastName);
  }
  if (data.email !== undefined) {
    fields.push(`email = $${paramCount++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${paramCount++}`);
    values.push(data.phone);
  }
  if (userId) {
    fields.push(`updated_by = $${paramCount++}`);
    values.push(userId);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  // If either email or phone is being changed, make sure the resulting row
  // still satisfies "at least one of email or phone" before hitting the DB
  // CHECK constraint, so the caller gets a clean AppError instead of a raw
  // constraint-violation error.
  if (data.email !== undefined || data.phone !== undefined) {
    const current = await getGuardianById(id, tenantId);
    if (!current) {
      throw new AppError('Guardian not found', 404);
    }
    const resultingEmail = data.email !== undefined ? data.email : current.email;
    const resultingPhone = data.phone !== undefined ? data.phone : current.phone;
    if (!resultingEmail && !resultingPhone) {
      throw new AppError('At least one of email or phone is required', 400);
    }
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE guardians
     SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Guardian not found', 404);
  }

  return keysToCamel(result.rows[0]) as Guardian;
};

/**
 * Delete guardian.
 * Blocked while the guardian is still linked to any student - see
 * studentGuardianService for the proactive pre-check this delegates to
 * once the student_guardians table exists (migration 006).
 */
export const deleteGuardian = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Deleting guardian', { tenantId, guardianId: id });

  const linked = await query(
    `SELECT s.id, s.full_name
     FROM student_guardians sg
     JOIN students s ON s.id = sg.student_id
     WHERE sg.guardian_id = $1 AND sg.tenant_id = $2`,
    [id, tenantId]
  );

  if (linked.rows.length > 0) {
    const names = linked.rows.map((r) => r.full_name).join(', ');
    throw new AppError(
      `Cannot delete guardian: still linked to student(s): ${names}. Unlink before deleting.`,
      409
    );
  }

  const result = await query(
    'DELETE FROM guardians WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Guardian not found', 404);
  }

  logger.info('Successfully deleted guardian', { tenantId, guardianId: id });
};
