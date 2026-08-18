/**
 * Dashboard Routes
 * Aggregation endpoints for Dashboard-shaped queries that can't be answered
 * purely from already-fetched REST lists (e.g. notification join state).
 */

import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { validateUUID } from '../middleware/validate';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

router.get('/dashboard/no-show-alerts', dashboardController.getNoShowAlerts);

router.post(
  '/dashboard/alerts/:notificationId/dismiss',
  validateUUID('notificationId'),
  dashboardController.dismissAlert
);

router.get('/dashboard/review-queue', dashboardController.getReviewQueue);

router.post(
  '/dashboard/review-queue/:date/complete-all',
  dashboardController.completeAllInDay
);

export default router;
