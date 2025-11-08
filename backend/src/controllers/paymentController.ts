/**
 * Payment Controller
 * HTTP handlers for payment-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as paymentService from '../services/paymentService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/payments
 * @desc    Get all payments for current tenant (paginated)
 * @access  Private
 */
export const getAllPayments = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const result = await paymentService.getAllPayments(tenantId, page, limit);

  res.json({
    success: true,
    data: result.payments,
    pagination: {
      page: result.page,
      limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/**
 * @route   GET /api/v1/payments/:id
 * @desc    Get payment by ID
 * @access  Private
 */
export const getPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const payment = await paymentService.getPaymentById(id, tenantId);

  if (!payment) {
    res.status(404).json({
      success: false,
      error: 'Payment not found',
    });
    return;
  }

  res.json({
    success: true,
    data: payment,
  });
});

/**
 * @route   POST /api/v1/payments
 * @desc    Create new payment
 * @access  Private
 */
export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const payment = await paymentService.createPayment(tenantId, req.body);

  res.status(201).json({
    success: true,
    data: payment,
    message: 'Payment created successfully',
  });
});

/**
 * @route   PUT /api/v1/payments/:id
 * @desc    Update payment
 * @access  Private
 */
export const updatePayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const payment = await paymentService.updatePayment(id, tenantId, req.body);

  res.json({
    success: true,
    data: payment,
    message: 'Payment updated successfully',
  });
});

/**
 * @route   DELETE /api/v1/payments/:id
 * @desc    Delete payment
 * @access  Private
 */
export const deletePayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await paymentService.deletePayment(id, tenantId);

  res.json({
    success: true,
    message: 'Payment deleted successfully',
  });
});

/**
 * @route   GET /api/v1/payments/student/:studentId
 * @desc    Get payments by student
 * @access  Private
 */
export const getPaymentsByStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { studentId } = req.params;

  const payments = await paymentService.getPaymentsByStudent(tenantId, studentId);

  res.json({
    success: true,
    data: payments,
    count: payments.length,
  });
});

/**
 * @route   GET /api/v1/payments/lesson/:lessonId
 * @desc    Get payments by lesson
 * @access  Private
 */
export const getPaymentsByLesson = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { lessonId } = req.params;

  const payments = await paymentService.getPaymentsByLesson(tenantId, lessonId);

  res.json({
    success: true,
    data: payments,
    count: payments.length,
  });
});

/**
 * @route   GET /api/v1/payments/status/:status
 * @desc    Get payments by status
 * @access  Private
 */
export const getPaymentsByStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { status } = req.params;

  const payments = await paymentService.getPaymentsByStatus(
    tenantId,
    status as 'pending' | 'completed' | 'failed' | 'refunded'
  );

  res.json({
    success: true,
    data: payments,
    count: payments.length,
  });
});

/**
 * @route   GET /api/v1/payments/method/:paymentMethod
 * @desc    Get payments by payment method
 * @access  Private
 */
export const getPaymentsByPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { paymentMethod } = req.params;

  const payments = await paymentService.getPaymentsByPaymentMethod(tenantId, paymentMethod);

  res.json({
    success: true,
    data: payments,
    count: payments.length,
  });
});

/**
 * @route   POST /api/v1/payments/:id/received
 * @desc    Mark payment as received
 * @access  Private
 */
export const markPaymentAsReceived = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const { bsvTransactionId } = req.body;

  const payment = await paymentService.markPaymentAsReceived(
    id,
    tenantId,
    bsvTransactionId
  );

  res.json({
    success: true,
    data: payment,
    message: 'Payment marked as received',
  });
});

/**
 * @route   POST /api/v1/payments/:id/refund
 * @desc    Refund payment
 * @access  Private
 */
export const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const payment = await paymentService.refundPayment(id, tenantId);

  res.json({
    success: true,
    data: payment,
    message: 'Payment refunded successfully',
  });
});
