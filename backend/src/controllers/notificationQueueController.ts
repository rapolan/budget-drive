/**
 * Notification Queue Controller
 *
 * The outbound email delivery pipeline surface (notification_queue) - see
 * notificationQueueService.ts for the distinction from notificationService.ts
 * (in-app alerts, the `notifications` table).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../middleware/errorHandler';
import { getTenantId } from '../middleware/tenantContext';
import * as notificationQueueService from '../services/notificationQueueService';
import { notificationProcessor } from '../services/notificationProcessor';
import { createLogger } from '../utils/logger';

const logger = createLogger('NotificationQueueController');

/**
 * @route   GET /api/v1/notifications/queue
 * @desc    Pending/sent/failed/cancelled notification_queue rows for the tenant
 * @access  Private
 */
export const getQueue = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { status, limit = '100', offset = '0' } = req.query;

  const { data, total } = await notificationQueueService.getNotificationQueue(
    tenantId,
    status as string | undefined,
    { limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) }
  );

  res.json({
    success: true,
    data,
    pagination: {
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      hasMore: parseInt(offset as string, 10) + parseInt(limit as string, 10) < total,
    },
  });
});

/**
 * @route   GET /api/v1/notifications/history
 * @desc    Sent/failed notification_queue rows plus tenant-wide stats
 * @access  Private
 */
export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { startDate, endDate, limit = '100', offset = '0' } = req.query;

  const { data, stats } = await notificationQueueService.getNotificationHistory(
    tenantId,
    startDate as string | undefined,
    endDate as string | undefined,
    { limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) }
  );

  res.json({
    success: true,
    data,
    stats,
    pagination: {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    },
  });
});

/**
 * @route   POST /api/v1/notifications/process
 * @desc    Manually trigger the notification processor (dev/admin tooling -
 *          there is no automatic scheduler wired up; the cron that used to
 *          do this (jobs/notificationCron.ts) was confirmed dead and removed)
 * @access  Private
 */
export const processQueue = asyncHandler(async (_req: Request, res: Response) => {
  logger.info('Manual notification processing triggered');

  await notificationProcessor.processQueue();

  res.json({
    success: true,
    message: 'Notification queue processed successfully',
  });
});

/**
 * @route   POST /api/v1/notifications/:id/retry
 * @desc    Retry a failed notification
 * @access  Private
 */
export const retryNotification = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  logger.info('Retrying notification', { notificationId: id });

  await notificationProcessor.retryNotification(id);

  res.json({
    success: true,
    message: 'Notification retried successfully',
  });
});

/**
 * @route   POST /api/v1/notifications/test
 * @desc    Create a test notification against a random scheduled lesson (dev/admin tooling)
 * @access  Private
 */
export const createTestNotification = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { email, sendImmediately = false } = req.body;

  if (!email) {
    throw new AppError('Email address is required', 400);
  }

  const lessonId = await notificationQueueService.getRandomScheduledLessonId(tenantId);
  if (!lessonId) {
    throw new AppError('No scheduled lessons found for testing', 404);
  }

  const scheduledTime = sendImmediately ? new Date() : new Date(Date.now() + 60000);
  const created = await notificationQueueService.createTestNotification(tenantId, lessonId, email, scheduledTime);

  res.json({
    success: true,
    message: 'Test notification created successfully',
    data: {
      id: created.id,
      scheduledSendTime: created.scheduledSendTime,
      willSendIn: sendImmediately ? 'immediately (within 5 minutes)' : '1 minute',
    },
  });
});
