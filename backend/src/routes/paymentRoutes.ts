/**
 * Payment Routes
 * API routes for payment management
 */

import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';
import { validateUUID, validateRequired, validateDateRangeQuery } from '../middleware/validate';

const router = Router();

// All payment routes require authentication and tenant context. This
// router is mounted at the generic API_PREFIX (not a /payments-scoped
// sub-path), so `requireRole` is applied per-route below rather than via
// router.use() - a router.use() gate here would incorrectly intercept
// every OTHER route mounted at the same generic prefix after this router
// (dashboard, calendar-feed, etc.), not just this file's own /payments/*
// routes.
router.use(authenticate);
router.use(requireTenantContext);

// Financial data is admin/staff territory - instructors never see
// payments/balances (that stays admin-only per the instructor-view design).
const paymentsOnly = requireRole('owner', 'admin', 'staff');

// Period summary (collected/refunded/net/outstanding/paid-not-yet-
// scheduled, collected-by-method) - payments-phase1 (must be before /:id)
router.get(
  '/payments/period-summary',
  validateDateRangeQuery('start', 'end'),
  paymentsOnly,
  paymentController.getPeriodSummary
);

// "Who owes you" - payments-phase1 (must be before /:id)
router.get(
  '/payments/who-owes-you',
  paymentsOnly,
  paymentController.getWhoOwesYou
);

// CSV export for a date range - payments-phase1 (must be before /:id)
router.get(
  '/payments/export',
  validateDateRangeQuery('start', 'end'),
  paymentsOnly,
  paymentController.exportPaymentsCsv
);

// Get payments by status (must be before /:id)
router.get(
  '/payments/status/:status',
  paymentsOnly,
  paymentController.getPaymentsByStatus
);

// Get payments by payment method (must be before /:id)
router.get(
  '/payments/method/:paymentMethod',
  paymentsOnly,
  paymentController.getPaymentsByPaymentMethod
);

// Get payments by student (must be before /:id)
router.get(
  '/payments/student/:studentId',
  validateUUID('studentId'),
  paymentsOnly,
  paymentController.getPaymentsByStudent
);

// Get payments by lesson (must be before /:id)
router.get(
  '/payments/lesson/:lessonId',
  validateUUID('lessonId'),
  paymentsOnly,
  paymentController.getPaymentsByLesson
);

// Get all payments (paginated)
router.get(
  '/payments',
  paymentsOnly,
  paymentController.getAllPayments
);

// Create new payment
router.post(
  '/payments',
  validateRequired(['studentId', 'amount']),
  paymentsOnly,
  paymentController.createPayment
);

// Mark payment as received
router.post(
  '/payments/:id/received',
  validateUUID('id'),
  paymentsOnly,
  paymentController.markPaymentAsReceived
);

// Refund payment
router.post(
  '/payments/:id/refund',
  validateUUID('id'),
  paymentsOnly,
  paymentController.refundPayment
);

// Printable receipt data - payments-phase1
router.get(
  '/payments/:id/receipt',
  validateUUID('id'),
  paymentsOnly,
  paymentController.getPaymentReceipt
);

// Get payment by ID
router.get(
  '/payments/:id',
  validateUUID('id'),
  paymentsOnly,
  paymentController.getPayment
);

// Update payment
router.put(
  '/payments/:id',
  validateUUID('id'),
  paymentsOnly,
  paymentController.updatePayment
);

// Delete payment
router.delete(
  '/payments/:id',
  validateUUID('id'),
  paymentsOnly,
  paymentController.deletePayment
);

export default router;
