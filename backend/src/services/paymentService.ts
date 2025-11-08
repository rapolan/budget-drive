/**
 * Payment Service
 * Business logic for payment management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query } from '../config/database';
import { Payment } from '../types';
import { AppError } from '../middleware/errorHandler';

export const getAllPayments = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ payments: Payment[]; total: number; page: number; totalPages: number }> => {
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
    `SELECT * FROM payments
     WHERE tenant_id = $1
     ORDER BY payment_date DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset]
  );

  return {
    payments: result.rows as Payment[],
    total,
    page,
    totalPages,
  };
};

export const getPaymentById = async (
  id: string,
  tenantId: string
): Promise<Payment | null> => {
  const result = await query(
    'SELECT * FROM payments WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows.length > 0 ? (result.rows[0] as Payment) : null;
};

export const getPaymentsByStudent = async (
  tenantId: string,
  studentId: string
): Promise<Payment[]> => {
  const result = await query(
    `SELECT * FROM payments
     WHERE tenant_id = $1 AND student_id = $2
     ORDER BY payment_date DESC`,
    [tenantId, studentId]
  );
  return result.rows as Payment[];
};

export const getPaymentsByLesson = async (
  tenantId: string,
  lessonId: string
): Promise<Payment[]> => {
  const result = await query(
    `SELECT * FROM payments
     WHERE tenant_id = $1 AND lesson_id = $2
     ORDER BY payment_date DESC`,
    [tenantId, lessonId]
  );
  return result.rows as Payment[];
};

export const getPaymentsByStatus = async (
  tenantId: string,
  status: 'pending' | 'completed' | 'failed' | 'refunded'
): Promise<Payment[]> => {
  const result = await query(
    `SELECT * FROM payments
     WHERE tenant_id = $1 AND status = $2
     ORDER BY payment_date DESC`,
    [tenantId, status]
  );
  return result.rows as Payment[];
};

export const getPaymentsByPaymentMethod = async (
  tenantId: string,
  paymentMethod: string
): Promise<Payment[]> => {
  const result = await query(
    `SELECT * FROM payments
     WHERE tenant_id = $1 AND payment_method = $2
     ORDER BY payment_date DESC`,
    [tenantId, paymentMethod]
  );
  return result.rows as Payment[];
};

export const createPayment = async (
  tenantId: string,
  data: any
): Promise<Payment> => {
  // Validate that student belongs to tenant
  const studentCheck = await query(
    'SELECT id FROM students WHERE id = $1 AND tenant_id = $2',
    [data.studentId, tenantId]
  );
  if (studentCheck.rows.length === 0) {
    throw new AppError('Student not found or does not belong to this organization', 404);
  }

  // If lesson_id provided, validate it belongs to tenant and student
  if (data.lessonId) {
    const lessonCheck = await query(
      'SELECT id FROM lessons WHERE id = $1 AND tenant_id = $2 AND student_id = $3',
      [data.lessonId, tenantId, data.studentId]
    );
    if (lessonCheck.rows.length === 0) {
      throw new AppError('Lesson not found or does not belong to this student', 404);
    }
  }

  const result = await query(
    `INSERT INTO payments (
      tenant_id, student_id, amount, payment_method, payment_type,
      date, status, bsv_transaction_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      tenantId,
      data.studentId,
      data.amount,
      data.paymentMethod || 'cash',
      data.paymentType || 'lesson_payment',
      data.date || new Date(),
      data.status || 'confirmed',
      data.bsvTransactionId || null,
      data.notes || null,
    ]
  );
  return result.rows[0] as Payment;
};

export const updatePayment = async (
  id: string,
  tenantId: string,
  data: Partial<Payment>
): Promise<Payment> => {
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

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE payments SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }

  return result.rows[0] as Payment;
};

export const markPaymentAsReceived = async (
  id: string,
  tenantId: string,
  bsvTransactionId?: string
): Promise<Payment> => {
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
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }

  return result.rows[0] as Payment;
};

export const refundPayment = async (
  id: string,
  tenantId: string
): Promise<Payment> => {
  const result = await query(
    `UPDATE payments SET status = 'refunded'
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }

  return result.rows[0] as Payment;
};

export const deletePayment = async (
  id: string,
  tenantId: string
): Promise<void> => {
  const result = await query(
    'DELETE FROM payments WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }
};
