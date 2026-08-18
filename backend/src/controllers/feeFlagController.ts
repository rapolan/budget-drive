/**
 * Fee Flag Controller
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getTenantId } from '../middleware/tenantContext';
import { AppError } from '../middleware/errorHandler';
import * as feeFlagService from '../services/feeFlagService';

/**
 * @route   GET /api/v1/students/:studentId/fee-flags
 * @desc    A student's outstanding fee flags
 * @access  Private
 */
export const getOutstandingFlagsForStudent = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { studentId } = req.params;

  const flags = await feeFlagService.getOutstandingFlagsForStudent(tenantId, studentId);

  res.json({
    success: true,
    data: flags,
  });
});

/**
 * @route   GET /api/v1/instructors/:instructorId/fee-flags
 * @desc    Fee flags sourced from an instructor's lessons - read-only, never totalled
 * @access  Private
 */
export const getFeeFlagsForInstructor = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { instructorId } = req.params;

  const flags = await feeFlagService.getFeeFlagsForInstructor(tenantId, instructorId);

  res.json({
    success: true,
    data: flags,
  });
});

/**
 * @route   POST /api/v1/fee-flags/:id/waive
 * @desc    Waive a fee flag, recording who and why
 * @access  Private
 */
export const waiveFeeFlag = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    throw new AppError('A reason is required to waive a fee flag', 400);
  }

  const flag = await feeFlagService.waiveFeeFlag(id, tenantId, userId, reason);

  res.json({
    success: true,
    data: flag,
    message: 'Fee flag waived',
  });
});

/**
 * @route   POST /api/v1/fee-flags/:id/record-payment
 * @desc    Convert a fee flag into a real payment record - school-payee only
 * @access  Private
 */
export const recordPaymentForFeeFlag = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const flag = await feeFlagService.recordPaymentForFeeFlag(id, tenantId, userId);

  res.json({
    success: true,
    data: flag,
    message: 'Payment recorded for fee flag',
  });
});
