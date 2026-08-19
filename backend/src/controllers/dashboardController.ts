/**
 * Dashboard Controller
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getTenantId } from '../middleware/tenantContext';
import * as dashboardService from '../services/dashboardService';
import * as notificationService from '../services/notificationService';
import * as lessonService from '../services/lessonService';

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

/**
 * @route   GET /api/v1/dashboard/license-expiry-alerts
 * @desc    Active instructors with a license expiring within 180 days or
 *          already expired
 * @access  Private
 */
export const getLicenseExpiryAlerts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const alerts = await dashboardService.getInstructorsWithExpiringLicenses(tenantId);

  res.json({
    success: true,
    data: alerts,
  });
});

/**
 * @route   GET /api/v1/dashboard/review-queue
 * @desc    Past-due 'scheduled' lessons grouped by day, most overdue first
 * @access  Private
 */
export const getReviewQueue = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);

  const instructorId =
    req.user?.role === 'instructor' && req.user?.instructorId ? req.user.instructorId : undefined;

  const days = await dashboardService.getLessonsNeedingReview(tenantId, instructorId);
  const totalCount = days.reduce((sum, day) => sum + day.lessons.length, 0);

  res.json({
    success: true,
    data: { days, totalCount },
  });
});

/**
 * @route   POST /api/v1/dashboard/review-queue/:date/complete-all
 * @desc    Mark every lesson in one review-queue day group as completed
 * @access  Private
 */
export const completeAllInDay = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { date } = req.params;

  const instructorId =
    req.user?.role === 'instructor' && req.user?.instructorId ? req.user.instructorId : undefined;

  const days = await dashboardService.getLessonsNeedingReview(tenantId, instructorId);
  const day = days.find(d => d.date === date);

  const completed = [];
  for (const lesson of day?.lessons ?? []) {
    completed.push(await lessonService.completeLesson(lesson.id, tenantId, userId));
  }

  res.json({
    success: true,
    data: completed,
    message: `${completed.length} lesson(s) marked as completed`,
  });
});
