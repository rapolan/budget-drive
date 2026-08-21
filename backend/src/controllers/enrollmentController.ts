/**
 * Enrollment Controller
 * HTTP handlers for program-enrollment endpoints. Flat /enrollments/:id/...
 * routes - an enrollment id is already tenant-unique, so no parent-student
 * ownership check is needed here (unlike /students/:id/enrollments' nested
 * list/create, which lives in studentController).
 */

import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import * as enrollmentService from '../services/enrollmentService';
import * as studentService from '../services/studentService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   GET /api/v1/enrollments/:id
 * @desc    Get a single enrollment with progress and payment summary
 * @access  Private
 */
export const getEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const enrollment = await enrollmentService.getEnrollmentById(id, tenantId);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  const student = await studentService.getStudentById(enrollment.studentId, tenantId);
  if (!student) {
    throw new AppError('Student not found', 404);
  }

  const withProgress = await enrollmentService.getEnrollmentByIdWithProgress(id, tenantId, student);

  res.json({
    success: true,
    data: withProgress,
  });
});

/**
 * @route   PATCH /api/v1/enrollments/:id
 * @desc    Update an enrollment's program fields
 * @access  Private
 */
export const updateEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const enrollment = await enrollmentService.updateEnrollment(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: enrollment,
    message: 'Enrollment updated successfully',
  });
});

/**
 * @route   POST /api/v1/enrollments/:id/complete
 * @desc    Mark an enrollment's program complete
 * @access  Private
 */
export const completeEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const enrollment = await enrollmentService.markEnrollmentCompleted(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: enrollment,
    message: 'Enrollment marked complete',
  });
});

/**
 * @route   POST /api/v1/enrollments/:id/reopen
 * @desc    Reverse an enrollment completion. Requires a reason (validated at
 *          the route layer) and owner/admin role (requireRole at the route
 *          layer) - this is a guarded write, not a plain undo.
 * @access  Private (owner/admin only)
 */
export const reopenEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const enrollment = await enrollmentService.reopenEnrollment(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: enrollment,
    message: 'Enrollment reopened',
  });
});

/**
 * @route   POST /api/v1/enrollments/:id/withdraw
 * @desc    Withdraw an active enrollment before completion (13 CCR §340.27).
 *          Requires a reason (validated at the route layer) and owner/admin
 *          role (requireRole at the route layer) - same guarded-write shape
 *          as reopen.
 * @access  Private (owner/admin only)
 */
export const withdrawEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  const enrollment = await enrollmentService.withdrawEnrollment(id, tenantId, req.body, userId);

  res.json({
    success: true,
    data: enrollment,
    message: 'Enrollment withdrawn',
  });
});
