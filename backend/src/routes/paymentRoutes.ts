/**
 * Payment Routes
 * API routes for payment management
 */

import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID, validateRequired } from '../middleware/validate';

const router = Router();

// All payment routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Get payments by status (must be before /:id)
router.get(
  '/payments/status/:status',
  paymentController.getPaymentsByStatus
);

// Get payments by payment method (must be before /:id)
router.get(
  '/payments/method/:paymentMethod',
  paymentController.getPaymentsByPaymentMethod
);

// Get payments by student (must be before /:id)
router.get(
  '/payments/student/:studentId',
  validateUUID('studentId'),
  paymentController.getPaymentsByStudent
);

// Get payments by lesson (must be before /:id)
router.get(
  '/payments/lesson/:lessonId',
  validateUUID('lessonId'),
  paymentController.getPaymentsByLesson
);

// Get all payments (paginated)
router.get(
  '/payments',
  paymentController.getAllPayments
);

// Create new payment
router.post(
  '/payments',
  validateRequired(['studentId', 'amount']),
  paymentController.createPayment
);

// Mark payment as received
router.post(
  '/payments/:id/received',
  validateUUID('id'),
  paymentController.markPaymentAsReceived
);

// Refund payment
router.post(
  '/payments/:id/refund',
  validateUUID('id'),
  paymentController.refundPayment
);

// Get payment by ID
router.get(
  '/payments/:id',
  validateUUID('id'),
  paymentController.getPayment
);

// Update payment
router.put(
  '/payments/:id',
  validateUUID('id'),
  paymentController.updatePayment
);

// Delete payment
router.delete(
  '/payments/:id',
  validateUUID('id'),
  paymentController.deletePayment
);

export default router;
