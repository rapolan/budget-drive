/**
 * Classroom Controller
 * HTTP handlers for driver education cohort/session scheduling (Phase 3).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as classroomService from '../services/classroomService';
import { getTenantId } from '../middleware/tenantContext';

/**
 * @route   POST /api/v1/classroom/cohorts
 * @desc    Create a driver education cohort with its 4 curriculum-day sessions
 * @access  Private
 */
export const createCohort = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;

  const cohort = await classroomService.createCohort(tenantId, req.body, userId);

  res.status(201).json({
    success: true,
    data: cohort,
    message: 'Cohort created',
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts
 * @desc    List every cohort for this tenant, newest first, each with its sessions
 * @access  Private
 */
export const getCohorts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const cohorts = await classroomService.getCohorts(tenantId);

  res.json({
    success: true,
    data: cohorts,
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts/:id
 * @desc    A single cohort with its sessions and enrolled count
 * @access  Private
 */
export const getCohortById = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const cohort = await classroomService.getCohortById(id, tenantId);
  if (!cohort) {
    res.status(404).json({ success: false, error: 'Cohort not found' });
    return;
  }

  res.json({
    success: true,
    data: cohort,
  });
});

/**
 * @route   PATCH /api/v1/classroom/cohorts/:id
 * @desc    Update a cohort's name, teacher, capacity, or status
 * @access  Private
 */
export const updateCohort = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const cohort = await classroomService.updateCohort(id, tenantId, req.body);

  res.json({
    success: true,
    data: cohort,
    message: 'Cohort updated',
  });
});

/**
 * @route   GET /api/v1/classroom/cohorts/:id/gaps
 * @desc    Students enrolled in this cohort who still have unattended
 *          curriculum days - the re-slot-for-make-up list, most useful
 *          right after cancelling a cohort
 * @access  Private
 */
export const getCohortAttendanceGaps = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const gaps = await classroomService.getCohortAttendanceGaps(id, tenantId);

  res.json({
    success: true,
    data: gaps,
  });
});
