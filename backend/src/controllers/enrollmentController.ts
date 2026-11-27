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
import * as transcriptService from '../services/transcriptService';
import * as adjustmentService from '../services/adjustmentService';
import { checkBookingEligibility } from '../services/bookingEligibilityService';
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

/**
 * @route   GET /api/v1/enrollments/:id/withdrawal-transcript
 * @desc    Generate a training-received transcript (13 CCR §340.27) for a
 *          driver_training enrollment that isn't completed. Authenticated
 *          (PII-bearing) - unlike the public .ics calendar feed, this is
 *          not a token-based public download.
 * @access  Private
 */
export const getWithdrawalTranscript = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const transcript = await transcriptService.generateWithdrawalTranscript(id, tenantId);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${transcript.filename}"`);
  res.send(transcript.content);
});

/**
 * @route   POST /api/v1/enrollments/:id/payment-arrangement
 * @desc    Set (or overwrite) the "payment arrangement" marker on an
 *          enrollment - informational only, no booking-rule behavior is
 *          wired to it (payments-adjustments, explicit scope limit).
 * @access  Private (owner/admin)
 */
export const setPaymentArrangement = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user!.userId;
  const { id } = req.params;
  const { note } = req.body;

  const arrangement = await adjustmentService.setPaymentArrangement(tenantId, id, userId, note ?? null);

  res.json({
    success: true,
    data: arrangement,
    message: 'Payment arrangement set',
  });
});

/**
 * @route   DELETE /api/v1/enrollments/:id/payment-arrangement
 * @desc    Clears the "payment arrangement" marker on an enrollment.
 * @access  Private (owner/admin)
 */
export const clearPaymentArrangement = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  await adjustmentService.clearPaymentArrangement(tenantId, id);

  res.json({
    success: true,
    data: null,
    message: 'Payment arrangement cleared',
  });
});

/**
 * @route   GET /api/v1/enrollments/:id/booking-eligibility?lessonCost=...
 * @desc    Pre-submit check (payment-before-booking) - SmartBookingForm
 *          calls this before the user clicks "Book lesson" to show the
 *          "Payment needed" banner or the payment-arrangement note ahead
 *          of time. Uses the exact same bookingEligibilityService function
 *          the create path's row-locked check is built on (the unlocked
 *          read-only variant here, since there is nothing to write yet) -
 *          never a second, divergent definition of "eligible."
 * @access  Private - any authenticated tenant user (matches
 *          getWithdrawalTranscript's own no-extra-role-gate precedent;
 *          this is a read, not a write, and every booking entry point
 *          needs to call it, including instructor-initiated bookings).
 */
export const getBookingEligibility = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;
  const lessonCost = Number(req.query.lessonCost);

  if (req.query.lessonCost === undefined || Number.isNaN(lessonCost) || lessonCost < 0) {
    throw new AppError('lessonCost query parameter is required and must be a non-negative number', 400);
  }

  const enrollment = await enrollmentService.getEnrollmentById(id, tenantId);
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  const eligibility = await checkBookingEligibility(tenantId, id, lessonCost);

  res.json({
    success: true,
    data: eligibility,
  });
});
