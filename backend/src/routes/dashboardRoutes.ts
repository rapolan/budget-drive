/**
 * Dashboard Routes
 * Aggregation endpoints for Dashboard-shaped queries that can't be answered
 * purely from already-fetched REST lists (e.g. notification join state).
 */

import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requireRole } from '../middleware/requireRole';
import { validateUUID } from '../middleware/validate';

const router = Router();

router.use(authenticate);
router.use(requireTenantContext);

router.get('/dashboard/no-show-alerts', dashboardController.getNoShowAlerts);

router.get('/dashboard/license-expiry-alerts', dashboardController.getLicenseExpiryAlerts);

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

// Owner/admin/staff only - an instructor's own Dashboard/My Today shell
// has no getting-started checklist, so this never needs to be reachable
// by that role.
router.get(
  '/dashboard/getting-started-counts',
  requireRole('owner', 'admin', 'staff'),
  dashboardController.getGettingStartedCounts
);

export default router;
