/**
 * Dashboard Controller
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getTenantId } from '../middleware/tenantContext';
import * as dashboardService from '../services/dashboardService';
import * as notificationService from '../services/notificationService';

/**
 * @route   GET /api/v1/dashboard/no-show-alerts
 * @desc    Students with an active (undismissed) no-show follow-up alert
 * @access  Private
 */
export const getNoShowAlerts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const alerts = await dashboardService.getStudentsWithActiveNoShowAlert(tenantId);

  res.json({
    success: true,
    data: alerts,
  });
});

/**
 * @route   POST /api/v1/dashboard/alerts/:notificationId/dismiss
 * @desc    Dismiss a dashboard alert notification
 * @access  Private
 */
export const dismissAlert = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { notificationId } = req.params;

  await notificationService.dismissNotification(notificationId, tenantId);

  res.json({
    success: true,
    message: 'Alert dismissed',
  });
});
