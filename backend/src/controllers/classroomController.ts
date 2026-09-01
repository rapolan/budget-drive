/**
 * Classroom Controller
 * HTTP handlers for driver education cohort/session scheduling (Phase 3).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as classroomService from '../services/classroomService';
import * as classroomAttendanceService from '../services/classroomAttendanceService';
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

/**
 * @route   GET /api/v1/classroom/sessions/:id/roster
 * @desc    One session's full attendance roster - this cohort's own
 *          enrolled students plus any make-up guests already marked here
 * @access  Private
 */
export const getSessionRoster = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const roster = await classroomAttendanceService.getSessionRoster(id, tenantId);

  res.json({
    success: true,
    data: roster,
  });
});

/**
 * @route   POST /api/v1/classroom/sessions/:id/attendance
 * @desc    Mark one student present/absent for one specific session -
 *          callable from any cohort's roster, not just the student's own
 *          home cohort (this is how a cross-cohort make-up is recorded)
 * @access  Private
 */
export const recordAttendance = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const userId = req.user?.userId;
  const { id } = req.params;

  await classroomAttendanceService.recordAttendance(id, tenantId, req.body, userId);

  res.json({
    success: true,
    message: 'Attendance recorded',
  });
});

/**
 * @route   POST /api/v1/classroom/cohorts/:id/join
 * @desc    Join a student's driver_education enrollment to a cohort as
 *          their home cohort (the student modal's enrollment flow) -
 *          rejects if the cohort is at capacity or the enrollment already
 *          has a home cohort
 * @access  Private
 */
export const joinCohort = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const { id } = req.params;

  const cohortEnrollment = await classroomService.joinCohort(id, tenantId, req.body.enrollmentId);

  res.status(201).json({
    success: true,
    data: cohortEnrollment,
    message: 'Joined cohort',
  });
});
