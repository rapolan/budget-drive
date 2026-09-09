/**
 * Payment Service
 * Business logic for payment management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Payment } from '../types';
import { AppError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';
import { ledger } from './Ledger';
import { getActiveDriverTrainingEnrollment } from './enrollmentService';
import { keysToCamel } from '../utils/caseConversion';

const logger = createLogger('PaymentService');

export const getAllPayments = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ payments: Payment[]; total: number; page: number; totalPages: number }> => {
  logger.info('Fetching all payments', { tenantId, page, limit });

  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) FROM payments WHERE tenant_id = $1',
    [tenantId]
  );
  const total = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(total / limit);

  // Get paginated payments
  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1
     ORDER BY p.date DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );

  logger.info('Successfully fetched payments', {
    tenantId,
    count: result.rows.length,
    total,
    page,
  });

  return {
    payments: result.rows.map(keysToCamel) as Payment[],
    total,
    page,
    totalPages,
  };
};

export const getPaymentById = async (
  id: string,
  tenantId: string
): Promise<Payment | null> => {
  logger.debug('Fetching payment by ID', { tenantId, paymentId: id });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.debug('Payment not found', { tenantId, paymentId: id });
    return null;
  }

  return keysToCamel(result.rows[0]) as Payment;
};

export const getPaymentsByStudent = async (
  tenantId: string,
  studentId: string
): Promise<Payment[]> => {
  logger.debug('Fetching payments for student', { tenantId, studentId });

  // A person's payment history spans every enrollment they've ever had,
  // not just their current active one.
  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND e.student_id = $2
     ORDER BY p.date DESC`,
    [tenantId, studentId]
  );

  logger.debug('Successfully fetched student payments', {
    tenantId,
    studentId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

export const getPaymentsByLesson = async (
  tenantId: string,
  lessonId: string
): Promise<Payment[]> => {
  logger.debug('Fetching payments for lesson', { tenantId, lessonId });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND p.lesson_id = $2
     ORDER BY p.date DESC`,
    [tenantId, lessonId]
  );

  logger.debug('Successfully fetched lesson payments', {
    tenantId,
    lessonId,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

export const getPaymentsByStatus = async (
  tenantId: string,
  status: 'pending' | 'completed' | 'failed' | 'refunded'
): Promise<Payment[]> => {
  logger.debug('Fetching payments by status', { tenantId, status });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND p.status = $2
     ORDER BY p.date DESC`,
    [tenantId, status]
  );

  logger.debug('Successfully fetched payments by status', {
    tenantId,
    status,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

export const getPaymentsByPaymentMethod = async (
  tenantId: string,
  paymentMethod: string
): Promise<Payment[]> => {
  logger.debug('Fetching payments by payment method', { tenantId, paymentMethod });

  const result = await query(
    `SELECT p.*, e.student_id AS student_id
     FROM payments p
     JOIN enrollments e ON e.id = p.enrollment_id
     WHERE p.tenant_id = $1 AND p.payment_method = $2
     ORDER BY p.date DESC`,
    [tenantId, paymentMethod]
  );

  logger.debug('Successfully fetched payments by payment method', {
    tenantId,
    paymentMethod,
    count: result.rows.length,
  });

  return result.rows.map(keysToCamel) as Payment[];
};

export const createPayment = async (
  tenantId: string,
  data: any,
  userId?: string,
  // Optional transactional client - defaults to the module-level query
  // function, so every existing caller is unaffected (same behavior, no
  // signature break). Only a caller that needs this insert to participate
  // in a wider BEGIN/COMMIT (e.g. feeFlagService's batch-paid action)
  // passes its own client here.
  dbQuery: typeof query = query
): Promise<Payment> => {
  logger.info('Creating new payment', {
    tenantId,
    studentId: data.studentId,
    amount: data.amount,
    paymentMethod: data.paymentMethod || 'cash',
  });

  try {
    // Validate that student belongs to tenant
    const studentCheck = await dbQuery(
      'SELECT id FROM students WHERE id = $1 AND tenant_id = $2',
      [data.studentId, tenantId]
    );
    if (studentCheck.rows.length === 0) {
      logger.error('Student not found for payment', undefined, {
        tenantId,
        studentId: data.studentId,
      });
      throw new AppError('Student not found or does not belong to this organization', 404);
    }

    // Payments attach to the student's active driver_training enrollment
    // when one exists (Constraint A/D - at most one exists, and this is
    // required whenever a lessonId is given, since a lesson only ever
    // belongs to a driver_training enrollment). A DE-only student - no
    // driver_training enrollment at all - can now be paid against their
    // driver_education enrollment instead, since DE has its own real
    // course-fee balance (see enrollmentService.createEnrollment's DE
    // cost defaulting). A student with NEITHER program still 400s -
    // there is genuinely nothing to record a payment against.
    const activeEnrollment = await getActiveDriverTrainingEnrollment(data.studentId, tenantId);
    let targetEnrollmentId: string;
    if (activeEnrollment) {
      targetEnrollmentId = activeEnrollment.id;
    } else if (data.lessonId) {
      // A lesson-linked payment has nowhere to attach without a
      // driver_training enrollment - fall through to the same 400 below
      // rather than silently attaching to an unrelated DE enrollment.
      throw new AppError('Student has no active driver_training enrollment', 400);
    } else {
      // Prefer a DE enrollment with a genuine outstanding balance
      // (total_cost minus confirmed payments so far) over just the most
      // recent one - a student with an old, already-paid-off DE
      // enrollment and a newer one still owing should attach to the one
      // that's actually unpaid.
      const deEnrollmentResult = await dbQuery(
        `SELECT e.id,
                e.total_cost,
                COALESCE((
                  SELECT SUM(p.amount) FROM payments p
                  WHERE p.enrollment_id = e.id AND p.tenant_id = e.tenant_id AND p.status = 'confirmed'
                ), 0) AS total_paid
         FROM enrollments e
         WHERE e.student_id = $1 AND e.tenant_id = $2 AND e.program_type = 'driver_education'
         ORDER BY (e.total_cost IS NOT NULL AND e.total_cost > COALESCE((
                    SELECT SUM(p2.amount) FROM payments p2
                    WHERE p2.enrollment_id = e.id AND p2.tenant_id = e.tenant_id AND p2.status = 'confirmed'
                  ), 0)) DESC,
                  e.created_at DESC
         LIMIT 1`,
        [data.studentId, tenantId]
      );
      if (deEnrollmentResult.rows.length === 0) {
        throw new AppError('Student has no active driver_training or driver_education enrollment', 400);
      }
      const deRow = deEnrollmentResult.rows[0];
      const deTotalCost = deRow.total_cost !== null ? Number(deRow.total_cost) : null;
      const deOutstanding = deTotalCost !== null ? deTotalCost - Number(deRow.total_paid) : null;
      if (deOutstanding !== null && deOutstanding <= 0 && Number(data.amount) > 0) {
        logger.warn('Recording a payment against a DE enrollment with no outstanding balance', {
          tenantId,
          studentId: data.studentId,
          enrollmentId: deRow.id,
        });
      }
      targetEnrollmentId = deRow.id;
    }

    // If lesson_id provided, validate it belongs to tenant and student
    if (data.lessonId) {
      const lessonCheck = await dbQuery(
        `SELECT l.id FROM lessons l
         JOIN enrollments e ON e.id = l.enrollment_id
         WHERE l.id = $1 AND l.tenant_id = $2 AND e.student_id = $3`,
        [data.lessonId, tenantId, data.studentId]
      );
      if (lessonCheck.rows.length === 0) {
        logger.error('Lesson not found for payment', undefined, {
          tenantId,
          lessonId: data.lessonId,
          studentId: data.studentId,
        });
        throw new AppError('Lesson not found or does not belong to this student', 404);
      }
    }

    const result = await dbQuery(
      `INSERT INTO payments (
        tenant_id, enrollment_id, amount, payment_method, payment_type,
        date, status, bsv_transaction_id, notes, reference_number, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *, $12 AS student_id`,
      [
        tenantId,
        targetEnrollmentId,
        data.amount,
        data.paymentMethod || 'cash',
        data.paymentType || 'lesson_payment',
        data.date || new Date(),
        data.status || 'confirmed',
        data.bsvTransactionId || null,
        data.notes || null,
        data.referenceNumber || null,
        userId || null,
        data.studentId,
      ]
    );

    const payment = keysToCamel(result.rows[0]) as Payment;
    logger.info('Successfully created payment', {
      tenantId,
      paymentId: payment.id,
      amount: payment.amount,
      status: payment.status,
    });

    // Anchor BDP_PAY action through the ledger seam (noop unless BSV_ENABLED)
    try {
      await ledger.recordPayment({
        tenantId,
        paymentId: payment.id,
        amountCents: Math.round(payment.amount * 100),
        method: payment.paymentMethod,
      });
    } catch (ledgerError) {
      logger.warn('Ledger anchor failed (non-blocking)', {
        tenantId,
        paymentId: payment.id,
        error: ledgerError instanceof Error ? ledgerError.message : String(ledgerError),
      });
    }

    return payment;
  } catch (error) {
    logger.error('Failed to create payment', error as Error, {
      tenantId,
      studentId: data.studentId,
      amount: data.amount,
    });
    throw error;
  }
};

export const updatePayment = async (
  id: string,
  tenantId: string,
  data: Partial<Payment>,
  userId?: string
): Promise<Payment> => {
  logger.info('Updating payment', {
    tenantId,
    paymentId: id,
    updateFields: Object.keys(data),
  });

  try {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.amount !== undefined) {
      fields.push(`amount = $${paramCount++}`);
      values.push(data.amount);
    }
    if (data.paymentMethod !== undefined) {
      fields.push(`payment_method = $${paramCount++}`);
      values.push(data.paymentMethod);
    }
    if (data.date !== undefined) {
      fields.push(`date = $${paramCount++}`);
      values.push(data.date);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.bsvTransactionId !== undefined) {
      fields.push(`bsv_transaction_id = $${paramCount++}`);
      values.push(data.bsvTransactionId);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(data.notes);
    }
    if (data.referenceNumber !== undefined) {
      fields.push(`reference_number = $${paramCount++}`);
      values.push(data.referenceNumber);
    }
    if (userId) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(userId);
    }

    if (fields.length === 0) {
      logger.warn('No fields to update in payment', { tenantId, paymentId: id });
      throw new AppError('No fields to update', 400);
    }

    values.push(id, tenantId);

    const result = await query(
      `UPDATE payments SET ${fields.join(', ')}
       WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
       RETURNING *, (SELECT e.student_id FROM enrollments e WHERE e.id = payments.enrollment_id) AS student_id`,
      values
    );

    if (result.rows.length === 0) {
      logger.warn('Payment not found for update', { tenantId, paymentId: id });
      throw new AppError('Payment not found', 404);
    }

    logger.info('Payment updated successfully', {
      tenantId,
      paymentId: id,
      updatedFields: Object.keys(data),
    });

    return keysToCamel(result.rows[0]) as Payment;
  } catch (error) {
    logger.error('Failed to update payment', error as Error, {
      tenantId,
      paymentId: id,
    });
    throw error;
  }
};

export const markPaymentAsReceived = async (
  id: string,
  tenantId: string,
  bsvTransactionId?: string
): Promise<Payment> => {
  logger.info('Marking payment as received', {
    tenantId,
    paymentId: id,
    bsvTransactionId: bsvTransactionId || 'none',
  });

  const fields: string[] = ['status = $3', 'confirmation_date = NOW()'];
  const values: any[] = [id, tenantId, 'confirmed'];
  let paramCount = 4;

  if (bsvTransactionId) {
    fields.push(`bsv_transaction_id = $${paramCount++}`);
    values.push(bsvTransactionId);
  }

  const result = await query(
    `UPDATE payments SET ${fields.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING *, (SELECT e.student_id FROM enrollments e WHERE e.id = payments.enrollment_id) AS student_id`,
    values
  );

  if (result.rows.length === 0) {
    logger.warn('Payment not found for marking as received', { tenantId, paymentId: id });
    throw new AppError('Payment not found', 404);
  }

  logger.info('Payment marked as received successfully', {
    tenantId,
    paymentId: id,
  });

  return keysToCamel(result.rows[0]) as Payment;
};

export const refundPayment = async (
  id: string,
  tenantId: string
): Promise<Payment> => {
  logger.info('Refunding payment', { tenantId, paymentId: id });

  const result = await query(
    `UPDATE payments SET status = 'refunded'
     WHERE id = $1 AND tenant_id = $2
     RETURNING *, (SELECT e.student_id FROM enrollments e WHERE e.id = payments.enrollment_id) AS student_id`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.warn('Payment not found for refund', { tenantId, paymentId: id });
    throw new AppError('Payment not found', 404);
  }

  logger.info('Payment refunded successfully', { tenantId, paymentId: id });

  return keysToCamel(result.rows[0]) as Payment;
};

export const deletePayment = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Deleting payment', { tenantId, paymentId: id });

  const result = await query(
    'DELETE FROM payments WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.warn('Payment not found for deletion', { tenantId, paymentId: id });
    throw new AppError('Payment not found', 404);
  }

  logger.info('Payment deleted successfully', { tenantId, paymentId: id });
};
