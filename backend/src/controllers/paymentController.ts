/**
 * Payment Controller
 * HTTP handlers for payment-related endpoints
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import * as paymentService from '../services/paymentService';
import * as paymentReportingService from '../services/paymentReportingService';
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

  const csvEscape = (value: string | number | null): string => {
    const str = value === null ? '' : String(value);
    // Quote whenever the field contains a comma, a double quote, or a
    // newline - doubling any embedded double quote, the standard CSV
    // escaping rule (RFC 4180). A student's full name is free text and
    // could legitimately contain a comma (e.g. "Smith, Jr."), so this is
    // not a hypothetical case to skip.
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = ['Date', 'Student', 'Amount', 'Method', 'Status', 'Reference', 'Receipt Number'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.date,
        csvEscape(row.studentName),
        row.amount.toFixed(2),
        row.paymentMethod,
        row.status,
        csvEscape(row.referenceNumber),
        row.receiptNumber,
      ].join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payments-${start}-to-${end}.csv"`);
  res.send(lines.join('\r\n'));
});
