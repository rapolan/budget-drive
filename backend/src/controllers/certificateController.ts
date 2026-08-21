/**
 * Certificate Controller
 * HTTP handlers for certificate issuance tracking (13 CCR §340.27).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as certificateService from '../services/certificateService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/certificates/worklist
 * @desc    Completed driver_training enrollments, minors as of their
 *          completion date, with no certificate recorded yet
 * @access  Private
 */
export const getWorklist = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const worklist = await certificateService.getAwaitingCertificateWorklist(tenantId);

  res.json({
    success: true,
    data: worklist,
  });
});

/**
 * @route   GET /api/v1/certificates/counts
 * @desc    Issued/void tile counts for the Certificates page
 * @access  Private
 */
export const getCounts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const counts = await certificateService.getIssuedVoidCounts(tenantId);

  res.json({
    success: true,
    data: counts,
  });
});

/**
 * @route   POST /api/v1/enrollments/:enrollmentId/certificate
 * @desc    Record a certificate against a completed enrollment - callable
 *          from the worklist or directly from any completed enrollment on
 *          a student record, regardless of age
 * @access  Private
 */
export const recordCertificate = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { enrollmentId } = req.params;

  const certificate = await certificateService.recordCertificate(enrollmentId, tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: certificate,
    message: 'Certificate recorded',
  });
});

/**
 * @route   POST /api/v1/certificates/void
 * @desc    Record a spoiled/lost/stolen certificate (§340.27/DL 803
 *          accounting) - no enrollment, no student
 * @access  Private
 */
export const recordVoid = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;

  const certificate = await certificateService.recordVoid(tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: certificate,
    message: 'Void certificate recorded',
  });
});
