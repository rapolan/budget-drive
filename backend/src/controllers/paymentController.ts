/**
 * Payment Controller
 * HTTP handlers for payment-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import * as paymentService from '../services/paymentService';
import * as paymentReportingService from '../services/paymentReportingService';
import * as adjustmentService from '../services/adjustmentService';
import { getTenantId } from '../middleware/tenantContext';
import { csvCell } from '../utils/csvFormatting';

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
  const userId = req.user?.userId;

  const payment = await paymentService.createPayment(tenantId, req.body, userId);

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
  const userId = req.user?.userId;
  const { id } = req.params;

  const payment = await paymentService.updatePayment(id, tenantId, req.body, userId);

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

  // Payments-adjustments: attach each payment's own adjustments (empty
  // array for an unadjusted payment - renders exactly as it did before
  // this phase) plus the derived display status and net paid, so the
  // history modal never needs a second round trip per payment.
  const adjustmentsByPayment = await adjustmentService.getAdjustmentsForPayments(
    payments.map((p) => p.id),
    tenantId
  );
  const paymentsWithAdjustments = payments.map((payment) => {
    const adjustments = adjustmentsByPayment.get(payment.id) ?? [];
    return {
      ...payment,
      adjustments,
      netPaid: adjustmentService.computeNetPaid(Number(payment.amount), adjustments, payment.status),
      displayStatus: adjustmentService.derivePaymentAdjustmentStatus(Number(payment.amount), adjustments, payment.status),
    };
  });

  res.json({
    success: true,
    data: paymentsWithAdjustments,
    count: paymentsWithAdjustments.length,
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
 * @route   POST /api/v1/payments/:id/adjustments
 * @desc    Create a refund or void adjustment against a payment
 *          (payments-adjustments - replaces the old in-place refund flip
 *          and the hard delete). owner/admin only - enforced by
 *          requireRole at the route layer, same as every other
 *          payments-adjustments write endpoint.
 * @access  Private (owner/admin)
 */
export const createPaymentAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const userId = req.user!.userId;
  const { adjustmentType, amount, reasonCode, note } = req.body;

  if (adjustmentType !== 'refund' && adjustmentType !== 'void') {
    throw new AppError('adjustmentType must be "refund" or "void"', 400);
  }

  const adjustment = await adjustmentService.createAdjustment(tenantId, id, userId, {
    adjustmentType,
    amount,
    reasonCode,
    note,
  });

  res.status(201).json({
    success: true,
    data: adjustment,
    message: adjustmentType === 'void' ? 'Payment voided successfully' : 'Refund recorded successfully',
  });
});

/**
 * @route   POST /api/v1/payments/:id/refund
 * @desc    Legacy refund route - kept for backward compatibility, but now
 *          creates an append-only adjustment (via the same
 *          adjustmentService.createAdjustment as the real endpoint above)
 *          instead of flipping payments.status in place. Requires the
 *          same body shape (amount, reasonCode, note) - there is no
 *          longer an id-only refund, since an amount and a reason are
 *          both required by the new model.
 * @access  Private (owner/admin)
 */
export const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const userId = req.user!.userId;
  const { amount, reasonCode, note } = req.body;

  const adjustment = await adjustmentService.createAdjustment(tenantId, id, userId, {
    adjustmentType: 'refund',
    amount,
    reasonCode,
    note,
  });

  res.json({
    success: true,
    data: adjustment,
    message: 'Refund recorded successfully',
  });
});

/**
 * @route   GET /api/v1/payments/period-summary?start=&end=
 * @desc    Collected/Refunded/Net/Outstanding/Paid-not-yet-scheduled for a
 *          date range, plus a collected-by-method breakdown. Validated by
 *          validateDateRangeQuery at the route layer.
 * @access  Private (owner/admin/staff)
 */
export const getPeriodSummary = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const start = req.query.start as string;
  const end = req.query.end as string;

  const summary = await paymentReportingService.getPaymentPeriodSummary(tenantId, start, end);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * @route   GET /api/v1/payments/who-owes-you
 * @desc    Enrollments with a positive outstanding balance, aged by the
 *          oldest completed (already-happened) lesson, each with its last
 *          payment date/amount.
 * @access  Private (owner/admin/staff)
 */
export const getWhoOwesYou = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const rows = await paymentReportingService.getWhoOwesYou(tenantId);

  res.json({
    success: true,
    data: rows,
  });
});

/**
 * @route   GET /api/v1/payments/:id/receipt
 * @desc    Everything a printable receipt needs for one payment (receipt
 *          number, student, amount, method, what it applied to, and the
 *          enrollment's current running totals).
 * @access  Private (owner/admin/staff)
 */
export const getPaymentReceipt = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const receipt = await paymentReportingService.getPaymentReceiptData(tenantId, id);

  if (!receipt) {
    throw new AppError('Payment not found', 404);
  }

  res.json({
    success: true,
    data: receipt,
  });
});

/**
 * @route   GET /api/v1/payments/export?start=&end=
 * @desc    CSV export of payments within a date range (date, student,
 *          amount, method, status, reference, receipt number). Validated
 *          by validateDateRangeQuery at the route layer.
 * @access  Private (owner/admin/staff)
 */
export const exportPaymentsCsv = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const start = req.query.start as string;
  const end = req.query.end as string;

  const rows = await paymentReportingService.getPaymentsForExport(tenantId, start, end);

  const header = ['Row Type', 'Date', 'Student', 'Amount', 'Method', 'Status', 'Reason', 'Reference', 'Receipt Number'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.rowType,
        row.date,
        csvCell(row.studentName),
        row.amount.toFixed(2),
        row.paymentMethod ?? '',
        row.status,
        row.reasonCode ?? '',
        csvCell(row.referenceNumber),
        row.receiptNumber,
      ].join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payments-${start}-to-${end}.csv"`);
  res.send(lines.join('\r\n'));
});
