import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import * as notificationQueueController from '../controllers/notificationQueueController';

const router = express.Router();

// All notification routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenantContext);

/**
 * GET /api/notifications/queue
 * Get pending/sent/failed notifications
 */
router.get('/queue', notificationQueueController.getQueue);

/**
 * GET /api/notifications/history
 * Get notification history with stats
 */
router.get('/history', notificationQueueController.getHistory);

/**
 * POST /api/notifications/process
 * Manually trigger notification processor (for testing/admin)
 */
router.post('/process', notificationQueueController.processQueue);

/**
 * POST /api/notifications/:id/retry
 * Retry a failed notification
 */
router.post('/:id/retry', notificationQueueController.retryNotification);

/**
 * POST /api/notifications/test
 * Create a test notification (for development/testing)
 */
router.post('/test', notificationQueueController.createTestNotification);

export default router;
